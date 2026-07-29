'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { DirectoryUser, Participant, RecentParticipant } from '@/lib/types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Picks colleagues from the tenant directory, and accepts a typed address for
 * anyone outside it. Internal picks carry a userId so the invite can reach
 * their in-app inbox; a bare email cannot be notified until SMTP exists, which
 * is why the two are kept distinguishable rather than collapsed to strings.
 */
export default function Participants({ value, onChange, selfEmail, allowExternal = true }: {
  value: Participant[];
  onChange: (next: Participant[]) => void;
  selfEmail?: string;
  /** From the resource's resolved policy; the API refuses these when false. */
  allowExternal?: boolean;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [q, setQ] = useState('');
  const [dir, setDir] = useState<DirectoryUser[]>([]);
  const [recent, setRecent] = useState<RecentParticipant[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // People this user has invited before — the external guests especially,
    // who are not in the directory and would otherwise be retyped each time.
    api.get<RecentParticipant[]>('/bookings/recent-participants').then(setRecent).catch(() => setRecent([]));
  }, []);

  /**
   * Server-backed search, per typed term. A tenant directory can run into the
   * thousands (nipsea alone has 1,700+ active users), far past anything worth
   * loading and filtering client-side against one snapshot — that approach
   * meant anyone outside an arbitrary alphabetical top-50 could never be found
   * no matter what was typed, and got silently treated as an outside guest.
   */
  useEffect(() => {
    const term = q.trim();
    if (!term) { setDir([]); return; }
    let cancelled = false;
    const handle = setTimeout(() => {
      api.get<DirectoryUser[]>(`/users/directory?q=${encodeURIComponent(term)}`)
        .then((rows) => { if (!cancelled) setDir(rows); })
        .catch(() => { if (!cancelled) setDir([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [q]);

  /**
   * Names for already-chosen participants aren't stored on the booking (only
   * userId/email are, see labelFor below) and won't be sitting in `dir` once
   * search has moved on to a different term — resolved once per email here so
   * editing an existing booking still shows real names, not bare addresses.
   */
  const [known, setKnown] = useState<Map<string, DirectoryUser>>(new Map());
  useEffect(() => {
    const missing = value.filter((p) => !p.name && !known.has(p.email.toLowerCase()));
    if (!missing.length) return;
    Promise.all(missing.map((p) =>
      api.get<DirectoryUser[]>(`/users/directory?q=${encodeURIComponent(p.email)}`).catch(() => [] as DirectoryUser[]),
    )).then((results) => {
      setKnown((m) => {
        const next = new Map(m);
        for (const row of results.flat()) next.set(row.email.toLowerCase(), row);
        return next;
      });
    });
  }, [value, known]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const chosen = useMemo(() => new Set(value.map((p) => p.email.toLowerCase())), [value]);

  /**
   * Participants stored on a booking only carry userId/email — `name` is a
   * display field that never goes to the API. Look the name back up so editing
   * an existing booking shows "Bob Builder", not a bare address.
   */
  const labelFor = useCallback((p: Participant) => {
    if (p.name) return p.name;
    const hit = dir.find((u) => u.id === p.userId || u.email.toLowerCase() === p.email.toLowerCase())
      ?? known.get(p.email.toLowerCase());
    return hit?.fullName ?? p.email;
  }, [dir, known]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Empty box shows the "recently invited" list instead of arbitrary
    // colleagues; the directory is searched once the user types.
    if (!term) return [];
    return dir
      .filter((u) => u.email.toLowerCase() !== selfEmail?.toLowerCase())
      .filter((u) => !chosen.has(u.email.toLowerCase()))
      .filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [dir, q, chosen, selfEmail]);

  /**
   * Previously-invited people to offer. When the box is empty these are the
   * headline suggestions; when searching, only the ones the directory list
   * does not already cover (i.e. external guests) are added, so nothing shows
   * twice. External guests are dropped when the room forbids them.
   */
  const recentMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const dirEmails = new Set(matches.map((u) => u.email.toLowerCase()));
    return recent
      .filter((r) => r.email.toLowerCase() !== selfEmail?.toLowerCase())
      .filter((r) => !chosen.has(r.email.toLowerCase()))
      .filter((r) => allowExternal || !r.external)
      .filter((r) => !term || `${r.name ?? ''} ${r.email}`.toLowerCase().includes(term))
      // While searching, skip anyone already shown in the directory results.
      .filter((r) => !term || !dirEmails.has(r.email.toLowerCase()))
      .slice(0, 6);
  }, [recent, q, chosen, selfEmail, allowExternal, matches]);

  const typedIsEmail = EMAIL.test(q.trim());
  // A typed address is by definition someone outside the directory, so when the
  // policy forbids external guests there is nothing to offer.
  const canAddTyped = allowExternal && typedIsEmail && !chosen.has(q.trim().toLowerCase());
  const blockedExternal = !allowExternal && typedIsEmail;

  function add(p: Participant) {
    onChange([...value, p]);
    setQ('');
    setOpen(false);
  }
  function addRecent(r: RecentParticipant) {
    add(r.userId ? { userId: r.userId, email: r.email, name: r.name ?? undefined } : { email: r.email, external: true });
  }
  function remove(email: string) {
    onChange(value.filter((p) => p.email !== email));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Enter inside the picker adds a guest; it must not submit the booking.
      e.preventDefault();
      if (matches.length) add({ userId: matches[0].id, email: matches[0].email, name: matches[0].fullName });
      else if (recentMatches.length) addRecent(recentMatches[0]);
      else if (canAddTyped) add({ email: q.trim(), external: true });
      else if (blockedExternal) push(t('part.no_external'), 'error');
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="f-group" ref={wrapRef}>
      <label className="f-label">{t('part.label')}</label>
      {value.length ? (
        <div className="chip-row">
          {value.map((p) => (
            <span key={p.email} className={`chip ${p.external ? 'chip-ext' : ''}`}>
              {labelFor(p)}
              {p.external ? <em>{t('part.external')}</em> : null}
              <button type="button" onClick={() => remove(p.email)} aria-label={`${t('common.remove')} ${p.email}`}>×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="picker">
        <input className="f-input" value={q} placeholder={t('part.placeholder')}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
        {open && (matches.length > 0 || recentMatches.length > 0 || canAddTyped || blockedExternal) ? (
          <div className="picker-menu">
            {matches.map((u) => (
              <button type="button" key={u.id} className="picker-item"
                onClick={() => add({ userId: u.id, email: u.email, name: u.fullName })}>
                <span className="picker-name">{u.fullName}</span>
                <span className="picker-sub">{u.email}{u.department ? ` · ${u.department}` : ''}</span>
              </button>
            ))}
            {recentMatches.length ? (
              <>
                <div className="picker-group">{t('part.recent')}</div>
                {recentMatches.map((r) => (
                  <button type="button" key={`r-${r.email}`} className="picker-item"
                    onClick={() => addRecent(r)}>
                    <span className="picker-name">
                      {r.name ?? r.email}
                      {r.external ? <em className="picker-ext-tag">{t('part.external')}</em> : null}
                    </span>
                    <span className="picker-sub">{r.name ? r.email : t('part.invited_before')}</span>
                  </button>
                ))}
              </>
            ) : null}
            {canAddTyped ? (
              <button type="button" className="picker-item" onClick={() => add({ email: q.trim(), external: true })}>
                <span className="picker-name">{t('part.invite_ext')} “{q.trim()}”</span>
                <span className="picker-sub">{t('part.external_hint')}</span>
              </button>
            ) : null}
            {blockedExternal ? (
              <div className="picker-item picker-blocked">
                <span className="picker-sub">{t('part.no_external')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="f-hint">{t('part.hint')}</div>
    </div>
  );
}

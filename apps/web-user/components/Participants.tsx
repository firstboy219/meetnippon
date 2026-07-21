'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { DirectoryUser, Participant } from '@/lib/types';

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
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get<DirectoryUser[]>('/users/directory').then(setDir).catch(() => setDir([]));
  }, []);

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
    const hit = dir.find((u) => u.id === p.userId || u.email.toLowerCase() === p.email.toLowerCase());
    return hit?.fullName ?? p.email;
  }, [dir]);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    return dir
      .filter((u) => u.email.toLowerCase() !== selfEmail?.toLowerCase())
      .filter((u) => !chosen.has(u.email.toLowerCase()))
      .filter((u) => !term || `${u.fullName} ${u.email}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [dir, q, chosen, selfEmail]);

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
  function remove(email: string) {
    onChange(value.filter((p) => p.email !== email));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Enter inside the picker adds a guest; it must not submit the booking.
      e.preventDefault();
      if (matches.length) add({ userId: matches[0].id, email: matches[0].email, name: matches[0].fullName });
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
        {open && (matches.length > 0 || canAddTyped || blockedExternal) ? (
          <div className="picker-menu">
            {matches.map((u) => (
              <button type="button" key={u.id} className="picker-item"
                onClick={() => add({ userId: u.id, email: u.email, name: u.fullName })}>
                <span className="picker-name">{u.fullName}</span>
                <span className="picker-sub">{u.email}{u.department ? ` · ${u.department}` : ''}</span>
              </button>
            ))}
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

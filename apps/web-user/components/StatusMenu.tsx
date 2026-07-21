'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { PresenceView } from '@/lib/types';

const CHOICES = ['AVAILABLE', 'BUSY', 'DND', 'AWAY', 'OFFLINE'] as const;
const KEY: Record<string, string> = {
  AVAILABLE: 'available', BUSY: 'busy', DND: 'dnd', AWAY: 'away', OFFLINE: 'offline',
};
/** How often to tell the server we are still here. */
const HEARTBEAT_MS = 60_000;

/**
 * The user's own status, with a manual override.
 *
 * Status is normally derived from activity and from the calendar — being in a
 * meeting shows as Busy without anyone setting it. Choosing a value here pins
 * it until "back to automatic" is picked.
 */
export default function StatusMenu() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [state, setState] = useState<PresenceView | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const initials = (user?.fullName || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const beat = useCallback(() => {
    api.post<PresenceView>('/me/presence/heartbeat', {}).then(setState).catch(() => {});
  }, []);

  useEffect(() => {
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    // A tab left in the background should not keep claiming "available"; a
    // return to it should refresh immediately rather than wait a full cycle.
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [beat]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  async function choose(v: string) {
    setBusy(true);
    try {
      setState(await api.put<PresenceView>('/me/presence', { presence: v }));
      setOpen(false);
    } catch { /* leave the menu open so the click can be retried */ }
    finally { setBusy(false); }
  }

  const current = state?.presence ?? 'OFFLINE';
  const label = t(`presence.${KEY[current] ?? 'offline'}`);
  // "In a meeting" is worth saying out loud — it explains a Busy the user did
  // not set themselves.
  const sub = state?.reason === 'meeting'
    ? t('presence.in_meeting')
    : state?.manual ? t('presence.manual') : t('presence.auto');

  return (
    <div className="status-dropdown" ref={wrapRef}>
      <button type="button" className="status-trigger" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={t('presence.change')}>
        <span className="avatar">
          {initials}
          <span className={`presence-dot ${KEY[current] ?? 'offline'}`} />
        </span>
        <span className="user-meta">
          <span className="name">{user?.fullName}</span>
          <span className="role">{label} <span className="status-sub">· {sub}</span></span>
        </span>
      </button>

      {open ? (
        <div className="status-menu">
          <div className="status-menu-note">{t('presence.explain')}</div>
          {CHOICES.map((c) => (
            <button type="button" key={c} className="status-menu-item" disabled={busy}
              onClick={() => choose(c)}>
              <span className={`mini-dot ${KEY[c]}`} />
              {t(`presence.${KEY[c]}`)}
              {!state?.manual && current === c ? <span className="status-tick">✓</span> : null}
              {state?.manual && current === c ? <span className="status-tick">✓</span> : null}
            </button>
          ))}
          <button type="button" className="status-menu-item auto" disabled={busy || !state?.manual}
            onClick={() => choose('AUTO')}>
            ↺ {t('presence.back_to_auto')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

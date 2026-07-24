'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { OnboardingState } from '@/lib/types';

// Display order, not key order: the calendar step was added after the original
// seven, so it slots in by position rather than by renumbering the rest.
const STEPS = [
  { icon: '👋', k: 's1' },
  { icon: '🏠', k: 's2' },
  { icon: '🔎', k: 's3' },
  { icon: '📋', k: 's4' },
  { icon: '📅', k: 'scal' },
  { icon: '✅', k: 's5' },
  { icon: '💬', k: 's6' },
  { icon: '🌐', k: 's7' },
];

/**
 * The welcome tour.
 *
 * Whether it has been seen is stored on the user, not in localStorage: the old
 * per-browser flag meant a genuinely new person inherited "already onboarded"
 * from whoever used that browser before, while a returning colleague on a new
 * device got the tour all over again. It opens automatically only for someone
 * who has not finished it AND has never booked anything — the product's
 * definition of a new user — and can always be reopened from the header.
 */
export default function WelcomeTour() {
  const { ready, user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  const load = useCallback(async () => {
    try {
      const s = await api.get<OnboardingState>('/me/profile/onboarding');
      if (!s.tourDone && s.isNewUser) { setI(0); setOpen(true); }
    } catch { /* guidance is best-effort — never block the app on it */ }
  }, []);

  useEffect(() => {
    // The forced password change renders instead of the app, so don't stack the
    // tour on top of it — it runs on the next render once the gate lifts.
    if (ready && user && !user.mustChangePassword) void load();
    const h = () => { setI(0); setOpen(true); };
    window.addEventListener('mn:tour', h);
    return () => window.removeEventListener('mn:tour', h);
  }, [ready, user, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /** Dismissing without finishing keeps it for next time; Skip/Done persist. */
  function dismiss() { setOpen(false); }
  function finish() {
    setOpen(false);
    api.post('/me/profile/onboarding/done', {})
      .then(() => window.dispatchEvent(new Event('mn:onboarding')))
      .catch(() => { /* it will simply offer again next time */ });
  }

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="overlay" onClick={dismiss}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>{step.icon}</div>
        <h3 style={{ textAlign: 'center', fontSize: 19, marginBottom: 8 }}>{t(`tour.${step.k}_t`)}</h3>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, minHeight: 66 }}>{t(`tour.${step.k}_b`)}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '16px 0' }}>
          {STEPS.map((_, n) => (
            <span key={n} style={{ width: n === i ? 20 : 7, height: 7, borderRadius: 100, background: n === i ? 'var(--teal)' : 'var(--line)', transition: 'width .2s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={finish}>{t('tour.skip')}</button>
          {i > 0 ? <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setI(i - 1)}>{t('tour.back')}</button> : null}
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (last ? finish() : setI(i + 1))}>{last ? t('tour.done') : t('tour.next')}</button>
        </div>
      </div>
    </div>
  );
}

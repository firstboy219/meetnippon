'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const KEY = 'mn_admin_tour_v1';

const STEPS = [
  { icon: '🛠️', title: 'Admin console', body: 'Set up and run your workspace: rooms & desks, people, booking rules, branding, integrations and billing. Quick tour of what’s where.' },
  { icon: '📊', title: 'Analytics', body: 'Track booking activity, approval rate, most-used resources, and who’s in the office vs working from home today.' },
  { icon: '🏢', title: 'Resources', body: 'Create and manage meeting rooms and hot-desks — capacity, facilities, category, and maintenance status.' },
  { icon: '👥', title: 'Users', body: 'Add teammates (they get a temporary password to share), set roles (Admin / Approver / Employee), and activate or deactivate accounts.' },
  { icon: '📐', title: 'Booking Policies', body: 'Define rules that resolve Tenant → Category → Room: approval requirements, max duration, buffers, advance limits, check-in.' },
  { icon: '🎨', title: 'Branding', body: 'Set your colors and logo — they apply live to the user portal login and shell.' },
  { icon: '🔌', title: 'Integrations & Billing', body: 'Toggle SSO, chat, calendar, recording and WhatsApp. Manage your plan and limits under Billing.' },
];

export default function WelcomeTour() {
  const { ready, user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (ready && user && localStorage.getItem(KEY) !== 'done') { setI(0); setOpen(true); }
    const h = () => { setI(0); setOpen(true); };
    window.addEventListener('mn:tour', h);
    return () => window.removeEventListener('mn:tour', h);
  }, [ready, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function close() { localStorage.setItem(KEY, 'done'); setOpen(false); }
  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>{step.icon}</div>
        <h3 style={{ textAlign: 'center', fontSize: 19, marginBottom: 8 }}>{step.title}</h3>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.6, minHeight: 66 }}>{step.body}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '16px 0' }}>
          {STEPS.map((_, n) => (
            <span key={n} style={{ width: n === i ? 20 : 7, height: 7, borderRadius: 100, background: n === i ? 'var(--teal)' : 'var(--line)', transition: 'width .2s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={close}>{t('tour.skip')}</button>
          {i > 0 ? <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setI(i - 1)}>{t('tour.back')}</button> : null}
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (last ? close() : setI(i + 1))}>{last ? t('tour.start') : t('tour.next')}</button>
        </div>
      </div>
    </div>
  );
}

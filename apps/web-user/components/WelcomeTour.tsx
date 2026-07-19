'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

const KEY = 'mn_tour_v1';

const STEPS = [
  { icon: '👋', title: 'Welcome to MeetNippon', body: 'Book meeting rooms and desks, handle approvals, chat with your team, and track where you work — all in one place. Here’s a 30-second tour.' },
  { icon: '🏠', title: 'Dashboard', body: 'Your home screen shows today’s bookings, quick stats, and what’s coming up next. Use “Quick book” to reserve a room in seconds.' },
  { icon: '🔎', title: 'Book Room / Desk', body: 'Browse available rooms and desks, filter by type or search by name, then pick a date & time. Some rooms (like VIP) may need approval first.' },
  { icon: '📋', title: 'My Bookings', body: 'See all your reservations, cancel ones you no longer need, and check in when your meeting starts.' },
  { icon: '✅', title: 'Approvals & Hub', body: '“Approvals” handles room-booking sign-offs. “Approval Hub” is a single inbox for requests coming from other systems too.' },
  { icon: '💬', title: 'Chat', body: 'Message teammates directly or in groups — messages arrive in real time.' },
  { icon: '🌐', title: 'Language & account', body: 'Switch between English and Indonesian, and sign out, from the top-right bar. You can replay this tour anytime with the “?” button.' },
];

export default function WelcomeTour() {
  const { ready, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (ready && user && localStorage.getItem(KEY) !== 'done') { setI(0); setOpen(true); }
    const h = () => { setI(0); setOpen(true); };
    window.addEventListener('mn:tour', h);
    return () => window.removeEventListener('mn:tour', h);
  }, [ready, user]);

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
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={close}>Skip</button>
          {i > 0 ? <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setI(i - 1)}>Back</button> : null}
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Get started' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

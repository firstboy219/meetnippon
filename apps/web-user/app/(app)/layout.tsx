'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { ApprovalStep } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import WelcomeTour from '@/components/WelcomeTour';
import ForcePasswordChange from '@/components/ForcePasswordChange';

const TITLES: [string, string][] = [
  ['/dashboard', 'nav.dashboard'],
  ['/book', 'nav.book'],
  ['/bookings', 'nav.bookings'],
  ['/profile', 'nav.profile'],
  ['/denah', 'nav.denah'],
  ['/schedule', 'nav.schedule'],
  ['/calendar', 'nav.calendar'],
  ['/history', 'nav.history'],
  ['/approvals', 'nav.approval'],
  ['/hub', 'nav.hub'],
  ['/chat', 'nav.chat'],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => {
    if (!user) return;
    // The badge is "things waiting on me": booking approvals + colleagues'
    // change requests on my meetings.
    Promise.all([
      api.get<ApprovalStep[]>('/approvals').catch(() => []),
      api.get<unknown[]>('/change-requests/incoming').catch(() => []),
    ]).then(([a, c]) => setPending(a.length + c.length));
  }, [user, path]);

  // Chat badge polls on its own timer: unread changes while you are on any
  // page, not only when you navigate.
  useEffect(() => {
    if (!user) return;
    const read = () => api.get<{ count: number }>('/chat/unread')
      .then((r) => setChatUnread(r.count)).catch(() => {});
    read();
    const id = setInterval(read, 20_000);
    return () => clearInterval(id);
  }, [user, path]);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (!ready || !user) return <div className="empty">{t('common.loading')}</div>;

  // An admin-handed-over password must be replaced before anything else is
  // reachable — rendered instead of the app, not over it, so there is no way
  // to click past it.
  if (user.mustChangePassword) return <ForcePasswordChange />;

  const titleKey = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'nav.dashboard';
  return (
    <div className="app">
      <Sidebar pendingCount={pending} chatUnread={chatUnread}
        mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />
      {menuOpen ? <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} /> : null}
      <div className="main">
        <Topbar title={t(titleKey)} onMenu={() => setMenuOpen(true)} />
        <div className="content">{children}</div>
      </div>
      <WelcomeTour />
    </div>
  );
}

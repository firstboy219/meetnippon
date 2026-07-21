'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Sidebar, Topbar } from '@/components/Shell';
import WelcomeTour from '@/components/WelcomeTour';

const TITLES: [string, string][] = [
  ['/dashboard', 'nav.dashboard'], ['/analytics', 'nav.analytics'], ['/resources', 'nav.resources'],
  ['/locations', 'nav.locations'], ['/users', 'nav.users'],
  ['/policies', 'nav.policies'], ['/branding', 'nav.branding'],
  ['/mail', 'nav.mail'], ['/integrations', 'nav.integrations'],
  ['/billing', 'nav.billing'], ['/bookings', 'nav.bookings'], ['/audit', 'nav.audit'],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (ready && (!user || user.role !== 'ADMIN')) router.replace('/login');
  }, [ready, user, router]);

  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (!ready || !user) return <div className="empty">{t('common.loading')}</div>;

  const titleKey = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'nav.dashboard';
  return (
    <div className="app">
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />
      {menuOpen ? <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} /> : null}
      <div className="main">
        <Topbar title={t(titleKey)} onMenu={() => setMenuOpen(true)} />
        <div className="content">{children}</div>
      </div>
      <WelcomeTour />
    </div>
  );
}

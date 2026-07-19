'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Sidebar, Topbar } from '@/components/Shell';

const TITLES: [string, string][] = [
  ['/dashboard', 'nav.dashboard'], ['/analytics', 'nav.analytics'], ['/resources', 'nav.resources'], ['/users', 'nav.users'],
  ['/policies', 'nav.policies'], ['/branding', 'nav.branding'], ['/integrations', 'nav.integrations'],
  ['/billing', 'nav.billing'], ['/bookings', 'nav.bookings'], ['/audit', 'nav.audit'],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && (!user || user.role !== 'ADMIN')) router.replace('/login');
  }, [ready, user, router]);

  if (!ready || !user) return <div className="empty">{t('common.loading')}</div>;

  const titleKey = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'nav.dashboard';
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar title={t(titleKey)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

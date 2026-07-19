'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { ApprovalStep } from '@/lib/types';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

const TITLES: [string, string][] = [
  ['/dashboard', 'nav.dashboard'],
  ['/book', 'nav.book'],
  ['/bookings', 'nav.bookings'],
  ['/approvals', 'nav.approval'],
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(0);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => {
    if (user) api.get<ApprovalStep[]>('/approvals').then((r) => setPending(r.length)).catch(() => {});
  }, [user, path]);

  if (!ready || !user) return <div className="empty">{t('common.loading')}</div>;

  const titleKey = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? 'nav.dashboard';
  return (
    <div className="app">
      <Sidebar pendingCount={pending} />
      <div className="main">
        <Topbar title={t(titleKey)} />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

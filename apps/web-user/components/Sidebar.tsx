'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

const ICONS: Record<string, React.ReactNode> = {
  '/dashboard': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  '/book': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>,
  '/bookings': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>,
  '/approvals': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  '/hub': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></svg>,
  '/chat': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4H12a8.5 8.5 0 0 1-4-1L3 20l1.3-3.9A8.4 8.4 0 0 1 3.5 12 8.38 8.38 0 0 1 12 3.6a8.4 8.4 0 0 1 9 7.9z" /></svg>,
};

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/book', key: 'nav.book' },
  { href: '/bookings', key: 'nav.bookings' },
  { href: '/approvals', key: 'nav.approval' },
  { href: '/hub', key: 'nav.hub' },
  { href: '/chat', key: 'nav.chat' },
];

export default function Sidebar({ pendingCount, mobileOpen, onCloseMobile }: {
  pendingCount: number; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const path = usePathname();
  const { t } = useI18n();
  const { branding, user } = useAuth();
  const name = branding?.displayName || branding?.tenantName || 'MeetNippon';
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { if (localStorage.getItem('mn_sidebar') === 'collapsed') setCollapsed(true); }, []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('mn_sidebar', next ? 'collapsed' : 'open');
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark">{branding?.logoUrl ? <img src={branding.logoUrl} alt="" /> : null}</div>
        <div className="brand-text">
          <div className="brand-name">{name}</div>
          <div className="brand-sub">{t('nav.tagline')}</div>
        </div>
        <button type="button" className="sidebar-toggle" onClick={toggle} aria-label={t('nav.collapse')} title={t('nav.collapse')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4L5 12l6 8M18 4l-6 8 6 8" /></svg>
        </button>
      </div>
      <button type="button" className="sidebar-expand-btn" onClick={toggle} aria-label={t('nav.expand')} title={t('nav.expand')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 4l6 8-6 8M6 4l6 8-6 8" /></svg>
      </button>
      <nav className="side">
        {ITEMS.map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}
              title={t(it.key)} onClick={onCloseMobile}>
              {ICONS[it.href]}
              <span className="nav-label">{t(it.key)}</span>
              {it.href === '/approvals' && pendingCount > 0 ? (
                <span className="nav-badge">{pendingCount}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {user?.fullName}
        <br />
        {user?.email}
      </div>
    </aside>
  );
}

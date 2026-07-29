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
  '/denah': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" /><path d="M9 3v15M15 6v15" /></svg>,
  '/schedule': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M3 12h18M3 19h18" /><rect x="6" y="3" width="5" height="4" rx="1" fill="currentColor" stroke="none" /><rect x="13" y="10" width="7" height="4" rx="1" fill="currentColor" stroke="none" /><rect x="5" y="17" width="6" height="4" rx="1" fill="currentColor" stroke="none" /></svg>,
  '/calendar': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /><rect x="7" y="12" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" /><rect x="13" y="12" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" /></svg>,
  '/history': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7.5V12l3 2" /></svg>,
  '/approvals': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
  '/hub': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></svg>,
  '/chat': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.4H12a8.5 8.5 0 0 1-4-1L3 20l1.3-3.9A8.4 8.4 0 0 1 3.5 12 8.38 8.38 0 0 1 12 3.6a8.4 8.4 0 0 1 9 7.9z" /></svg>,
  '/about': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>,
};

/**
 * `flag` names the tenant feature that must be on for the item to appear.
 * Items without one are core booking features and are always shown.
 *
 * Grouped by what the user came to do rather than by module: ten flat entries
 * had become more than the eye scans in one pass. A group with a null `key`
 * renders without a heading — Dashboard stands alone above the rest.
 */
type NavItem = { href: string; key: string; flag?: string };
const GROUPS: { key: string | null; items: NavItem[] }[] = [
  { key: null, items: [{ href: '/dashboard', key: 'nav.dashboard' }] },
  {
    key: 'nav.group.book',
    items: [
      { href: '/book', key: 'nav.book' },
      { href: '/denah', key: 'nav.denah' },
      { href: '/schedule', key: 'nav.schedule' },
    ],
  },
  {
    key: 'nav.group.mine',
    items: [
      { href: '/bookings', key: 'nav.bookings' },
      { href: '/calendar', key: 'nav.calendar' },
      { href: '/history', key: 'nav.history' },
    ],
  },
  {
    key: 'nav.group.team',
    items: [
      { href: '/approvals', key: 'nav.approval' },
      { href: '/hub', key: 'nav.hub' },
      // 'chat' is the only module with a real flag today and the only one the API
      // refuses when off. Do not gate an item on a key that does not exist — the
      // item would simply never appear.
      { href: '/chat', key: 'nav.chat', flag: 'chat' },
    ],
  },
  {
    key: 'nav.group.help',
    items: [{ href: '/about', key: 'nav.about' }],
  },
];

export default function Sidebar({ pendingCount, chatUnread = 0, mobileOpen, onCloseMobile }: {
  pendingCount: number; chatUnread?: number; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const path = usePathname();
  const { t } = useI18n();
  const { branding, user } = useAuth();
  const name = branding?.displayName || branding?.tenantName || 'MeetNippon';
  const features = user?.features ?? [];
  // What the admin's Menu Access page has hidden for this person's role.
  // Keyed off the href's own path segment (e.g. '/book' -> 'book') so it
  // needs no separate id per item to stay in sync with the API's menu keys.
  const hiddenMenus = new Set(user?.hiddenMenus ?? []);
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
        {GROUPS.map((g) => {
          const items = g.items.filter((it) =>
            (!it.flag || features.includes(it.flag)) && !hiddenMenus.has(it.href.slice(1)));
          // A group whose every item is gated off must not leave a stray heading.
          if (items.length === 0) return null;
          return (
            <div className="nav-group" key={g.key ?? 'main'}>
              {g.key ? <div className="nav-group-label">{t(g.key)}</div> : null}
              {items.map((it) => {
                const active = path === it.href || path.startsWith(it.href + '/');
                return (
                  <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}
                    title={t(it.key)} aria-current={active ? 'page' : undefined} onClick={onCloseMobile}>
                    {ICONS[it.href]}
                    <span className="nav-label">{t(it.key)}</span>
                    {it.href === '/approvals' && pendingCount > 0 ? (
                      <span className="nav-badge">{pendingCount}</span>
                    ) : null}
                    {it.href === '/chat' && chatUnread > 0 ? (
                      <span className="nav-badge">{chatUnread > 99 ? '99+' : chatUnread}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
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

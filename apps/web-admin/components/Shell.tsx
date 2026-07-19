'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/analytics', key: 'nav.analytics' },
  { href: '/resources', key: 'nav.resources' },
  { href: '/users', key: 'nav.users' },
  { href: '/policies', key: 'nav.policies' },
  { href: '/branding', key: 'nav.branding' },
  { href: '/integrations', key: 'nav.integrations' },
  { href: '/billing', key: 'nav.billing' },
  { href: '/bookings', key: 'nav.bookings' },
  { href: '/audit', key: 'nav.audit' },
];

export function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <div className="brand-name">MeetNippon<span className="admin-tag">Admin</span></div>
          <div className="brand-sub">Workspace console</div>
        </div>
      </div>
      <nav className="side">
        {ITEMS.map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
          return <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}>{t(it.key)}</Link>;
        })}
      </nav>
      <div className="sidebar-foot">{user?.fullName}<br />{user?.email}</div>
    </aside>
  );
}

export function Topbar({ title }: { title: string }) {
  const { lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const initials = (user?.fullName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="topbar">
      <h2>{title}</h2>
      <div className="topbar-right">
        <div className="lang-toggle">
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'id' ? 'active' : ''} onClick={() => setLang('id')}>ID</button>
        </div>
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div className="user-meta"><div className="name">{user?.fullName}</div><div className="role">Administrator</div></div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </div>
    </header>
  );
}

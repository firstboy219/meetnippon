'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/book', key: 'nav.book' },
  { href: '/bookings', key: 'nav.bookings' },
  { href: '/approvals', key: 'nav.approval' },
];

export default function Sidebar({ pendingCount }: { pendingCount: number }) {
  const path = usePathname();
  const { t } = useI18n();
  const { branding, user } = useAuth();
  const name = branding?.displayName || branding?.tenantName || 'MeetNippon';

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">{branding?.logoUrl ? <img src={branding.logoUrl} alt="" /> : null}</div>
        <div>
          <div className="brand-name">{name}</div>
          <div className="brand-sub">Room &amp; Desk Booking</div>
        </div>
      </div>
      <nav className="side">
        {ITEMS.map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}>
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

'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { AppNotification } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const SIDEBAR_KEY = 'mn_admin_sidebar';

const ICONS: Record<string, React.ReactNode> = {
  '/dashboard': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  '/analytics': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21V9M10 21V3M17 21v-7" /></svg>,
  '/resources': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" /><path d="M9 4v14M15 6v14" /></svg>,
  '/locations': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>,
  '/users': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19c1-3.5 3.8-5.5 6.5-5.5s5.5 2 6.5 5.5" /><circle cx="18" cy="8" r="2.5" /><path d="M16.5 13.6c2 .3 3.6 1.9 4.3 4.4" /></svg>,
  '/policies': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18M3 15v4a2 2 0 0 0 2 2h4m10-6v4a2 2 0 0 1-2 2h-4" /></svg>,
  '/branding': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="1.5" /><circle cx="17.5" cy="10.5" r="1.5" /><circle cx="8.5" cy="7.5" r="1.5" /><circle cx="6.5" cy="12.5" r="1.5" /><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-5-4-10-9-10z" /></svg>,
  '/mail': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></svg>,
  '/integrations': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.5 7.5L15.5 16.5" /></svg>,
  '/menu-access': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="19" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" /></svg>,
  '/billing': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>,
  '/bookings': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v3M16 3v3" /></svg>,
  '/audit': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>,
  '/broadcast': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-7-7 18-3-8-8-3z" /></svg>,
  '/error-reports': <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>,
};

/**
 * Billing is hidden when the platform runs for a single organisation, where
 * subscription tiers are not part of the story. The page itself still exists
 * and still works — this only removes it from the navigation.
 */
const HIDE_BILLING = process.env.NEXT_PUBLIC_HIDE_BILLING === 'true';

const ITEMS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/analytics', key: 'nav.analytics' },
  { href: '/resources', key: 'nav.resources' },
  { href: '/locations', key: 'nav.locations' },
  { href: '/users', key: 'nav.users' },
  { href: '/policies', key: 'nav.policies' },
  { href: '/branding', key: 'nav.branding' },
  { href: '/mail', key: 'nav.mail' },
  { href: '/integrations', key: 'nav.integrations' },
  { href: '/menu-access', key: 'nav.menuAccess' },
  { href: '/billing', key: 'nav.billing' },
  { href: '/bookings', key: 'nav.bookings' },
  { href: '/audit', key: 'nav.audit' },
  { href: '/broadcast', key: 'nav.broadcast' },
  { href: '/error-reports', key: 'nav.errorReports' },
];

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const path = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { if (localStorage.getItem(SIDEBAR_KEY) === 'collapsed') setCollapsed(true); }, []);
  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'open');
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand">
        <div className="brand-mark" />
        <div className="brand-text">
          <div className="brand-name">MeetNippon<span className="admin-tag">Admin</span></div>
          <div className="brand-sub">{t('nav.console')}</div>
        </div>
        <button type="button" className="sidebar-toggle" onClick={toggle} aria-label={t('nav.collapse')} title={t('nav.collapse')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4L5 12l6 8M18 4l-6 8 6 8" /></svg>
        </button>
      </div>
      <button type="button" className="sidebar-expand-btn" onClick={toggle} aria-label={t('nav.expand')} title={t('nav.expand')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 4l6 8-6 8M6 4l6 8-6 8" /></svg>
      </button>
      <nav className="side">
        {ITEMS.filter((it) => !(HIDE_BILLING && it.href === '/billing')).map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
          return (
            <Link key={it.href} href={it.href} className={`nav-item ${active ? 'active' : ''}`}
              title={t(it.key)} onClick={onCloseMobile}>
              {ICONS[it.href]}
              <span className="nav-label">{t(it.key)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">{user?.fullName}<br />{user?.email}</div>
    </aside>
  );
}

export function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { lang, setLang, t } = useI18n();
  const { user, logout } = useAuth();
  const initials = (user?.fullName || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="hamburger" onClick={onMenu} aria-label={t('nav.menu')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <h2>{title}</h2>
      </div>
      <div className="topbar-right">
        <button className="btn btn-ghost btn-sm" title={t('nav.tour')} aria-label={t('nav.tour')}
          onClick={() => window.dispatchEvent(new Event('mn:tour'))}
          style={{ width: 32, height: 32, padding: 0, borderRadius: '50%' }}>?</button>
        <NotifBell />
        <div className="lang-toggle">
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'id' ? 'active' : ''} onClick={() => setLang('id')}>ID</button>
        </div>
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div className="user-meta"><div className="name">{user?.fullName}</div><div className="role">{t('nav.role_admin')}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>{t('common.signout')}</button>
        </div>
      </div>
    </header>
  );
}

const TYPE_ICON: Record<string, string> = {
  approval: '📋', reminder: '⏰', mention: '💬', recording_ready: '🎬',
  ops: '🛠️', calendar: '📅', wfh: '🏠',
};

function NotifBell() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const loadCount = useCallback(() => {
    api.get<{ count: number }>('/notifications/unread-count').then((r) => setCount(r.count)).catch(() => {});
  }, []);
  useEffect(() => { loadCount(); const id = setInterval(loadCount, 30000); return () => clearInterval(id); }, [loadCount]);

  useEffect(() => {
    if (!open) return;
    api.get<AppNotification[]>('/notifications').then(setItems).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  async function markAll() {
    try {
      await api.post('/notifications/read-all', {});
      setCount(0);
      setItems((l) => l.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  function openItem(n: AppNotification) {
    if (!n.isRead) {
      api.post(`/notifications/${n.id}/read`, {}).catch(() => {});
      setCount((c) => Math.max(0, c - 1));
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    setOpen(false);
    if (n.deepLink) router.push(n.deepLink);
  }

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button type="button" className="notif-btn" onClick={() => setOpen((o) => !o)}
        aria-label={t('notif.aria')} aria-expanded={open}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {count > 0 ? <span className="notif-count">{count > 99 ? '99+' : count}</span> : null}
      </button>
      {open ? (
        <div className="notif-menu">
          <div className="notif-menu-head">
            {t('notif.title')}
            <button type="button" className="link" onClick={markAll}>{t('notif.mark_all')}</button>
          </div>
          <div className="notif-list">
            {items.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0' }}>{t('notif.empty')}</div>
            ) : items.map((n) => (
              <button type="button" key={n.id} className={`notif-item ${n.isRead ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <div className="n-ic">{TYPE_ICON[n.type] ?? '🔔'}</div>
                <div>
                  <div className="n-title">{n.title}</div>
                  <div className="n-time">{fmtDateTime(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

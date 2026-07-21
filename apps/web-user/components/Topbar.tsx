'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import type { AppNotification } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import StatusMenu from './StatusMenu';

const TYPE_ICON: Record<string, string> = {
  approval: '📋', reminder: '⏰', mention: '💬', recording_ready: '🎬',
  ops: '🛠️', calendar: '📅', wfh: '🏠',
};

export default function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { lang, setLang, t } = useI18n();
  const { logout } = useAuth();

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
          <StatusMenu />
          <button className="btn btn-ghost btn-sm" onClick={logout}>{t('common.signout')}</button>
        </div>
      </div>
    </header>
  );
}

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
            <button type="button" className="link" style={{ fontSize: 11 }} onClick={markAll}>{t('notif.mark_all')}</button>
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

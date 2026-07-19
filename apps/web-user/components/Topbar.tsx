'use client';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';

export default function Topbar({ title }: { title: string }) {
  const { lang, setLang, t } = useI18n();
  const { user, logout } = useAuth();
  const initials = (user?.fullName || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="topbar">
      <h2>{title}</h2>
      <div className="topbar-right">
        <button className="btn btn-ghost btn-sm" title="Show tour"
          onClick={() => window.dispatchEvent(new Event('mn:tour'))}
          style={{ width: 32, height: 32, padding: 0, borderRadius: '50%' }}>?</button>
        <div className="lang-toggle">
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          <button className={lang === 'id' ? 'active' : ''} onClick={() => setLang('id')}>ID</button>
        </div>
        <div className="user-chip">
          <div className="avatar">{initials}</div>
          <div className="user-meta">
            <div className="name">{user?.fullName}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>{t('common.signout')}</button>
        </div>
      </div>
    </header>
  );
}

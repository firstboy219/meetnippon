'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { login, branding, user, ready } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && user) router.replace('/dashboard'); }, [ready, user, router]);

  const needsWorkspace = !branding || branding.accessMode === 'SHARED_URL';
  const tenantName = branding?.displayName || branding?.tenantName || 'MeetNippon';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password, needsWorkspace ? workspace : undefined);
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand-mark">{branding?.logoUrl ? <img src={branding.logoUrl} alt="" /> : null}</div>
        <h1>{tenantName}</h1>
        <p>{t('login.tagline')}</p>
      </div>
      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <h2>{t('login.title')}</h2>
          <div className="sub">{t('login.sub')}</div>
          {err ? <div className="err-box">{err}</div> : null}
          {needsWorkspace ? (
            <div className="f-group">
              <label className="f-label">{t('login.workspace')}</label>
              <input className="f-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)}
                placeholder="nipsea" autoCapitalize="none" required />
            </div>
          ) : null}
          <div className="f-group">
            <label className="f-label">{t('login.email')}</label>
            <input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" autoComplete="username" required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('login.password')}</label>
            <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? <span className="spinner" /> : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (ready && user) router.replace('/dashboard'); }, [ready, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(email, password, workspace || undefined);
      router.replace('/dashboard');
    } catch (e: any) { setErr(e?.message || 'Sign in failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand-mark" />
        <h1>MeetNippon<br />Admin Console</h1>
        <p>Manage rooms, desks, policies, users and branding for your workspace.</p>
      </div>
      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <h2>{t('login.title')}</h2>
          <div className="sub">{t('login.sub')}</div>
          {err ? <div className="err-box">{err}</div> : null}
          <div className="f-group">
            <label className="f-label">Workspace</label>
            <input className="f-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="nipsea" autoCapitalize="none" required />
          </div>
          <div className="f-group">
            <label className="f-label">Email</label>
            <input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="f-group">
            <label className="f-label">Password</label>
            <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { api, tokenStore } from '@/lib/api';

/**
 * When the platform runs for a single organisation there is nothing to choose,
 * so the workspace box is hidden and every sign-in uses this slug. Unset it and
 * the field comes back — multi-tenant behaviour is not removed, only bypassed.
 */
const FIXED_WORKSPACE = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE || '';

/**
 * `useSearchParams` opts a route out of static prerendering unless it sits
 * inside a Suspense boundary, so the form lives in its own component.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="empty">…</div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, branding, user, ready, previewWorkspace } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspace, setWorkspace] = useState(FIXED_WORKSPACE);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknownWorkspace, setUnknownWorkspace] = useState(false);

  /**
   * Where to land after signing in. Only same-origin paths are honoured — an
   * absolute URL here would turn the login screen into an open redirect.
   */
  const next = (() => {
    const raw = params.get('next') ?? '';
    return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  })();

  useEffect(() => { if (ready && user) router.replace(next); }, [ready, user, router, next]);

  // Prefill from whatever this browser used last, so a returning user sees
  // their own workspace already selected and themed. A fixed workspace wins.
  useEffect(() => {
    if (FIXED_WORKSPACE) return;
    const last = localStorage.getItem('mn_workspace');
    if (last) setWorkspace(last);
  }, []);

  /**
   * Theme the screen for the workspace being typed. Debounced, because this
   * fires on every keystroke and a slug is only meaningful once it is complete
   * enough to match — anything shorter is left alone rather than flashing the
   * default palette back and forth.
   */
  useEffect(() => {
    const slug = workspace.trim().toLowerCase();
    if (slug.length < 3) { setUnknownWorkspace(false); return; }
    const id = setTimeout(async () => {
      const found = await previewWorkspace(slug);
      setUnknownWorkspace(!found);
    }, 400);
    return () => clearTimeout(id);
  }, [workspace, previewWorkspace]);

  // Still sent on every sign-in — only the input is hidden.
  const needsWorkspace = !FIXED_WORKSPACE && (!branding || branding.accessMode === 'SHARED_URL');
  const workspaceToSend = FIXED_WORKSPACE || (needsWorkspace ? workspace : undefined);
  const tenantName = branding?.displayName || branding?.tenantName || 'MeetNippon';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password, workspaceToSend);
      router.replace(next);
    } catch (e: any) {
      setErr(e?.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function ssoSignIn(provider: 'microsoft' | 'google') {
    setErr('');
    if (needsWorkspace && !workspace) { setErr('Enter your workspace first.'); return; }
    try {
      const start = await api.post<{ mode: string; url: string; state: string }>(
        `/auth/sso/${provider}/start`, { tenantSlug: workspaceToSend }, false,
      );
      if (start.mode === 'mock') {
        const who = window.prompt('Mock SSO — sign in as (email or email|Name):');
        if (!who) return;
        const cb = await api.post<{ accessToken: string; refreshToken: string }>(
          `/auth/sso/${provider}/callback`, { code: who, state: start.state }, false,
        );
        tokenStore.set(cb.accessToken, cb.refreshToken);
        window.location.href = '/dashboard';
      } else {
        window.location.href = start.url;
      }
    } catch (e: any) {
      setErr(e?.message || 'SSO sign-in is not available.');
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
                placeholder="nipsea" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              {unknownWorkspace ? (
                <div className="f-hint">{t('login.workspace_unknown')}</div>
              ) : null}
            </div>
          ) : null}
          <div className="f-group">
            <label className="f-label">{t('login.email')}</label>
            <input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={process.env.NEXT_PUBLIC_EMAIL_HINT || 'you@company.com'}
              autoComplete="username" required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('login.password')}</label>
            <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
            {busy ? <span className="spinner" /> : t('login.submit')}
          </button>
          {/* Bulk-imported accounts have no password at all; this is their way in. */}
          <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5 }}>
            <a href="/activate" className="link">{t('login.first_time')}</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', color: 'var(--ink-soft)', fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => ssoSignIn('microsoft')}>Microsoft 365</button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => ssoSignIn('google')}>Google</button>
          </div>
          {/* A pinned workspace means this deployment serves one organisation,
              so offering to create another is self-contradictory. */}
          {FIXED_WORKSPACE ? null : (
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--ink-soft)' }}>
              New here? <a href="/signup" className="link">Create a workspace</a>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

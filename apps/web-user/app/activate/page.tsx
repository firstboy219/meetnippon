'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const FIXED_WORKSPACE = process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE || '';

/** `useSearchParams` needs a Suspense boundary to keep the route prerenderable. */
export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="empty">…</div>}>
      <Activate />
    </Suspense>
  );
}

/**
 * Account activation for people who have never had a password — the bulk-import
 * path creates accounts with none on purpose, so nothing secret is ever mailed
 * or pasted into a spreadsheet.
 *
 * Two modes on one route: without a token it asks for an email and sends the
 * link; with a token it sets the first password and signs the person straight
 * in, so they land in the app rather than back on a login form.
 */
function Activate() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.post('/auth/activation/request', {
        email: email.trim(),
        ...(FIXED_WORKSPACE ? { tenantSlug: FIXED_WORKSPACE } : {}),
      }, false);
      // Always the same outcome, whether or not that address has an account —
      // the screen must not become a way to test who works here.
      setSent(true);
    } catch {
      setSent(true);
    } finally { setBusy(false); }
  }

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSet = password.length >= 8 && password === confirm;

  async function setPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSet) return;
    setBusy(true); setErr('');
    try {
      const res = await api.post<{ accessToken: string; refreshToken: string }>(
        '/auth/activation/complete', { token, newPassword: password }, false,
      );
      tokenStore.set(res.accessToken, res.refreshToken);
      // Full navigation so the auth provider re-reads the new session.
      window.location.href = '/dashboard';
    } catch (e: any) {
      setErr(e?.message || t('act.fail'));
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand-mark" />
        <h1>{t('act.hero_title')}</h1>
        <p>{t('act.hero_sub')}</p>
      </div>
      <div className="login-panel">
        {token ? (
          <form className="login-card" onSubmit={setPasswordSubmit}>
            <h2>{t('act.set_title')}</h2>
            <p className="login-sub">{t('act.set_sub')}</p>
            {err ? <div className="err-box">{err}</div> : null}
            <div className="f-group">
              <label className="f-label">{t('act.new_password')}</label>
              <input className="f-input" type="password" autoComplete="new-password" autoFocus
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              {tooShort ? <div className="f-err">{t('act.too_short')}</div> : <div className="f-hint">{t('act.rule')}</div>}
            </div>
            <div className="f-group">
              <label className="f-label">{t('act.confirm')}</label>
              <input className="f-input" type="password" autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              {mismatch ? <div className="f-err">{t('act.mismatch')}</div> : null}
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !canSet}>
              {busy ? <span className="spinner" /> : t('act.set_submit')}
            </button>
          </form>
        ) : sent ? (
          <div className="login-card">
            <h2>{t('act.sent_title')}</h2>
            <p className="login-sub">{t('act.sent_sub')}</p>
            <a href="/login" className="btn btn-ghost" style={{ width: '100%', textAlign: 'center' }}>
              {t('act.back_login')}
            </a>
          </div>
        ) : (
          <form className="login-card" onSubmit={requestLink}>
            <h2>{t('act.title')}</h2>
            <p className="login-sub">{t('act.sub')}</p>
            <div className="f-group">
              <label className="f-label">{t('login.email')}</label>
              <input className="f-input" type="email" autoComplete="email" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder={process.env.NEXT_PUBLIC_EMAIL_HINT || ''} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? <span className="spinner" /> : t('act.send')}
            </button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5 }}>
              <a href="/login" className="link">{t('act.back_login')}</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

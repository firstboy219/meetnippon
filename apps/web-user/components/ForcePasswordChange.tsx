'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';

/**
 * First-sign-in gate for accounts whose password was handed over by an admin.
 *
 * Deliberately not dismissible and rendered *instead of* the app rather than
 * over it: a password the admin knows must not stay usable, so there is no
 * "later". The current password is still required — the person just signed in
 * with it, and asking proves it is really them and not a hijacked session.
 */
export default function ForcePasswordChange() {
  const { t } = useI18n();
  const { push } = useToast();
  const { user, refresh, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsOld = next.length > 0 && next === current;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !sameAsOld;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api.put('/me/profile/password', { currentPassword: current, newPassword: next });
      push(t('force.done'), 'success');
      // Re-read /auth/me so mustChangePassword clears and the app unlocks.
      await refresh();
    } catch (err: any) {
      push(err?.message || t('force.fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="force-wrap">
      <form className="card force-card" onSubmit={submit}>
        <div className="force-icon" aria-hidden="true">🔐</div>
        <h1 className="force-title">{t('force.title')}</h1>
        <p className="force-sub">{t('force.sub')}</p>

        <div className="f-group">
          <label className="f-label" htmlFor="fp-cur">{t('force.current')}</label>
          <input id="fp-cur" className="f-input" type="password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
          <div className="f-hint">{t('force.current_hint')}</div>
        </div>

        <div className="f-group">
          <label className="f-label" htmlFor="fp-new">{t('force.new')}</label>
          <input id="fp-new" className="f-input" type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          {tooShort ? <div className="f-err">{t('force.too_short')}</div>
            : sameAsOld ? <div className="f-err">{t('force.same')}</div>
              : <div className="f-hint">{t('force.rule')}</div>}
        </div>

        <div className="f-group">
          <label className="f-label" htmlFor="fp-cf">{t('force.confirm')}</label>
          <input id="fp-cf" className="f-input" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          {mismatch ? <div className="f-err">{t('force.mismatch')}</div> : null}
        </div>

        <button className="btn btn-primary force-submit" disabled={busy || !canSubmit}>
          {busy ? <span className="spinner" /> : t('force.submit')}
        </button>
        <button type="button" className="btn btn-ghost force-signout" onClick={logout}>
          {t('force.signout').replace('{email}', user?.email ?? '')}
        </button>
      </form>
    </div>
  );
}

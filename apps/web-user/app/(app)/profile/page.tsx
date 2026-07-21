'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Profile } from '@/lib/types';
import { fmtDate } from '@/lib/format';

const MAX_AVATAR_MB = 2;

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { push } = useToast();
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | 'avatar' | null>(null);

  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<Profile>('/me/profile')
      .then((p) => {
        setMe(p);
        setFullName(p.fullName);
        setDepartment(p.department ?? '');
        setPersonalEmail(p.personalEmail ?? '');
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const initials = (me?.fullName || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy('profile');
    try {
      const p = await api.put<Profile>('/me/profile', {
        fullName,
        department,
        // '' clears it; undefined would leave the stored value alone.
        personalEmail: personalEmail.trim() || undefined,
      });
      setMe(p);
      push(t('profile.saved'), 'success');
      // The name shows in the topbar and on bookings — refresh so it is not stale.
      window.dispatchEvent(new Event('mn:profile'));
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally { setBusy(null); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { push(t('profile.pw_mismatch'), 'error'); return; }
    setBusy('password');
    try {
      await api.put('/me/profile/password', { currentPassword, newPassword });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      push(t('profile.pw_changed'), 'success');
    } catch (e: any) {
      push(e?.message || t('profile.pw_failed'), 'error');
    } finally { setBusy(null); }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';           // let the same file be re-picked
    if (!f) return;
    if (f.size > MAX_AVATAR_MB * 1024 * 1024) { push(t('profile.avatar_too_big'), 'error'); return; }
    setBusy('avatar');
    try {
      const { url } = await api.upload<{ url: string }>('/uploads/avatar', f);
      const p = await api.put<Profile>('/me/profile', { avatarUrl: url });
      setMe(p);
      push(t('profile.avatar_saved'), 'success');
      window.dispatchEvent(new Event('mn:profile'));
    } catch (err: any) {
      push(err?.message || t('profile.avatar_failed'), 'error');
    } finally { setBusy(null); }
  }

  async function removeAvatar() {
    setBusy('avatar');
    try {
      setMe(await api.put<Profile>('/me/profile', { avatarUrl: '' }));
      push(t('profile.avatar_removed'), 'success');
      window.dispatchEvent(new Event('mn:profile'));
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="card">
        <div className="section-head"><h3>{t('profile.picture')}</h3></div>
        <div className="avatar-edit">
          <div className="avatar-lg">
            {me?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={me.avatarUrl} alt="" />
              : <span>{initials}</span>}
          </div>
          <div className="avatar-edit-actions">
            <div className="f-hint" style={{ marginBottom: 10 }}>{t('profile.picture_hint')}</div>
            <div className="row-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'avatar'}
                onClick={() => fileRef.current?.click()}>
                {busy === 'avatar' ? <span className="spinner" /> : t('profile.upload')}
              </button>
              {me?.avatarUrl ? (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy === 'avatar'}
                  onClick={removeAvatar}>{t('profile.remove_picture')}</button>
              ) : null}
            </div>
            <input ref={fileRef} type="file" hidden onChange={onPickAvatar}
              accept="image/png,image/jpeg,image/gif,image/webp" />
          </div>
        </div>
      </div>

      <form className="card" onSubmit={saveProfile}>
        <div className="section-head">
          <div>
            <h3>{t('profile.details')}</h3>
            <div className="card-sub">{t('profile.member_since')} {me ? fmtDate(me.createdAt) : ''}</div>
          </div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('profile.name')}</label>
          <input className="f-input" value={fullName} onChange={(e) => setFullName(e.target.value)}
            required minLength={2} maxLength={80} />
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('profile.work_email')}</label>
            <input className="f-input" value={me?.email ?? ''} disabled />
            <div className="f-hint">{t('profile.work_email_hint')}</div>
          </div>
          <div className="f-group">
            <label className="f-label">{t('profile.department')}</label>
            <input className="f-input" value={department} onChange={(e) => setDepartment(e.target.value)}
              maxLength={80} placeholder={t('profile.department_ph')} />
          </div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('profile.personal_email')}</label>
          <input className="f-input" type="email" value={personalEmail}
            onChange={(e) => setPersonalEmail(e.target.value)} placeholder="you@gmail.com" />
          <div className="f-hint">{t('profile.personal_email_hint')}</div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('profile.language')}</label>
          <div className="row-actions">
            {(['en', 'id'] as const).map((l) => (
              <button key={l} type="button" className={`filter-pill ${lang === l ? 'active' : ''}`}
                aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'en' ? 'English' : 'Bahasa Indonesia'}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" disabled={busy === 'profile'}>
            {busy === 'profile' ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </form>

      <form className="card" onSubmit={changePassword}>
        <div className="section-head">
          <div>
            <h3>{t('profile.password')}</h3>
            <div className="card-sub">{t('profile.password_sub')}</div>
          </div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('profile.current_password')}</label>
          <input className="f-input" type="password" autoComplete="current-password"
            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('profile.new_password')}</label>
            <input className="f-input" type="password" autoComplete="new-password" minLength={8}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            <div className="f-hint">{t('profile.password_rule')}</div>
          </div>
          <div className="f-group">
            <label className="f-label">{t('profile.confirm_password')}</label>
            <input className="f-input" type="password" autoComplete="new-password" minLength={8}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            {confirmPassword && newPassword !== confirmPassword ? (
              <div className="f-hint" style={{ color: '#9E2C35' }}>{t('profile.pw_mismatch')}</div>
            ) : null}
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" disabled={busy === 'password'}>
            {busy === 'password' ? <span className="spinner" /> : t('profile.change_password')}
          </button>
        </div>
      </form>
    </div>
  );
}

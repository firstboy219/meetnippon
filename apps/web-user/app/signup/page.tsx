'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function SignupPage() {
  const { t } = useI18n();
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ workspace: string } | null>(null);

  function onSlug(v: string) {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await api.post<{ workspace: string }>('/onboarding/register',
        { orgName, slug, adminFullName, adminEmail, password }, false);
      setDone({ workspace: res.workspace });
    } catch (e: any) { setErr(e?.message || t('signup.fail')); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand-mark" />
        <h1>{t('signup.hero_t1')}<br />{t('signup.hero_t2')}</h1>
        <p>{t('signup.hero_sub')}</p>
      </div>
      <div className="login-panel">
        {done ? (
          <div className="login-card">
            <div className="success-icon" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-tint)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>✓</div>
            <h2 style={{ textAlign: 'center' }}>{t('signup.done_title')}</h2>
            <div className="sub" style={{ textAlign: 'center' }}>{t('signup.done_pre')} <b>{done.workspace}</b> {t('signup.done_post')}</div>
            <Link href="/login" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>{t('signup.goto')}</Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={submit}>
            <h2>{t('signup.title')}</h2>
            <div className="sub">{t('signup.sub')}</div>
            {err ? <div className="err-box">{err}</div> : null}
            <div className="f-group"><label className="f-label">{t('signup.org')}</label>
              <input className="f-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="PT Contoh" /></div>
            <div className="f-group"><label className="f-label">{t('signup.slug')}</label>
              <input className="f-input" value={slug} onChange={(e) => onSlug(e.target.value)} required placeholder="contoh" minLength={3} />
              <div className="f-hint">{t('signup.slug_hint')}</div></div>
            <div className="f-group"><label className="f-label">{t('signup.name')}</label>
              <input className="f-input" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required /></div>
            <div className="f-group"><label className="f-label">{t('signup.email')}</label>
              <input className="f-input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="you@company.com" />
              <div className="f-hint">{t('signup.email_hint')}</div></div>
            <div className="f-group"><label className="f-label">{t('signup.password')}</label>
              <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? <span className="spinner" /> : t('signup.submit')}</button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              {t('signup.have')} <Link href="/login" className="link">{t('signup.signin')}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

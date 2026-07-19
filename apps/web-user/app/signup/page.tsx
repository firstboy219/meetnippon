'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function SignupPage() {
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
    } catch (e: any) { setErr(e?.message || 'Registration failed.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <div className="brand-mark" />
        <h1>Create your<br />workspace</h1>
        <p>Spin up a MeetNippon workspace for your team in under a minute — rooms, desks, approvals, chat, all included.</p>
      </div>
      <div className="login-panel">
        {done ? (
          <div className="login-card">
            <div className="success-icon" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-tint)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px' }}>✓</div>
            <h2 style={{ textAlign: 'center' }}>Workspace ready</h2>
            <div className="sub" style={{ textAlign: 'center' }}>Your workspace <b>{done.workspace}</b> is set up. Sign in with the admin account you just created.</div>
            <Link href="/login" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>Go to sign in</Link>
          </div>
        ) : (
          <form className="login-card" onSubmit={submit}>
            <h2>Get started</h2>
            <div className="sub">Free plan — up to 10 users and 5 resources.</div>
            {err ? <div className="err-box">{err}</div> : null}
            <div className="f-group"><label className="f-label">Organization name</label>
              <input className="f-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} required placeholder="PT Contoh" /></div>
            <div className="f-group"><label className="f-label">Workspace address</label>
              <input className="f-input" value={slug} onChange={(e) => onSlug(e.target.value)} required placeholder="contoh" minLength={3} />
              <div className="f-hint">Letters, numbers, hyphens. Used to sign in.</div></div>
            <div className="f-group"><label className="f-label">Your name</label>
              <input className="f-input" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} required /></div>
            <div className="f-group"><label className="f-label">Work email</label>
              <input className="f-input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required placeholder="you@company.com" />
              <div className="f-hint">Company email required (public domains not allowed).</div></div>
            <div className="f-group"><label className="f-label">Password</label>
              <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? <span className="spinner" /> : 'Create workspace'}</button>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
              Already have one? <Link href="/login" className="link">Sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

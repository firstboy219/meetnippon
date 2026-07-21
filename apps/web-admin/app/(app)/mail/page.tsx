'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { MailSettings, MailSettingsResponse, MailStatus } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

/** Common providers, so an admin does not have to look up host/port. */
const PRESETS: { key: string; label: string; host: string; port: number; note?: string }[] = [
  { key: 'gmail', label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, note: 'gmail' },
  { key: 'outlook', label: 'Microsoft 365 / Outlook', host: 'smtp.office365.com', port: 587 },
  { key: 'ses', label: 'Amazon SES', host: 'email-smtp.ap-southeast-1.amazonaws.com', port: 587 },
  { key: 'resend', label: 'Resend', host: 'smtp.resend.com', port: 587 },
  { key: 'custom', label: 'Custom', host: '', port: 587 },
];

export default function MailPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [saved, setSaved] = useState<MailSettings | null>(null);
  const [fallback, setFallback] = useState(false);
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'send' | null>(null);

  const [preset, setPreset] = useState('gmail');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [touchedPassword, setTouchedPassword] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<MailSettingsResponse>('/admin/mail/settings')
      .then((r) => {
        setFallback(r.platformFallbackAvailable);
        setSaved(r.settings);
        if (r.settings) {
          setHost(r.settings.host);
          setPort(String(r.settings.port));
          setUsername(r.settings.username);
          setFromName(r.settings.fromName ?? '');
          setFromEmail(r.settings.fromEmail ?? '');
          setEnabled(r.settings.enabled);
          setPreset(PRESETS.find((p) => p.host === r.settings!.host)?.key ?? 'custom');
        }
      })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  function applyPreset(key: string) {
    setPreset(key);
    const p = PRESETS.find((x) => x.key === key);
    if (p && p.key !== 'custom') { setHost(p.host); setPort(String(p.port)); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy('save');
    try {
      const payload: Record<string, unknown> = {
        host, port: Number(port), username,
        fromName: fromName || undefined,
        fromEmail: fromEmail || undefined,
        enabled,
      };
      // Only send the password when the admin actually typed one; otherwise the
      // stored value must survive an edit to any other field.
      if (touchedPassword) payload.password = password;
      await api.put('/admin/mail/settings', payload);
      push(t('mail.saved'), 'success');
      setPassword(''); setTouchedPassword(false); setStatus(null);
      load();
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally { setBusy(null); }
  }

  async function test() {
    setBusy('test');
    try {
      const r = await api.get<MailStatus>('/admin/mail/status');
      setStatus(r);
      push(r.ok ? t('mail.conn_ok') : t('mail.conn_fail'), r.ok ? 'success' : 'error');
    } catch (e: any) {
      push(e?.message || t('mail.conn_fail'), 'error');
    } finally { setBusy(null); }
  }

  async function sendTest() {
    setBusy('send');
    try {
      const r = await api.post<{ sent: boolean; to: string; detail: string }>('/admin/mail/test', {});
      push(r.sent ? `${t('mail.sent_to')} ${r.to}` : r.detail, r.sent ? 'success' : 'error');
      if (!r.sent) test();
    } catch (e: any) {
      push(e?.message || t('mail.send_fail'), 'error');
    } finally { setBusy(null); }
  }

  async function clear() {
    setBusy('save');
    try {
      await api.del('/admin/mail/settings');
      push(t('mail.cleared'), 'success');
      setSaved(null); setHost(''); setUsername(''); setPassword(''); setFromName(''); setFromEmail('');
      setStatus(null); load();
    } catch (e: any) {
      push(e?.message || t('common.delete_failed'), 'error');
    } finally { setBusy(null); }
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

  const activePreset = PRESETS.find((p) => p.key === preset);

  return (
    <div>
      <div className="page-head"><h1>{t('mail.title')}</h1></div>

      <div className={`mail-state ${saved?.enabled ? (status?.ok ? 'ok' : 'unknown') : 'off'}`}>
        <div>
          <strong>
            {!saved ? t('mail.state_none') : !saved.enabled ? t('mail.state_off')
              : status?.ok ? t('mail.state_ok')
              : saved.lastError ? t('mail.state_error') : t('mail.state_untested')}
          </strong>
          <div className="mail-state-sub">
            {!saved
              ? (fallback ? t('mail.state_none_fallback') : t('mail.state_none_nothing'))
              : saved.lastError ? saved.lastError
              : saved.lastVerifiedAt ? `${t('mail.last_ok')} ${fmtDateTime(saved.lastVerifiedAt)}`
              : t('mail.state_untested_sub')}
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !saved} onClick={test}>
            {busy === 'test' ? <span className="spinner" /> : t('mail.test_conn')}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !saved} onClick={sendTest}>
            {busy === 'send' ? <span className="spinner" /> : t('mail.send_test')}
          </button>
        </div>
      </div>

      {status && !status.ok ? (
        <div className="err-box" style={{ marginBottom: 18 }}>
          <strong>{t('mail.conn_fail')}</strong><br />{status.detail}
        </div>
      ) : null}

      <form className="card" onSubmit={save}>
        <div className="section-head">
          <div><h3>{t('mail.server')}</h3><div className="card-sub">{t('mail.server_sub')}</div></div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('mail.provider')}</label>
          <select className="f-select" value={preset} onChange={(e) => applyPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {activePreset?.note === 'gmail' ? (
            <div className="f-hint">{t('mail.gmail_hint')}</div>
          ) : null}
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('mail.host')}</label>
            <input className="f-input" value={host} onChange={(e) => setHost(e.target.value)}
              required placeholder="smtp.gmail.com" />
          </div>
          <div className="f-group">
            <label className="f-label">{t('mail.port')}</label>
            <input className="f-input" type="number" min={1} max={65535} value={port}
              onChange={(e) => setPort(e.target.value)} required />
            <div className="f-hint">{t('mail.port_hint')}</div>
          </div>
        </div>

        <div className="f-group">
          <label className="f-label">{t('mail.username')}</label>
          <input className="f-input" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder="you@company.com" autoComplete="off" />
        </div>

        <div className="f-group">
          <label className="f-label">{t('mail.password')}</label>
          <input className="f-input" type="password" value={password} autoComplete="new-password"
            placeholder={saved?.hasPassword ? t('mail.password_kept') : t('mail.password_ph')}
            onChange={(e) => { setPassword(e.target.value); setTouchedPassword(true); }} />
          <div className="f-hint">
            {saved?.hasPassword ? t('mail.password_hint_set') : t('mail.password_hint')}
          </div>
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('mail.from_name')}</label>
            <input className="f-input" value={fromName} onChange={(e) => setFromName(e.target.value)}
              placeholder="MeetNippon" />
          </div>
          <div className="f-group">
            <label className="f-label">{t('mail.from_email')}</label>
            <input className="f-input" type="email" value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)} placeholder="no-reply@company.com" />
            <div className="f-hint">{t('mail.from_hint')}</div>
          </div>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{t('mail.enabled')}</span>
        </label>

        <div className="info-box">{t('mail.security_note')}</div>

        <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" disabled={busy === 'save'}>
            {busy === 'save' ? <span className="spinner" /> : t('common.save')}
          </button>
          {saved ? (
            <button type="button" className="btn btn-danger" disabled={!!busy} onClick={clear}>
              {t('mail.clear')}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Branding } from '@/lib/types';

export default function BrandingPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0E6E55');
  const [accentColor, setAccentColor] = useState('#E4572E');
  const [subdomain, setSubdomain] = useState('');
  const [accessMode, setAccessMode] = useState<'SUBDOMAIN' | 'SHARED_URL'>('SHARED_URL');
  const [logoUrl, setLogoUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoaded(false);
    api.get<Branding | null>('/admin/branding').then((b) => {
      if (b) {
        setDisplayName(b.displayName ?? '');
        setPrimaryColor(b.primaryColor ?? '#0E6E55');
        setAccentColor(b.accentColor ?? '#E4572E');
        setSubdomain(b.subdomain ?? '');
        setAccessMode(b.accessMode ?? 'SHARED_URL');
        setLogoUrl(b.logoUrl ?? '');
      }
    }).catch(() => setErr(true)).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.put('/admin/branding', {
        displayName: displayName || undefined, primaryColor, accentColor,
        subdomain: subdomain || undefined, accessMode, logoUrl: logoUrl || undefined,
      });
      push(t('brand.saved'), 'success');
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  if (!loaded) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head"><h1>{t('brand.title')}</h1></div>
      <div className="grid grid-2">
        <form className="card" onSubmit={save}>
          <div className="f-group"><label className="f-label">{t('brand.display_name')}</label><input className="f-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nipsea Booking" /></div>
          <div className="f-row2">
            <div className="f-group"><label className="f-label">{t('brand.primary')}</label>
              <input className="f-input" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ height: 42, padding: 4 }} />
            </div>
            <div className="f-group"><label className="f-label">{t('brand.accent')}</label>
              <input className="f-input" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ height: 42, padding: 4 }} />
            </div>
          </div>
          <div className="f-group"><label className="f-label">{t('brand.logo_url')}</label><input className="f-input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></div>
          <div className="f-row2">
            <div className="f-group"><label className="f-label">{t('brand.access_mode')}</label>
              <select className="f-select" value={accessMode} onChange={(e) => setAccessMode(e.target.value as any)}>
                <option value="SHARED_URL">{t('brand.shared_url')}</option><option value="SUBDOMAIN">{t('brand.subdomain')}</option>
              </select>
            </div>
            <div className="f-group"><label className="f-label">{t('brand.subdomain')}</label><input className="f-input" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="nipsea" /></div>
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>{busy ? <span className="spinner" /> : t('brand.save')}</button>
        </form>

        <div className="card">
          <div className="card-title">{t('brand.preview')}</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', marginTop: 12 }}>
            <div style={{ background: primaryColor, color: '#fff', padding: '20px 18px' }}>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18 }}>{displayName || t('brand.your_workspace')}</div>
              <div style={{ fontSize: 12, opacity: .85 }}>{t('brand.tagline')}</div>
            </div>
            <div style={{ padding: 18, display: 'flex', gap: 10 }}>
              <span className="btn" style={{ background: primaryColor, color: '#fff' }}>{t('brand.primary_chip')}</span>
              <span className="btn" style={{ background: accentColor, color: '#fff' }}>{t('brand.accent_chip')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

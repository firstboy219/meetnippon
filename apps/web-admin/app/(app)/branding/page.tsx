'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { Branding } from '@/lib/types';

export default function BrandingPage() {
  const { push } = useToast();
  const [displayName, setDisplayName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0E6E55');
  const [accentColor, setAccentColor] = useState('#E4572E');
  const [subdomain, setSubdomain] = useState('');
  const [accessMode, setAccessMode] = useState<'SUBDOMAIN' | 'SHARED_URL'>('SHARED_URL');
  const [logoUrl, setLogoUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Branding | null>('/admin/branding').then((b) => {
      if (b) {
        setDisplayName(b.displayName ?? '');
        setPrimaryColor(b.primaryColor ?? '#0E6E55');
        setAccentColor(b.accentColor ?? '#E4572E');
        setSubdomain(b.subdomain ?? '');
        setAccessMode(b.accessMode ?? 'SHARED_URL');
        setLogoUrl(b.logoUrl ?? '');
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await api.put('/admin/branding', {
        displayName: displayName || undefined, primaryColor, accentColor,
        subdomain: subdomain || undefined, accessMode, logoUrl: logoUrl || undefined,
      });
      push('Branding saved.', 'success');
    } catch (e: any) { push(e?.message || 'Save failed.', 'error'); }
    finally { setBusy(false); }
  }

  if (!loaded) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head"><h1>Branding</h1></div>
      <div className="grid grid-2">
        <form className="card" onSubmit={save}>
          <div className="f-group"><label className="f-label">Display name</label><input className="f-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nipsea Booking" /></div>
          <div className="f-row2">
            <div className="f-group"><label className="f-label">Primary color</label>
              <input className="f-input" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ height: 42, padding: 4 }} />
            </div>
            <div className="f-group"><label className="f-label">Accent color</label>
              <input className="f-input" type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ height: 42, padding: 4 }} />
            </div>
          </div>
          <div className="f-group"><label className="f-label">Logo URL</label><input className="f-input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></div>
          <div className="f-row2">
            <div className="f-group"><label className="f-label">Access mode</label>
              <select className="f-select" value={accessMode} onChange={(e) => setAccessMode(e.target.value as any)}>
                <option value="SHARED_URL">Shared URL</option><option value="SUBDOMAIN">Subdomain</option>
              </select>
            </div>
            <div className="f-group"><label className="f-label">Subdomain</label><input className="f-input" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="nipsea" /></div>
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>{busy ? <span className="spinner" /> : 'Save branding'}</button>
        </form>

        <div className="card">
          <div className="card-title">Preview</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', marginTop: 12 }}>
            <div style={{ background: primaryColor, color: '#fff', padding: '20px 18px' }}>
              <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 18 }}>{displayName || 'Your workspace'}</div>
              <div style={{ fontSize: 12, opacity: .85 }}>Room &amp; Desk Booking</div>
            </div>
            <div style={{ padding: 18, display: 'flex', gap: 10 }}>
              <span className="btn" style={{ background: primaryColor, color: '#fff' }}>Primary</span>
              <span className="btn" style={{ background: accentColor, color: '#fff' }}>Accent</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

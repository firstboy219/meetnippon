'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';

interface Flag { key: string; enabled: boolean; config: Record<string, any>; }

const CATALOG = [
  { key: 'sso_microsoft', label: 'Microsoft 365 SSO', sso: true, desc: 'Sign in with Azure AD / Microsoft 365.' },
  { key: 'sso_google', label: 'Google SSO', sso: true, desc: 'Sign in with Google Workspace.' },
  { key: 'calendar_sync', label: 'Calendar sync', sso: false, desc: 'Push bookings to users’ calendars.' },
  { key: 'chat', label: 'Internal chat', sso: false, desc: 'Real-time messaging between members.' },
  { key: 'whatsapp', label: 'WhatsApp notifications', sso: false, desc: 'Deliver reminders & approvals over WhatsApp.' },
  { key: 'recording', label: 'Meeting recording', sso: false, desc: 'Record meetings and generate transcripts.' },
];

export default function IntegrationsPage() {
  const { push } = useToast();
  const [flags, setFlags] = useState<Record<string, Flag>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<Flag[]>('/admin/feature-flags').then((list) => {
      const map: Record<string, Flag> = {};
      list.forEach((f) => (map[f.key] = f));
      setFlags(map);
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  function get(key: string): Flag {
    return flags[key] ?? { key, enabled: false, config: { mode: 'mock' } };
  }
  function patch(key: string, next: Partial<Flag>) {
    setFlags((f) => ({ ...f, [key]: { ...get(key), ...next } }));
  }
  function patchConfig(key: string, cfg: Record<string, any>) {
    const cur = get(key);
    setFlags((f) => ({ ...f, [key]: { ...cur, config: { ...cur.config, ...cfg } } }));
  }

  async function save(key: string) {
    const f = get(key);
    try {
      await api.put('/admin/feature-flags', { key, enabled: f.enabled, config: f.config });
      push(`${key} saved.`, 'success');
    } catch (e: any) { push(e?.message || 'Save failed.', 'error'); }
  }

  if (!loaded) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head"><h1>Integrations</h1></div>
      <div className="info-box">Providers run in <b>mock</b> mode until real credentials are added. Mock SSO lets you test sign-in by entering an email on a consent prompt. Set mode to <b>live</b> and add a client ID once your Azure/Google app is registered (client secret is configured on the server).</div>
      <div className="grid grid-2">
        {CATALOG.map((c) => {
          const f = get(c.key);
          return (
            <div key={c.key} className="card">
              <div className="section-head">
                <div><div className="card-title">{c.label}</div><div className="card-sub">{c.desc}</div></div>
                <span className={`badge ${f.enabled ? 'green' : 'grey'}`}>{f.enabled ? 'On' : 'Off'}</span>
              </div>
              <label className="f-check"><input type="checkbox" checked={f.enabled} onChange={(e) => patch(c.key, { enabled: e.target.checked })} /> Enabled</label>
              <div className="f-group"><label className="f-label">Mode</label>
                <select className="f-select" value={f.config?.mode ?? 'mock'} onChange={(e) => patchConfig(c.key, { mode: e.target.value })}>
                  <option value="mock">Mock (test)</option><option value="live">Live</option>
                </select>
              </div>
              {c.sso ? (
                <>
                  <div className="f-group"><label className="f-label">Client ID</label>
                    <input className="f-input" value={f.config?.clientId ?? ''} onChange={(e) => patchConfig(c.key, { clientId: e.target.value })} placeholder="(from your OAuth app)" />
                  </div>
                  <label className="f-check"><input type="checkbox" checked={f.config?.autoProvision ?? true} onChange={(e) => patchConfig(c.key, { autoProvision: e.target.checked })} /> Auto-provision new users on first sign-in</label>
                </>
              ) : null}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => save(c.key)}>Save</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

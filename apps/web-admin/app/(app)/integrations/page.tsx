'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';

interface Flag { key: string; enabled: boolean; config: Record<string, any>; }

const CATALOG = [
  { key: 'sso_microsoft', sso: true },
  { key: 'sso_google', sso: true },
  { key: 'calendar_sync', sso: false },
  { key: 'chat', sso: false },
  { key: 'whatsapp', sso: false },
  { key: 'recording', sso: false },
];

export default function IntegrationsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [flags, setFlags] = useState<Record<string, Flag>>({});
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoaded(false);
    api.get<Flag[]>('/admin/feature-flags').then((list) => {
      const map: Record<string, Flag> = {};
      list.forEach((f) => (map[f.key] = f));
      setFlags(map);
    }).catch(() => setErr(true)).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

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
      push(t('int.saved'), 'success');
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
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
      <div className="page-head"><h1>{t('int.title')}</h1></div>
      <div className="info-box">{t('int.info')}</div>
      <div className="grid grid-2">
        {CATALOG.map((c) => {
          const f = get(c.key);
          return (
            <div key={c.key} className="card">
              <div className="section-head">
                <div><div className="card-title">{t(`int.label.${c.key}`)}</div><div className="card-sub">{t(`int.desc.${c.key}`)}</div></div>
                <span className={`badge ${f.enabled ? 'green' : 'grey'}`}>{f.enabled ? t('int.on') : t('int.off')}</span>
              </div>
              <label className="f-check"><input type="checkbox" checked={f.enabled} onChange={(e) => patch(c.key, { enabled: e.target.checked })} /> {t('int.enabled')}</label>
              <div className="f-group"><label className="f-label">{t('int.mode')}</label>
                <select className="f-select" value={f.config?.mode ?? 'mock'} onChange={(e) => patchConfig(c.key, { mode: e.target.value })}>
                  <option value="mock">{t('int.mode_mock')}</option><option value="live">{t('int.mode_live')}</option>
                </select>
              </div>
              {c.sso ? (
                <>
                  <div className="f-group"><label className="f-label">{t('int.client_id')}</label>
                    <input className="f-input" value={f.config?.clientId ?? ''} onChange={(e) => patchConfig(c.key, { clientId: e.target.value })} placeholder={t('int.client_id_ph')} />
                  </div>
                  {/* Write-only: the API never sends a stored secret back, so an
                      empty box means "unchanged", not "cleared". */}
                  <div className="f-group"><label className="f-label">{t('int.client_secret')}</label>
                    <input className="f-input" type="password" autoComplete="new-password"
                      value={f.config?.clientSecret ?? ''}
                      onChange={(e) => patchConfig(c.key, { clientSecret: e.target.value })}
                      placeholder={f.config?.hasClientSecret ? t('int.secret_set') : t('int.client_secret_ph')} />
                    <div className="f-hint">
                      {f.config?.hasClientSecret ? t('int.secret_set_hint') : t('int.client_secret_hint')}
                    </div>
                  </div>
                  {c.key === 'sso_microsoft' ? (
                    <div className="f-group"><label className="f-label">{t('int.authority')}</label>
                      <input className="f-input" value={f.config?.authority ?? ''} onChange={(e) => patchConfig(c.key, { authority: e.target.value })} placeholder={t('int.authority_ph')} />
                      <div className="f-hint">{t('int.authority_hint')}</div>
                    </div>
                  ) : null}
                  {/* Derived by the server, shown only so it can be copied into
                      the provider's app registration — never typed by hand. */}
                  <div className="f-group"><label className="f-label">{t('int.redirect_uri')}</label>
                    <div className="copy-row">
                      <input className="f-input mono" value={f.config?.redirectUri ?? ''} readOnly
                        onFocus={(e) => e.currentTarget.select()} />
                      <button type="button" className="btn btn-ghost btn-sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(String(f.config?.redirectUri ?? ''));
                          push(t('int.copied'), 'success');
                        }}>{t('int.copy')}</button>
                    </div>
                    <div className="f-hint">{t('int.redirect_uri_hint')}</div>
                  </div>
                  <label className="f-check"><input type="checkbox" checked={f.config?.autoProvision ?? true} onChange={(e) => patchConfig(c.key, { autoProvision: e.target.checked })} /> {t('int.auto_provision')}</label>
                  <div className="f-hint" style={{ marginBottom: 10 }}>{t('int.auto_provision_hint')}</div>
                </>
              ) : null}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => save(c.key)}>{t('common.save')}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

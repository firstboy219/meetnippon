'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { AuditRow } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function AuditPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<AuditRow[]>('/admin/audit').then(setRows).catch(() => setErr(true)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-head"><h1>{t('audit.title')}</h1></div>
      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : (
        <div className="card">
          {loading ? <div className="empty">{t('common.loading')}</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('th.time')}</th><th>{t('th.action')}</th><th>{t('th.entity')}</th><th>{t('th.entity_id')}</th><th>{t('th.actor')}</th></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDateTime(a.createdAt)}</td>
                      <td><span className="badge grey">{a.action}</span></td>
                      <td>{a.entity ?? '—'}</td>
                      <td className="mono">{a.entityId ?? '—'}</td>
                      <td className="mono">{a.actorId ?? t('audit.system')}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? <tr><td colSpan={5}><div className="empty">{t('audit.empty')}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

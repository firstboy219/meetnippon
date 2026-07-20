'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { AdminBooking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};
const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function AdminBookingsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const q = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<AdminBooking[]>(`/admin/bookings${q}`).then(setRows).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="page-head"><h1>{t('book.title')}</h1></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
            {t(`status.${f}`)}
          </button>
        ))}
      </div>
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
                <thead><tr><th>{t('th.when')}</th><th>{t('th.title')}</th><th>{t('th.resource')}</th><th>{t('th.approvals')}</th><th>{t('th.status')}</th></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td>{fmtDateTime(b.startTime)}</td>
                      <td style={{ fontWeight: 600 }}>{b.title}</td>
                      <td>{b.resource?.name ?? '—'}</td>
                      <td>
                        {b.approvalSteps?.length ? (
                          <div className="row-actions" style={{ flexWrap: 'wrap' }}>
                            {b.approvalSteps.map((s, n) => (
                              <span key={n} className={`badge ${BADGE[s.decision] ?? 'grey'}`}>{t(`status.${s.decision}`)}</span>
                            ))}
                          </div>
                        ) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                      </td>
                      <td><span className={`badge ${BADGE[b.status] ?? 'grey'}`}>{t(`status.${b.status}`)}</span></td>
                    </tr>
                  ))}
                  {rows.length === 0 ? <tr><td colSpan={5}><div className="empty">{t('book.empty')}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

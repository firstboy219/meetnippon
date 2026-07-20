'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Overview {
  bookings: { total: number; last30Days: number; approvalRate: number | null; byStatus: Record<string, number>; byType: Record<string, number> };
  topResources: { resourceId: string; name: string; type: string | null; bookings: number }[];
  wfhToday: { office: number; wfh: number; unknown: number };
}

const STATUS_BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    api.get<Overview>('/admin/analytics').then(setData).catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!data) return <div className="empty">{t('common.loading')}</div>;

  const maxTop = Math.max(1, ...data.topResources.map((r) => r.bookings));
  const wfhTotal = data.wfhToday.office + data.wfhToday.wfh + data.wfhToday.unknown;

  return (
    <div>
      <div className="page-head"><h1>{t('an.title')}</h1></div>
      <div className="stat-row">
        <div className="card stat"><div className="num">{data.bookings.total}</div><div className="lbl">{t('an.total')}</div></div>
        <div className="card stat"><div className="num">{data.bookings.last30Days}</div><div className="lbl">{t('an.last30')}</div></div>
        <div className="card stat"><div className="num">{data.bookings.approvalRate == null ? '—' : `${data.bookings.approvalRate}%`}</div><div className="lbl">{t('an.approval_rate')}</div></div>
        <div className="card stat"><div className="num">{data.topResources.length}</div><div className="lbl">{t('an.resources_booked')}</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="section-head"><h3>{t('an.by_status')}</h3></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(data.bookings.byStatus).map(([s, n]) => (
              <span key={s} className={`badge ${STATUS_BADGE[s] ?? 'grey'}`}>{t(`status.${s}`)}: {n}</span>
            ))}
            {Object.keys(data.bookings.byStatus).length === 0 ? <div className="empty">{t('an.no_bookings')}</div> : null}
          </div>
          <div className="section-head" style={{ marginTop: 20 }}><h3>{t('an.wfh_today')}</h3></div>
          {wfhTotal === 0 ? <div className="empty">{t('an.no_checkins')}</div> : (
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="badge teal">{t('an.office')}: {data.wfhToday.office}</span>
              <span className="badge amber">{t('an.wfh')}: {data.wfhToday.wfh}</span>
              <span className="badge grey">{t('an.unknown')}: {data.wfhToday.unknown}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-head"><h3>{t('an.top')}</h3></div>
          {data.topResources.length === 0 ? <div className="empty">{t('an.no_resource_bookings')}</div> : data.topResources.map((r) => (
            <div key={r.resourceId} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{r.name}</span><span className="card-sub">{r.bookings}</span>
              </div>
              <div style={{ height: 8, background: '#F1F0EB', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.bookings / maxTop) * 100}%`, background: 'var(--teal)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

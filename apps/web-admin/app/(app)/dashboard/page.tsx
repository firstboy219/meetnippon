'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Stats, AdminBooking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};

export default function AdminDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    Promise.all([
      api.get<Stats>('/admin/stats').then(setStats),
      api.get<AdminBooking[]>('/admin/bookings').then((b) => setBookings(b.slice(0, 8))),
    ]).catch(() => setErr(true));
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

  return (
    <div>
      <div className="stat-row">
        <div className="card stat"><div className="num">{stats?.rooms ?? '—'}</div><div className="lbl">{t('dash.rooms')}</div></div>
        <div className="card stat"><div className="num">{stats?.desks ?? '—'}</div><div className="lbl">{t('dash.desks')}</div></div>
        <div className="card stat"><div className="num">{stats?.users ?? '—'}</div><div className="lbl">{t('dash.users')}</div></div>
        <div className="card stat"><div className="num">{stats?.pendingBookings ?? '—'}</div><div className="lbl">{t('dash.pending')}</div></div>
      </div>
      <div className="card">
        <div className="section-head"><h3>{t('dash.recent')}</h3></div>
        {bookings.length === 0 ? <div className="empty">{t('dash.empty')}</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('th.when')}</th><th>{t('th.title')}</th><th>{t('th.resource')}</th><th>{t('th.status')}</th></tr></thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDateTime(b.startTime)}</td>
                    <td style={{ fontWeight: 600 }}>{b.title}</td>
                    <td>{b.resource?.name ?? '—'}</td>
                    <td><span className={`badge ${BADGE[b.status] ?? 'grey'}`}>{t(`status.${b.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Booking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending',
  WAITLIST: 'pending', REJECTED: 'booked', CANCELLED: 'booked',
};
const CANCELLABLE = ['PENDING', 'APPROVED', 'WAITLIST'];

export default function BookingsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get<Booking[]>('/bookings').then(setBookings).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    try {
      await api.post(`/bookings/${id}/cancel`, {});
      push('Booking cancelled.', 'success');
      load();
    } catch (e: any) {
      push(e?.message || 'Could not cancel.', 'error');
    }
  }

  if (loading) return <div className="empty">{t('common.loading')}</div>;

  return (
    <div className="card">
      <div className="section-head"><h3>{t('bookings.title')}</h3></div>
      {bookings.length === 0 ? (
        <div className="empty">{t('bookings.empty')}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('bookings.when')}</th>
              <th>{t('bookings.what')}</th>
              <th>{t('bookings.where')}</th>
              <th>{t('bookings.status')}</th>
              <th>{t('bookings.action')}</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{fmtDateTime(b.startTime)}</td>
                <td style={{ fontWeight: 600 }}>{b.title}</td>
                <td>{b.resource?.name ?? (b.type === 'ONLINE' ? 'Online' : '—')}</td>
                <td><span className={`swatch ${SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span></td>
                <td>
                  {CANCELLABLE.includes(b.status) ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => cancel(b.id)}>{t('common.cancel')}</button>
                  ) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AdminBooking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};
const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function AdminBookingsPage() {
  const [rows, setRows] = useState<AdminBooking[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = filter === 'ALL' ? '' : `?status=${filter}`;
    api.get<AdminBooking[]>(`/admin/bookings${q}`).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  return (
    <div>
      <div className="page-head"><h1>Bookings</h1></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      <div className="card">
        {loading ? <div className="empty">Loading…</div> : (
          <table>
            <thead><tr><th>When</th><th>Title</th><th>Resource</th><th>Approvals</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{fmtDateTime(b.startTime)}</td>
                  <td style={{ fontWeight: 600 }}>{b.title}</td>
                  <td>{b.resource?.name ?? '—'}</td>
                  <td>{b.approvalSteps?.length ? b.approvalSteps.map((s) => s.decision[0]).join(' ') : '—'}</td>
                  <td><span className={`badge ${BADGE[b.status] ?? 'grey'}`}>{b.status}</span></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5}><div className="empty">No bookings.</div></td></tr> : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

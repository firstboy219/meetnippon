'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Stats, AdminBooking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);

  useEffect(() => {
    api.get<Stats>('/admin/stats').then(setStats).catch(() => {});
    api.get<AdminBooking[]>('/admin/bookings').then((b) => setBookings(b.slice(0, 8))).catch(() => {});
  }, []);

  return (
    <div>
      <div className="stat-row">
        <div className="card stat"><div className="num">{stats?.rooms ?? '—'}</div><div className="lbl">Meeting rooms</div></div>
        <div className="card stat"><div className="num">{stats?.desks ?? '—'}</div><div className="lbl">Desks</div></div>
        <div className="card stat"><div className="num">{stats?.users ?? '—'}</div><div className="lbl">Active users</div></div>
        <div className="card stat"><div className="num">{stats?.pendingBookings ?? '—'}</div><div className="lbl">Pending approvals</div></div>
      </div>
      <div className="card">
        <div className="section-head"><h3>Recent bookings</h3></div>
        {bookings.length === 0 ? <div className="empty">No bookings yet.</div> : (
          <table>
            <thead><tr><th>When</th><th>Title</th><th>Resource</th><th>Status</th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{fmtDateTime(b.startTime)}</td>
                  <td style={{ fontWeight: 600 }}>{b.title}</td>
                  <td>{b.resource?.name ?? '—'}</td>
                  <td><span className={`badge ${BADGE[b.status] ?? 'grey'}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

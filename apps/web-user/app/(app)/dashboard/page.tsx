'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Booking } from '@/lib/types';
import { fmtTime, fmtDate, todayUtc } from '@/lib/format';

const STATUS_SWATCH: Record<string, string> = {
  APPROVED: 'available', PENDING: 'pending', WAITLIST: 'pending',
  REJECTED: 'booked', CANCELLED: 'booked', COMPLETED: 'available',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => { api.get<Booking[]>('/bookings').then(setBookings).catch(() => {}); }, []);

  const stats = useMemo(() => {
    const today = todayUtc();
    const now = Date.now();
    const weekEnd = now + 7 * 86400000;
    const active = bookings.filter((b) => ['APPROVED', 'PENDING', 'WAITLIST'].includes(b.status));
    return {
      today: active.filter((b) => b.startTime.slice(0, 10) === today).length,
      week: active.filter((b) => { const s = +new Date(b.startTime); return s >= now && s <= weekEnd; }).length,
      pending: bookings.filter((b) => b.status === 'PENDING').length,
    };
  }, [bookings]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => ['APPROVED', 'PENDING', 'WAITLIST'].includes(b.status) && +new Date(b.startTime) >= now)
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
      .slice(0, 5);
  }, [bookings]);

  return (
    <div>
      <div className="hero-band">
        <div>
          <h1>{t('dash.greeting')}, {user?.fullName?.split(' ')[0]}</h1>
          <p>{upcoming.length} upcoming booking{upcoming.length === 1 ? '' : 's'}.</p>
        </div>
        <button className="btn hero-cta" onClick={() => router.push('/book')}>{t('dash.quickbook')}</button>
      </div>

      <div className="stat-row">
        <div className="card stat"><div className="num">{stats.today}</div><div className="lbl">{t('dash.today')}</div></div>
        <div className="card stat"><div className="num">{stats.week}</div><div className="lbl">{t('dash.week')}</div></div>
        <div className="card stat"><div className="num">{stats.pending}</div><div className="lbl">{t('dash.pending')}</div></div>
        <div className="card stat"><div className="num">{bookings.length}</div><div className="lbl">Total bookings</div></div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>{t('dash.upcoming')}</h3>
          <span className="link" onClick={() => router.push('/bookings')}>{t('nav.bookings')}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">{t('bookings.empty')}</div>
        ) : upcoming.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ width: 76, textAlign: 'center', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 13, color: 'var(--teal-dark)' }}>
              {fmtTime(b.startTime)}<span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 400, fontFamily: 'Inter' }}>{fmtDate(b.startTime)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{b.resource?.name ?? (b.type === 'ONLINE' ? 'Online meeting' : '—')}</div>
            </div>
            <span className={`swatch ${STATUS_SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

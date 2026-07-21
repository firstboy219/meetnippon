'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { RoomSchedule } from '@/lib/types';
import { fmtDayLong, fmtTime, todayLocal, tzLabel } from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available',
  PENDING: 'pending', WAITLIST: 'pending',
};

/** 'YYYY-MM-DD' shifted by whole days, staying a calendar key. */
function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The page a room's QR sticker leads to.
 *
 * Lives inside the authenticated area on purpose: it names who booked each
 * slot, so scanning the sticker asks a stranger to sign in first.
 */
export default function RoomPage() {
  const { t, lang } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [day, setDay] = useState(() => todayLocal());
  const [data, setData] = useState<RoomSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setErr(false); setLoading(true);
    api.get<RoomSchedule>(`/resources/${id}/schedule?day=${day}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [id, day]);
  useEffect(() => { load(); }, [load]);

  // A door display is left open; keep it honest without a manual refresh.
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!data) return null;

  const { resource, bookings, busyNow, current, next, isToday } = data;
  const location = [resource.floor?.building?.name, resource.floor?.name].filter(Boolean).join(' · ');

  return (
    <div className="room-page">
      <div className={`room-status ${busyNow ? 'busy' : 'free'}`}>
        <div>
          <div className="room-status-name">{resource.name}</div>
          <div className="room-status-sub">
            {location || (resource.type === 'DESK' ? t('book.desk') : t('book.room'))}
            {' · '}{resource.capacity} {resource.type === 'DESK' ? t('room.seat') : t('room.people')}
          </div>
        </div>
        <div className="room-status-badge">
          <strong>{isToday ? (busyNow ? t('room.busy') : t('room.free')) : t('room.schedule')}</strong>
          {isToday && current ? (
            <span>{t('room.until')} {fmtTime(current.endTime)}</span>
          ) : isToday && next ? (
            <span>{t('room.next_at')} {fmtTime(next.startTime)}</span>
          ) : isToday ? (
            <span>{t('room.free_all_day')}</span>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="section-head">
          <div className="cal-nav">
            <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, -1))} aria-label={t('cal.prev')}>‹</button>
            <h3 style={{ minWidth: 150, textAlign: 'center' }}>{fmtDayLong(day, lang)}</h3>
            <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, 1))} aria-label={t('cal.next')}>›</button>
          </div>
          <div className="cal-head-right">
            <span className="cal-tz">{tzLabel()}</span>
            {day !== todayLocal() ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(todayLocal())}>{t('cal.today')}</button>
            ) : null}
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="empty">{t('room.empty')}</div>
        ) : (
          <ul className="cal-day-list">
            {bookings.map((b) => (
              <li key={b.id} className={`cal-day-item ${current?.id === b.id ? 'is-now' : ''}`}>
                <div className="cal-day-time">{fmtTime(b.startTime)}<span>{fmtTime(b.endTime)}</span></div>
                <div className="cal-day-body">
                  <div className="cal-day-title">{b.title}</div>
                  <div className="cal-day-meta">
                    {b.principal?.fullName ?? t('room.someone')}
                    {b.principal?.department ? ` · ${b.principal.department}` : ''}
                  </div>
                </div>
                <span className={`swatch ${SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-footer" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          <Link href="/book" className="btn btn-primary">{t('room.book_this')}</Link>
          <Link href="/calendar" className="btn btn-ghost">{t('nav.calendar')}</Link>
        </div>
      </div>
    </div>
  );
}

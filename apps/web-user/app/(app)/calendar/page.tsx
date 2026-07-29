'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import EditBookingModal from '@/components/EditBookingModal';
import MeetingComposer from '@/components/MeetingComposer';
import type { Booking, Resource } from '@/lib/types';
import {
  fmtTime, fmtDayLong, fmtMonthYear, localDateKey,
  todayLocal, tzLabel, weekdayLabels, zonedToUtcIso,
} from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending',
  WAITLIST: 'pending', REJECTED: 'booked', CANCELLED: 'booked',
};
const CHIPS_PER_CELL = 3;

/** 'YYYY-MM-DD' -> the same date shifted by `days`, staying a calendar key. */
function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function shiftMonth(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}

/**
 * The 42 day-keys of a Monday-first grid covering `monthKey`.
 * Pure calendar arithmetic — no zone is involved, because which days a month
 * has is the same everywhere. The zone only decides which day is "today" and
 * which day a booking lands on, and both of those come from format.ts.
 */
function monthGrid(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Sunday(0) sits at the end of the week
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  return Array.from({ length: 42 }, (_, i) =>
    new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i))
      .toISOString().slice(0, 10),
  );
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const params = useSearchParams();
  const today = todayLocal();
  // ?d=YYYY-MM-DD lets the booking flow hand off to the day it just filled.
  const requested = params.get('d');
  const initial = requested && DAY_KEY.test(requested) ? requested : today;
  const [month, setMonth] = useState(() => initial.slice(0, 7));
  const [selected, setSelected] = useState(initial);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [rooms, setRooms] = useState<Resource[]>([]);
  const [roomFilter, setRoomFilter] = useState('');

  useEffect(() => {
    api.get<Resource[]>('/resources').then(setRooms).catch(() => setRooms([]));
  }, []);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const days = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    // The grid's own span, converted from tenant wall clock to real instants,
    // so a booking near local midnight is fetched for the day it displays on.
    const from = zonedToUtcIso(days[0], '00:00');
    const to = zonedToUtcIso(shiftDay(days[41], 1), '00:00');
    api.get<Booking[]>(`/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(setBookings)
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      if (b.status === 'CANCELLED' || b.status === 'REJECTED') continue;
      // Room filter: an online booking has no resource, so it only shows under
      // "all rooms".
      if (roomFilter && b.resourceId !== roomFilter) continue;
      const key = localDateKey(b.startTime);
      const list = map.get(key);
      if (list) list.push(b); else map.set(key, [b]);
    }
    for (const list of map.values()) list.sort((a, z) => a.startTime.localeCompare(z.startTime));
    return map;
  }, [bookings, roomFilter]);

  const selectedList = byDay.get(selected) ?? [];

  function goToday() {
    setMonth(today.slice(0, 7));
    setSelected(today);
  }
  function step(months: number) {
    const next = shiftMonth(month, months);
    setMonth(next);
    // Keep the selection inside the month on screen so the panel stays relevant.
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  }

  return (
    <div className="cal-wrap">
      <div className="card">
        <div className="cal-head">
          <div className="cal-nav">
            <button type="button" className="cal-step" onClick={() => step(-1)} aria-label={t('cal.prev')}>‹</button>
            <h3 className="cal-month">{fmtMonthYear(month, lang)}</h3>
            <button type="button" className="cal-step" onClick={() => step(1)} aria-label={t('cal.next')}>›</button>
          </div>
          <div className="cal-head-right">
            <select className="filter-pill" value={roomFilter} aria-label={t('cal.room_filter')}
              onChange={(e) => setRoomFilter(e.target.value)}>
              <option value="">{t('cal.all_rooms')}</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span className="cal-tz">{tzLabel()}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={goToday}>{t('cal.today')}</button>
          </div>
        </div>

        {err ? (
          <div className="err-box err-row">
            <span>{t('common.load_error')}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
          </div>
        ) : null}

        <div className="cal-grid" role="grid" aria-busy={loading}>
          {weekdayLabels(lang).map((w) => (
            <div key={w} className="cal-dow">{w}</div>
          ))}
          {days.map((day) => {
            const list = byDay.get(day) ?? [];
            const outside = !day.startsWith(month);
            return (
              <button
                type="button"
                key={day}
                className={`cal-cell${outside ? ' outside' : ''}${day === today ? ' is-today' : ''}${day === selected ? ' is-sel' : ''}`}
                onClick={() => setSelected(day)}
                aria-label={fmtDayLong(day, lang)}
                aria-current={day === today ? 'date' : undefined}
              >
                <span className="cal-daynum">{Number(day.slice(8))}</span>
                {list.slice(0, CHIPS_PER_CELL).map((b) => (
                  <span key={b.id} className={`cal-chip ${SWATCH[b.status] ?? 'pending'}`} title={`${fmtTime(b.startTime)} ${b.title}`}>
                    <span className="cal-chip-time">{fmtTime(b.startTime)}</span> {b.title}
                  </span>
                ))}
                {list.length > CHIPS_PER_CELL ? (
                  <span className="cal-more">+{list.length - CHIPS_PER_CELL} {t('cal.more')}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card cal-day">
        <div className="section-head">
          <h3>{fmtDayLong(selected, lang)}</h3>
          <Link href="/book" className="link">{t('cal.book')}</Link>
        </div>
        {loading ? (
          <div className="empty">{t('common.loading')}</div>
        ) : selectedList.length === 0 ? (
          <div className="empty">{t('cal.day_empty')}</div>
        ) : (
          <ul className="cal-day-list">
            {selectedList.map((b) => {
              // Only the person who arranged it may change it, and only while
              // it is still ahead — the API enforces both, this just avoids
              // offering an action that would be refused.
              const mine = b.bookerId === user?.id || b.principalId === user?.id;
              const editable = mine && new Date(b.endTime) > new Date();
              return (
                <li key={b.id} className="cal-day-item">
                  <div className="cal-day-time">{fmtTime(b.startTime)}<span>{fmtTime(b.endTime)}</span></div>
                  <div className="cal-day-body">
                    <div className="cal-day-title">{b.title}</div>
                    <div className="cal-day-meta">{b.resource?.name ?? (b.type === 'ONLINE' ? t('common.online') : '—')}</div>
                    {editable ? (
                      <button type="button" className="link" onClick={() => setEditing(b)}>{t('common.edit')}</button>
                    ) : null}
                  </div>
                  <span className={`swatch ${SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && editing.resourceId ? (
        <MeetingComposer resourceId={editing.resourceId} resourceName={editing.resource?.name}
          booking={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      ) : editing ? (
        // A pure ONLINE booking has no resourceId, so there is no room policy
        // to drive the rich picker from — falls back to the simple form.
        <EditBookingModal booking={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      ) : null}
    </div>
  );
}

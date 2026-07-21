'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import EditBookingModal from '@/components/EditBookingModal';
import QuickBookModal from '@/components/QuickBookModal';
import type { Booking, DayGrid } from '@/lib/types';
import { fmtDayLong, fmtTime, todayLocal, tzLabel } from '@/lib/format';

/** Timeline window. Outside these hours a room is simply not shown as bookable. */
const DAY_START_H = 7;
const DAY_END_H = 20;
const SLOT_MIN = 30;
const TOTAL_MIN = (DAY_END_H - DAY_START_H) * 60;

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending', WAITLIST: 'pending',
};

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Minutes from the top of the timeline for an instant, on the tenant clock.
 * Derived from the day's own start rather than the viewer's locale, so the
 * grid lines and the blocks agree.
 */
function offsetMin(iso: string, dayStartIso: string): number {
  const mins = (new Date(iso).getTime() - new Date(dayStartIso).getTime()) / 60000;
  return mins - DAY_START_H * 60;
}

export default function SchedulePage() {
  const { t, lang } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [day, setDay] = useState(() => todayLocal());
  const [data, setData] = useState<DayGrid | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'ALL' | 'ROOM' | 'DESK'>('ROOM');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [quick, setQuick] = useState<{ roomId: string; roomName: string; start: string } | null>(null);
  const nowRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const p = new URLSearchParams({ day });
    if (kind !== 'ALL') p.set('type', kind);
    api.get<DayGrid>(`/resources/schedule?${p}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [day, kind]);
  useEffect(() => { load(); }, [load]);

  // Keep the "now" line honest without a manual refresh.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const rooms = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.rooms ?? []).filter((r) =>
      !term || `${r.name} ${r.category ?? ''} ${r.floor?.name ?? ''}`.toLowerCase().includes(term));
  }, [data, q]);

  const isToday = day === todayLocal();
  const nowPct = (() => {
    if (!isToday || !data) return null;
    const m = offsetMin(new Date().toISOString(), data.dayStart);
    return m >= 0 && m <= TOTAL_MIN ? (m / TOTAL_MIN) * 100 : null;
  })();

  const hours = Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i);

  /** Click an empty stretch of a room's row -> book that room at that time. */
  function onLaneClick(e: React.MouseEvent<HTMLDivElement>, roomId: string, roomName: string) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const raw = DAY_START_H * 60 + pct * TOTAL_MIN;
    const snapped = Math.max(DAY_START_H * 60, Math.round(raw / SLOT_MIN) * SLOT_MIN);
    const hh = String(Math.floor(snapped / 60)).padStart(2, '0');
    const mm = String(snapped % 60).padStart(2, '0');
    setQuick({ roomId, roomName, start: `${hh}:${mm}` });
  }

  return (
    <div className="sched">
      <div className="toolbar">
        <div className="cal-nav">
          <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, -1))} aria-label={t('cal.prev')}>‹</button>
          <strong className="sched-day">{fmtDayLong(day, lang)}</strong>
          <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, 1))} aria-label={t('cal.next')}>›</button>
        </div>
        {!isToday ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(todayLocal())}>{t('cal.today')}</button>
        ) : null}
        <input className="search" placeholder={t('sched.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {(['ROOM', 'DESK', 'ALL'] as const).map((k) => (
          <button key={k} type="button" className={`filter-pill ${kind === k ? 'active' : ''}`}
            aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === 'ROOM' ? t('book.room') : k === 'DESK' ? t('book.desk') : t('book.all')}
          </button>
        ))}
        <span className="cal-tz">{tzLabel()}</span>
      </div>

      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="empty">{t('common.loading')}</div>
      ) : rooms.length === 0 ? (
        <div className="empty">{t('sched.no_rooms')}</div>
      ) : (
        <div className="card sched-card">
          <div className="sched-scroll">
            <div className="sched-grid">
              <div className="sched-corner" />
              <div className="sched-hours">
                {hours.map((h) => (
                  <span key={h} className="sched-hour" style={{ left: `${((h - DAY_START_H) * 60 / TOTAL_MIN) * 100}%` }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              {rooms.map((room) => (
                <div key={room.id} className="sched-row">
                  <div className="sched-room">
                    <div className="sched-room-name">{room.name}</div>
                    <div className="sched-room-sub">
                      {room.floor?.name ? `${room.floor.name} · ` : ''}{room.capacity} {room.type === 'DESK' ? t('room.seat') : t('room.people')}
                    </div>
                  </div>
                  <div className="sched-lane" onClick={(e) => onLaneClick(e, room.id, room.name)}
                    role="button" tabIndex={0} aria-label={`${room.name} — ${t('sched.click_to_book')}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') setQuick({ roomId: room.id, roomName: room.name, start: '09:00' }); }}>
                    {hours.slice(1).map((h) => (
                      <span key={h} className="sched-line" style={{ left: `${((h - DAY_START_H) * 60 / TOTAL_MIN) * 100}%` }} />
                    ))}
                    {nowPct !== null ? <span className="sched-now" style={{ left: `${nowPct}%` }} /> : null}

                    {room.bookings.map((b) => {
                      const s = Math.max(0, offsetMin(b.startTime, data!.dayStart));
                      const e2 = Math.min(TOTAL_MIN, offsetMin(b.endTime, data!.dayStart));
                      if (e2 <= 0 || s >= TOTAL_MIN) return null;
                      const mine = b.bookerId === user?.id || b.principalId === user?.id;
                      return (
                        <button
                          type="button"
                          key={b.id}
                          className={`sched-block ${SWATCH[b.status] ?? 'pending'} ${mine ? 'mine' : ''}`}
                          style={{ left: `${(s / TOTAL_MIN) * 100}%`, width: `${((e2 - s) / TOTAL_MIN) * 100}%` }}
                          title={`${fmtTime(b.startTime)}–${fmtTime(b.endTime)} · ${b.title}`}
                          onClick={(ev) => {
                            ev.stopPropagation();   // do not also trigger "book this slot"
                            if (mine && new Date(b.endTime) > new Date()) setEditing(b as Booking);
                            else push(`${b.title} · ${b.principal?.fullName ?? ''}`, 'success');
                          }}>
                          <span className="sched-block-title">{b.title}</span>
                          <span className="sched-block-who">{b.principal?.fullName ?? ''}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="sched-hint">{t('sched.hint')}</div>
        </div>
      )}

      {quick ? (
        <QuickBookModal
          resourceId={quick.roomId} resourceName={quick.roomName}
          day={day} start={quick.start}
          onClose={() => setQuick(null)}
          onBooked={() => { setQuick(null); load(); }}
        />
      ) : null}
      {editing ? (
        <EditBookingModal booking={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      ) : null}
    </div>
  );
}

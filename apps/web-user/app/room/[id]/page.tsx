'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { PublicRoom, RoomSchedule } from '@/lib/types';
import { fmtDayLong, fmtTime, setTenantTz, todayLocal, tzLabel } from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending', WAITLIST: 'pending',
};

function shiftDay(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Where a room's QR sticker leads.
 *
 * Deliberately outside the authenticated shell: whoever is standing at the door
 * should get an answer, signed in or not. Anonymous visitors see availability
 * only — the version with meeting titles and organisers is fetched instead when
 * a session exists, so colleagues get the useful view and strangers do not
 * learn who is meeting whom.
 */
export default function PublicRoomPage() {
  const { t, lang } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [signedIn, setSignedIn] = useState(false);
  const [day, setDay] = useState(() => todayLocal());
  const [pub, setPub] = useState<PublicRoom | null>(null);
  const [full, setFull] = useState<RoomSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(false); setLoading(true);
    const hasToken = Boolean(tokenStore.access);
    try {
      // Always fetch the public view: it works either way and carries the
      // room's timezone, which the formatter needs before anything renders.
      const p = await api.publicGet<PublicRoom>(`/public/rooms/${id}/schedule?day=${day}`);
      setTenantTz(p.timezone);
      setPub(p);

      if (hasToken) {
        try {
          setFull(await api.get<RoomSchedule>(`/resources/${id}/schedule?day=${day}`));
          setSignedIn(true);
        } catch {
          // An expired token is not an error here — fall back to the public view.
          setFull(null);
          setSignedIn(false);
        }
      }
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, [id, day]);
  useEffect(() => { load(); }, [load]);

  // A door display is left open; keep "free / in use" honest.
  useEffect(() => {
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, [load]);

  /** Booking always needs an identity — send them to sign in, then back here. */
  function book() {
    if (signedIn) { router.push('/book'); return; }
    router.push(`/login?next=${encodeURIComponent(`/room/${id}`)}`);
  }

  if (loading && !pub) return <div className="room-public"><div className="empty">{t('common.loading')}</div></div>;
  if (err || !pub) {
    return (
      <div className="room-public">
        <div className="err-box err-row">
          <span>{t('room.not_found')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      </div>
    );
  }

  const room = pub.room;
  const location = [room.floor?.building?.name, room.floor?.name].filter(Boolean).join(' · ');
  const isToday = day === todayLocal();

  return (
    <div className="room-public">
      <div className="room-public-head">
        <span className="room-public-ws">{pub.workspace}</span>
        {signedIn ? <a href="/dashboard" className="link">{t('room.open_portal')}</a> : null}
      </div>

      <div className={`room-status ${pub.busyNow ? 'busy' : 'free'}`}>
        <div>
          <div className="room-status-name">{room.name}</div>
          <div className="room-status-sub">
            {location || (room.type === 'DESK' ? t('book.desk') : t('book.room'))}
            {' · '}{room.capacity} {room.type === 'DESK' ? t('room.seat') : t('room.people')}
          </div>
        </div>
        <div className="room-status-badge">
          <strong>{isToday ? (pub.busyNow ? t('room.busy') : t('room.free')) : t('room.schedule')}</strong>
          {isToday && pub.busyUntil ? <span>{t('room.until')} {fmtTime(pub.busyUntil)}</span>
            : isToday && pub.nextFrom ? <span>{t('room.next_at')} {fmtTime(pub.nextFrom)}</span>
            : isToday ? <span>{t('room.free_all_day')}</span> : null}
        </div>
      </div>

      {room.facilities?.length ? (
        <div className="room-facil">
          {room.facilities.map((f) => <span key={f} className="facil-tag">{f}</span>)}
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <div className="cal-nav">
            <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, -1))} aria-label={t('cal.prev')}>‹</button>
            <h3 style={{ minWidth: 150, textAlign: 'center' }}>{fmtDayLong(day, lang)}</h3>
            <button type="button" className="cal-step" onClick={() => setDay(shiftDay(day, 1))} aria-label={t('cal.next')}>›</button>
          </div>
          <div className="cal-head-right">
            <span className="cal-tz">{tzLabel()}</span>
            {!isToday ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDay(todayLocal())}>{t('cal.today')}</button>
            ) : null}
          </div>
        </div>

        {pub.busy.length === 0 ? (
          <div className="empty">{t('room.empty')}</div>
        ) : signedIn && full ? (
          /* Colleague view: who booked it and what for. */
          <ul className="cal-day-list">
            {full.bookings.map((b) => (
              <li key={b.id} className="cal-day-item">
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
        ) : (
          /* Anonymous view: occupied stretches only, no names, no titles. */
          <>
            <ul className="cal-day-list">
              {pub.busy.map((b) => (
                <li key={b.id} className="cal-day-item">
                  <div className="cal-day-time">{fmtTime(b.startTime)}<span>{fmtTime(b.endTime)}</span></div>
                  <div className="cal-day-body">
                    <div className="cal-day-title">{t('room.reserved')}</div>
                  </div>
                  <span className="swatch booked"><span className="dot" />{t('room.busy')}</span>
                </li>
              ))}
            </ul>
            <div className="info-box" style={{ marginTop: 14 }}>{t('room.signin_for_detail')}</div>
          </>
        )}

        <div className="modal-footer" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          <button type="button" className="btn btn-primary" onClick={book}>
            {signedIn ? t('room.book_this') : t('room.signin_to_book')}
          </button>
        </div>
      </div>
    </div>
  );
}

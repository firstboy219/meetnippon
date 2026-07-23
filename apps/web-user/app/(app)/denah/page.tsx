'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import MeetingComposer from '@/components/MeetingComposer';
import type { FloorOption, FloorPlanView } from '@/lib/types';
import { fmtTime, todayLocal, tzLabel } from '@/lib/format';

const STATE_LABEL: Record<string, string> = {
  available: 'denah.free', pending: 'denah.later', booked: 'denah.in_use', maintenance: 'denah.maintenance',
};

/**
 * The floor plan (BRD 7.2). Pins are placed by an admin as a fraction of the
 * image, so they land correctly whatever the plan's resolution.
 */
export default function DenahPage() {
  const { t } = useI18n();
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [floorId, setFloorId] = useState('');
  const [data, setData] = useState<FloorPlanView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [quick, setQuick] = useState<{ id: string; name: string; floor?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.get<FloorOption[]>('/resources/floors')
      .then((f) => { setFloors(f); setFloorId((cur) => cur || f[0]?.id || ''); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  const load = useCallback(() => {
    if (!floorId) return;
    setErr(false);
    api.get<FloorPlanView>(`/resources/floors/${floorId}/plan`)
      .then(setData).catch(() => setErr(true));
  }, [floorId]);
  useEffect(() => { load(); }, [load]);

  // Pin colours are only true for "right now", so refresh them.
  useEffect(() => {
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, [load]);

  if (loading) return <div className="empty">{t('common.loading')}</div>;

  if (!loading && floors.length === 0) {
    return (
      <div className="card">
        <div className="empty">
          {t('denah.none')}
          <div style={{ marginTop: 12 }}>
            <Link href="/book" className="btn btn-ghost btn-sm">{t('denah.use_list')}</Link>
          </div>
        </div>
      </div>
    );
  }

  const room = data?.rooms.find((r) => r.id === selected) ?? null;
  const pinned = (data?.rooms ?? []).filter((r) => r.pin);
  const unpinned = (data?.rooms ?? []).filter((r) => !r.pin);

  return (
    <div>
      <div className="toolbar">
        {floors.map((f) => (
          <button key={f.id} type="button" className={`filter-pill ${floorId === f.id ? 'active' : ''}`}
            aria-pressed={floorId === f.id} onClick={() => { setFloorId(f.id); setSelected(null); }}>
            {f.building?.name ? `${f.building.name} · ` : ''}{f.name}
          </button>
        ))}
        <div className="view-toggle" style={{ marginLeft: 'auto' }}>
          <Link href="/book" className="vt-item">{t('denah.list')}</Link>
          <span className="vt-item active">{t('denah.map')}</span>
        </div>
        <span className="cal-tz">{tzLabel()}</span>
      </div>

      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : null}

      <div className="denah-wrap">
        <div className="card denah-card">
          {data?.imageUrl ? (
            <div className="denah-plan">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.imageUrl} alt={data.floor.name} />
              {pinned.map((r) => (
                <button type="button" key={r.id}
                  className={`denah-pin ${r.state} ${selected === r.id ? 'sel' : ''}`}
                  style={{ left: `${r.pin!.x * 100}%`, top: `${r.pin!.y * 100}%` }}
                  onClick={() => setSelected(r.id)}
                  title={`${r.name} — ${t(STATE_LABEL[r.state])}`}
                  aria-label={`${r.name}, ${t(STATE_LABEL[r.state])}`}>
                  <span className="denah-pin-dot" />
                  <span className="denah-pin-label">{r.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">{t('denah.no_image')}</div>
          )}

          <div className="denah-legend">
            {(['available', 'pending', 'booked', 'maintenance'] as const).map((s) => (
              <span key={s} className="denah-legend-item">
                <span className={`denah-dot ${s}`} />{t(STATE_LABEL[s])}
              </span>
            ))}
          </div>

          {unpinned.length ? (
            <div className="f-hint denah-unpinned">
              {t('denah.unpinned')} {unpinned.map((r) => r.name).join(', ')}
            </div>
          ) : null}
        </div>

        <div className="card denah-detail">
          {!room ? (
            <div className="empty">{t('denah.pick')}</div>
          ) : (
            <>
              <div className="rd-title">{room.name}</div>
              <div className="rd-loc">
                {data?.floor.building?.name ? `${data.floor.building.name}, ` : ''}{data?.floor.name}
              </div>

              <div className="rd-row">
                <span className="k">{t('denah.status')}</span>
                <span className="v">
                  <span className={`swatch ${room.state === 'available' ? 'available' : room.state === 'booked' ? 'booked' : 'pending'}`}>
                    <span className="dot" />{t(STATE_LABEL[room.state])}
                  </span>
                </span>
              </div>
              <div className="rd-row"><span className="k">{t('denah.capacity')}</span>
                <span className="v">{room.capacity} {room.type === 'DESK' ? t('room.seat') : t('room.people')}</span></div>
              {room.category ? (
                <div className="rd-row"><span className="k">{t('th.category')}</span><span className="v">{room.category}</span></div>
              ) : null}
              {room.current ? (
                <div className="rd-row"><span className="k">{t('denah.now')}</span>
                  <span className="v">{t('room.until')} {fmtTime(room.current.endTime)}</span></div>
              ) : room.next ? (
                <div className="rd-row"><span className="k">{t('denah.next')}</span>
                  <span className="v">{fmtTime(room.next.startTime)}</span></div>
              ) : null}
              {room.policy?.requiresApproval ? (
                <div className="warn-box">{t('denah.needs_approval')}</div>
              ) : null}

              {room.facilities?.length ? (
                <div className="room-facil" style={{ marginTop: 10 }}>
                  {room.facilities.map((f) => <span key={f} className="facil-tag">{f}</span>)}
                </div>
              ) : null}

              {room.bookings.length ? (
                <ul className="cal-day-list" style={{ marginTop: 12 }}>
                  {room.bookings.map((b) => (
                    <li key={b.id} className="cal-day-item">
                      <div className="cal-day-time">{fmtTime(b.startTime)}<span>{fmtTime(b.endTime)}</span></div>
                      <div className="cal-day-body">
                        <div className="cal-day-title">{b.title}</div>
                        <div className="cal-day-meta">{b.principal?.fullName ?? ''}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="modal-footer" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
                <button type="button" className="btn btn-primary"
                  disabled={room.state === 'maintenance' || room.policy?.canBook === false}
                  title={room.policy?.canBook === false ? t('book.restricted_hint') : undefined}
                  onClick={() => setQuick({ id: room.id, name: room.name, floor: data?.floor?.name ?? null })}>
                  {room.policy?.canBook === false ? t('book.restricted')
                    : room.policy?.requiresApproval ? t('common.request_booking') : t('common.book_now')}
                </button>
                <Link href={`/room/${room.id}`} className="btn btn-ghost">{t('denah.open_room')}</Link>
              </div>
            </>
          )}
        </div>
      </div>

      {quick ? (
        <MeetingComposer resourceId={quick.id} resourceName={quick.name} resourceFloor={quick.floor}
          day={data?.day ?? todayLocal()}
          onClose={() => setQuick(null)}
          onBooked={() => { setQuick(null); load(); }} />
      ) : null}
    </div>
  );
}

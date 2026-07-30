'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Participant } from '@/lib/types';
import { toWire } from '@/lib/participants';
import { fmtDateTime, getTenantTz, tzLabel, zonedToUtcIso } from '@/lib/format';

export interface ChangeRequestDraft {
  title: string;
  description?: string;
  type: 'OFFLINE' | 'ONLINE' | 'HYBRID';
  meetingLink?: string;
  date: string;
  durationMinutes: number;
  participants: Participant[];
  notify: boolean;
}

/**
 * Ask the author of someone else's booking to free up a slice of it so this
 * meeting can exist too (tester feedback #4, extended). Nothing is booked
 * for either side here — the request lands in the author's approval queue,
 * and only their decision puts anything on the calendar.
 */
export default function RequestChangeModal({ booking, draft, onClose, onSent }: {
  booking: {
    id: string; title: string; startTime: string; endTime: string;
    ownerName?: string | null;
  };
  draft: ChangeRequestDraft;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const tz = getTenantTz();

  const local = (iso: string) => {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return fmt.format(d);
  };
  const busyStart = local(booking.startTime);
  const busyEnd = local(booking.endTime);

  // Defaults to the whole busy stretch — the common case is "I need your
  // entire slot" — but it is editable down to whichever edge is actually
  // in the way.
  const [carveStart, setCarveStart] = useState(busyStart);
  const [carveEnd, setCarveEnd] = useState(busyEnd);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const cs = toMin(carveStart);
  const ce = toMin(carveEnd);
  const bs = toMin(busyStart);
  const be = toMin(busyEnd);

  // Must land on one edge of the busy stretch — otherwise, if this is later
  // declined, your own meeting could not shrink to a single contiguous range.
  const touchesStart = cs === bs;
  const touchesEnd = ce === be;
  const withinBusy = cs >= bs && ce <= be && ce > cs;
  const valid = withinBusy && (touchesStart || touchesEnd);

  // Your own wanted range, extended by the duration already chosen in the
  // meeting form. The overlap reaching the busy slot's END means your
  // meeting keeps going past it — anchor forward from where you start
  // needing the room. Reaching the busy slot's START instead means your
  // meeting already began before it — anchor backward from where you stop
  // needing it.
  const wanted = useMemo(() => {
    if (!valid) return null;
    const dur = draft.durationMinutes;
    return touchesEnd
      ? { start: cs, end: cs + dur }
      : { start: ce - dur, end: ce };
  }, [valid, touchesEnd, cs, ce, draft.durationMinutes]);

  const fmtHM = (min: number) => {
    const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
    const m = ((min % 60) + 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wanted) return;
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/change-requests`, {
        requestedStartTime: zonedToUtcIso(draft.date, carveStart, tz),
        requestedEndTime: zonedToUtcIso(draft.date, carveEnd, tz),
        draft: {
          title: draft.title,
          ...(draft.description ? { description: draft.description } : {}),
          type: draft.type,
          ...(draft.meetingLink ? { meetingLink: draft.meetingLink } : {}),
          startTime: zonedToUtcIso(draft.date, fmtHM(wanted.start), tz),
          endTime: zonedToUtcIso(draft.date, fmtHM(wanted.end), tz),
          ...(draft.participants.length ? { participants: toWire(draft.participants) } : {}),
          notify: draft.notify,
        },
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      push(t('creq.sent'), 'success');
      onSent();
    } catch (err: any) {
      push(err?.message || t('creq.fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{t('creq.title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">
          {booking.title}
          {booking.ownerName ? ` · ${booking.ownerName}` : ''}
        </div>
        <div className="info-box">
          {t('creq.current')}: {fmtDateTime(booking.startTime)} – {fmtDateTime(booking.endTime)}
          <br />
          {t('creq.explain')}
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('creq.need_start')}</label>
            <input className="f-input" type="time" value={carveStart} min={busyStart} max={busyEnd}
              onChange={(e) => setCarveStart(e.target.value)} required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('creq.need_end')}</label>
            <input className="f-input" type="time" value={carveEnd} min={busyStart} max={busyEnd}
              onChange={(e) => setCarveEnd(e.target.value)} required />
          </div>
        </div>
        <div className="f-hint" style={{ marginBottom: 10 }}>{t('modal.tz_hint')} ({tzLabel(tz)})</div>

        {!valid ? (
          <div className="warn-box" style={{ marginBottom: 12 }}>{t('creq.edge_hint')}</div>
        ) : wanted ? (
          <div className="info-box" style={{ marginBottom: 12 }}>
            {t('creq.your_meeting')}: <strong>{fmtHM(wanted.start)}–{fmtHM(wanted.end)}</strong>
          </div>
        ) : null}

        <div className="f-group">
          <label className="f-label">{t('creq.note')}</label>
          <textarea className="f-input" rows={2} value={note} maxLength={500}
            onChange={(e) => setNote(e.target.value)} placeholder={t('creq.note_ph')} />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy || !valid}>
            {busy ? <span className="spinner" /> : t('creq.send')}
          </button>
        </div>
      </form>
    </div>
  );
}

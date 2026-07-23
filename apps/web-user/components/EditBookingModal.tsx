'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Booking, InviteResult, Participant } from '@/lib/types';
import { getTenantTz, localDateKey, tzLabel, zonedToUtcIso } from '@/lib/format';
import Participants from './Participants';
import { toWire } from '@/lib/participants';

/** Wall-clock HH:MM of an instant on the tenant's clock, for the time inputs. */
function timeIn(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: getTenantTz(),
  });
}

export default function EditBookingModal({ booking, onClose, onSaved }: {
  booking: Booking;
  onClose: () => void;
  onSaved: (updated: Booking) => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState(booking.title);
  const [date, setDate] = useState(localDateKey(booking.startTime));
  const [start, setStart] = useState(timeIn(booking.startTime));
  const [end, setEnd] = useState(timeIn(booking.endTime));
  const [participants, setParticipants] = useState<Participant[]>(booking.participants ?? []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const moved =
    date !== localDateKey(booking.startTime) ||
    start !== timeIn(booking.startTime) ||
    end !== timeIn(booking.endTime);

  // A meeting under way can still be extended or ended early, but its start
  // has already happened — the API enforces this; the form just says it.
  const inProgress =
    new Date(booking.startTime) <= new Date() && new Date(booking.endTime) > new Date();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { title, participants: toWire(participants) };
      // Times are only sent when they actually changed — the API refuses a
      // half-specified pair, and an unchanged edit should not trip re-approval.
      if (moved) {
        payload.startTime = zonedToUtcIso(date, start);
        payload.endTime = zonedToUtcIso(date, end);
      }
      const updated = await api.patch<Booking & { invites?: InviteResult }>(
        `/bookings/${booking.id}`, payload,
      );
      const n = updated.invites?.notified ?? 0;
      push(moved && n > 0 ? t('edit.saved_notified').replace('{n}', String(n)) : t('edit.saved'), 'success');
      onSaved(updated);
    } catch (err: any) {
      push(err?.message || t('common.save_failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          <h3>{t('edit.title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">
          {booking.resource?.name ?? t('common.online')}
          {booking.status === 'PENDING' ? ` · ${t('edit.pending_note')}` : ''}
        </div>

        <div className="f-group">
          <label className="f-label">{t('modal.title')}</label>
          <input className="f-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="f-group">
          <label className="f-label">{t('modal.date')}</label>
          <input className="f-input" type="date" value={date} disabled={inProgress}
            onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('modal.start')}</label>
            <input className="f-input" type="time" value={start} disabled={inProgress}
              onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('modal.end')}</label>
            <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="f-hint" style={{ marginBottom: 14 }}>
          {inProgress ? `${t('edit.in_progress')} · ` : ''}{t('modal.tz_hint')} ({tzLabel()})
        </div>

        <Participants value={participants} onChange={setParticipants} selfEmail={user?.email} />

        {moved && booking.status === 'APPROVED' ? (
          <div className="warn-box">{t('edit.reapproval_warning')}</div>
        ) : null}
        {moved && participants.length > 0 ? (
          <div className="info-box">{t('edit.will_notify').replace('{n}', String(participants.length))}</div>
        ) : null}

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

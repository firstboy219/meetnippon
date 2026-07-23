'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { fmtDateTime, getTenantTz, tzLabel, zonedToUtcIso } from '@/lib/format';

/**
 * Ask the author of someone else's booking to move it (tester feedback #4).
 * Nothing changes on the calendar here — the request lands in the author's
 * approval queue and they decide.
 */
export default function RequestChangeModal({ booking, onClose, onSent }: {
  booking: {
    id: string; title: string; startTime: string; endTime: string;
    ownerName?: string | null;
  };
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const tz = getTenantTz();

  // Prefill with the booking's own local wall-clock so "shift by an hour"
  // starts from what is on the board, not from blank fields.
  const local = (iso: string) => {
    const d = new Date(iso);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  };
  const s0 = local(booking.startTime);
  const e0 = local(booking.endTime);

  const [proposeTime, setProposeTime] = useState(true);
  const [date, setDate] = useState(s0.date);
  const [start, setStart] = useState(s0.time);
  const [end, setEnd] = useState(e0.time);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proposeTime && !note.trim()) { push(t('creq.need_something'), 'error'); return; }
    setBusy(true);
    try {
      await api.post(`/bookings/${booking.id}/change-requests`, {
        ...(proposeTime ? {
          proposedStartTime: zonedToUtcIso(date, start, tz),
          proposedEndTime: zonedToUtcIso(date, end, tz),
        } : {}),
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

        <label className="check-row">
          <input type="checkbox" checked={proposeTime} onChange={(e) => setProposeTime(e.target.checked)} />
          <span>{t('creq.propose_time')}</span>
        </label>

        {proposeTime ? (
          <>
            <div className="f-group">
              <label className="f-label">{t('modal.date')}</label>
              <input className="f-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="f-row2">
              <div className="f-group">
                <label className="f-label">{t('modal.start')}</label>
                <input className="f-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div className="f-group">
                <label className="f-label">{t('modal.end')}</label>
                <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </div>
            </div>
            <div className="f-hint" style={{ marginBottom: 12 }}>{t('modal.tz_hint')} ({tzLabel(tz)})</div>
          </>
        ) : null}

        <div className="f-group">
          <label className="f-label">{t('creq.note')}</label>
          <textarea className="f-input" rows={2} value={note} maxLength={500}
            onChange={(e) => setNote(e.target.value)} placeholder={t('creq.note_ph')} />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : t('creq.send')}
          </button>
        </div>
      </form>
    </div>
  );
}

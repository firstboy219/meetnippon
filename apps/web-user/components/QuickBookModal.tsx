'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Booking, Participant } from '@/lib/types';
import { getTenantTz, tzLabel, zonedToUtcIso } from '@/lib/format';
import Participants from './Participants';
import { toWire } from '@/lib/participants';

const DURATIONS = [30, 60, 90, 120];

/** end = start + minutes, as a wall-clock HH:MM (never rolls past 23:59). */
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Booking straight from a click on the schedule: the room, day and start are
 * already decided, so this asks only for what is genuinely missing.
 */
export default function QuickBookModal({ resourceId, resourceName, day, start, onClose, onBooked }: {
  resourceId: string; resourceName: string; day: string; start: string;
  onClose: () => void; onBooked: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(start);
  const [duration, setDuration] = useState(60);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const to = addMinutes(from, duration);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<Booking>('/bookings', {
        title,
        resourceId,
        startTime: zonedToUtcIso(day, from, getTenantTz()),
        endTime: zonedToUtcIso(day, to, getTenantTz()),
        ...(participants.length ? { participants: toWire(participants), notify: true } : {}),
      });
      push(res.status === 'PENDING' ? t('book.toast_pending') : t('book.toast_confirmed'), 'success');
      onBooked();
    } catch (err: any) {
      // The policy engine speaks in full sentences; show it rather than a generic failure.
      push(err?.message || t('book.toast_fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3>{t('sched.quick_title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">{resourceName} · {from}–{to} ({tzLabel()})</div>

        <div className="f-group">
          <label className="f-label">{t('modal.title')}</label>
          <input className="f-input" value={title} onChange={(e) => setTitle(e.target.value)}
            required autoFocus placeholder={t('modal.title_ph')} />
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('modal.start')}</label>
            <input className="f-input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('sched.duration')}</label>
            <div className="dur-row">
              {DURATIONS.map((d) => (
                <button key={d} type="button" className={`filter-pill ${duration === d ? 'active' : ''}`}
                  aria-pressed={duration === d} onClick={() => setDuration(d)}>
                  {d < 60 ? `${d}m` : `${d / 60}h`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Participants value={participants} onChange={setParticipants} selfEmail={user?.email} />

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : t('modal.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

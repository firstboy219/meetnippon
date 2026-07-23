'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { AvailabilityCheck, Booking, FreeSlots, Participant } from '@/lib/types';
import { fmtTime, getTenantTz, tzLabel, zonedToUtcIso } from '@/lib/format';
import Participants from './Participants';
import { toWire } from '@/lib/participants';

const DURATIONS = [30, 60, 90, 120];

/** "HH:MM" -> minutes since midnight, for nearest-slot sorting. */
function minOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

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
  const features = user?.features ?? [];
  const [title, setTitle] = useState('');
  const [from, setFrom] = useState(start);
  const [duration, setDuration] = useState(60);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [type, setType] = useState<'OFFLINE' | 'ONLINE' | 'HYBRID'>('OFFLINE');
  const [meetingLink, setMeetingLink] = useState('');
  const [repeat, setRepeat] = useState<'' | 'DAILY' | 'WEEKLY'>('');
  const [repeatCount, setRepeatCount] = useState(4);
  const [reminders, setReminders] = useState<number[]>([15]);
  const [record, setRecord] = useState(false);
  const [avail, setAvail] = useState<AvailabilityCheck | null>(null);
  const [free, setFree] = useState<FreeSlots | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const to = addMinutes(from, duration);

  /**
   * Schedule assistant: check the invitees against the chosen slot.
   * Debounced, because it re-runs on every time and guest-list change.
   */
  useEffect(() => {
    const emails = participants.map((p) => p.email).filter(Boolean);
    if (emails.length === 0) { setAvail(null); return; }
    const id = setTimeout(() => {
      api.post<AvailabilityCheck>('/bookings/participant-availability', {
        emails,
        startTime: zonedToUtcIso(day, from, getTenantTz()),
        endTime: zonedToUtcIso(day, to, getTenantTz()),
      }).then(setAvail).catch(() => setAvail(null));
    }, 400);
    return () => clearTimeout(id);
  }, [participants, day, from, to]);

  const clashing = (avail?.people ?? []).filter((p) => p.status === 'busy');

  /**
   * Room availability for the picked day+duration (tester feedback #5). The
   * clicked slot usually is free — the lane showed a gap — but duration
   * changes can run it into the next booking; this catches that before submit.
   */
  useEffect(() => {
    if (type === 'ONLINE') { setFree(null); return; } // no room to check
    const p = new URLSearchParams({ resourceId, day, durationMinutes: String(duration) });
    api.get<FreeSlots>(`/bookings/free-slots?${p}`).then(setFree).catch(() => setFree(null));
  }, [resourceId, day, duration, type]);

  const startAvailable = !free || type === 'ONLINE'
    ? null
    : free.slots.some((s) => s.label === from);
  /** Nearest open starts to what was clicked, as one-tap fixes. */
  const suggestions = free && startAvailable === false
    ? [...free.slots]
      .sort((a, b) =>
        Math.abs(minOf(a.label) - minOf(from)) - Math.abs(minOf(b.label) - minOf(from)))
      .slice(0, 4)
    : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<Booking>('/bookings', {
        title,
        type,
        // A pure-online meeting occupies no room, so the resource is dropped —
        // otherwise it would block a physical room nobody is sitting in.
        ...(type === 'ONLINE' ? {} : { resourceId }),
        ...(type !== 'OFFLINE' && meetingLink.trim() ? { meetingLink: meetingLink.trim() } : {}),
        startTime: zonedToUtcIso(day, from, getTenantTz()),
        endTime: zonedToUtcIso(day, to, getTenantTz()),
        ...(participants.length ? { participants: toWire(participants), notify: true } : {}),
        ...(repeat ? { recurrence: { freq: repeat, count: repeatCount } } : {}),
        ...(reminders.length ? { reminders: reminders.map((m) => ({ offsetMinutes: m, channel: 'app' })) } : {}),
        ...(record ? { recordingRequested: true } : {}),
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

        {startAvailable === false ? (
          <div className="warn-box">
            {t('book.slot_taken')}
            {suggestions.length ? (
              <div className="dur-row" style={{ marginTop: 8 }}>
                {suggestions.map((s) => (
                  <button key={s.startTime} type="button" className="filter-pill"
                    onClick={() => setFrom(s.label)}>{s.label}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="f-group">
          <label className="f-label">{t('modal.meeting_type')}</label>
          <div className="row-actions">
            {(['OFFLINE', 'ONLINE', 'HYBRID'] as const).map((k) => (
              <button key={k} type="button" className={`filter-pill ${type === k ? 'active' : ''}`}
                aria-pressed={type === k} onClick={() => setType(k)}>
                {t(`modal.type_${k.toLowerCase()}`)}
              </button>
            ))}
          </div>
          {type === 'ONLINE' ? (
            <div className="f-hint">{t('modal.online_no_room')}</div>
          ) : null}
        </div>

        {type !== 'OFFLINE' ? (
          <div className="f-group">
            <label className="f-label">{t('modal.meeting_link')}</label>
            <input className="f-input" type="url" value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://teams.microsoft.com/…" />
          </div>
        ) : null}

        <Participants value={participants} onChange={setParticipants} selfEmail={user?.email} />

        {/* Schedule assistant — surfaced only when it has something to say. */}
        {clashing.length ? (
          <div className="warn-box">
            <strong>{t('assist.clash_title')}</strong>
            <ul className="assist-list">
              {clashing.map((p) => (
                <li key={p.email}>
                  {p.fullName ?? p.email} — {t('assist.busy')} {p.busy.map((b) => `${fmtTime(b.startTime)}–${fmtTime(b.endTime)}`).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        ) : avail && avail.checked > 0 ? (
          <div className="info-box">{t('assist.all_free')}</div>
        ) : null}

        <details className="more-opts">
          <summary>{t('modal.more_options')}</summary>

          <div className="f-group" style={{ marginTop: 12 }}>
            <label className="f-label">{t('modal.repeat')}</label>
            <div className="row-actions">
              {([['', 'once'], ['DAILY', 'daily'], ['WEEKLY', 'weekly']] as const).map(([v, k]) => (
                <button key={k} type="button" className={`filter-pill ${repeat === v ? 'active' : ''}`}
                  aria-pressed={repeat === v} onClick={() => setRepeat(v)}>
                  {t(`modal.repeat_${k}`)}
                </button>
              ))}
            </div>
            {repeat ? (
              <>
                <div className="f-row2" style={{ marginTop: 10 }}>
                  <div className="f-group" style={{ marginBottom: 0 }}>
                    <label className="f-label">{t('modal.occurrences')}</label>
                    <input className="f-input" type="number" min={2} max={52} value={repeatCount}
                      onChange={(e) => setRepeatCount(Math.min(52, Math.max(2, Number(e.target.value) || 2)))} />
                  </div>
                </div>
                {/* Every occurrence is validated against the room's rules, so a
                    clash in week 3 stops the whole series rather than booking
                    a partial one. */}
                <div className="f-hint">{t('modal.repeat_hint')}</div>
              </>
            ) : null}
          </div>

          <div className="f-group">
            <label className="f-label">{t('modal.remind_me')}</label>
            <div className="row-actions">
              {[10, 15, 30, 60].map((m) => (
                <button key={m} type="button"
                  className={`filter-pill ${reminders.includes(m) ? 'active' : ''}`}
                  aria-pressed={reminders.includes(m)}
                  onClick={() => setReminders((r) => r.includes(m) ? r.filter((x) => x !== m) : [...r, m].sort((a, b) => a - b))}>
                  {m < 60 ? `${m} ${t('modal.min_before')}` : `1 ${t('modal.hour_before')}`}
                </button>
              ))}
            </div>
            <div className="f-hint">{reminders.length ? t('modal.remind_hint') : t('modal.remind_none')}</div>
          </div>

          {features.includes('recording') ? (
            <label className="check-row">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} />
              <span>{t('modal.record')}</span>
            </label>
          ) : null}
          {record ? <div className="warn-box">{t('modal.record_consent')}</div> : null}
        </details>

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

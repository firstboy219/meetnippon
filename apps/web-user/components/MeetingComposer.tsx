'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { AvailabilityCheck, Booking, FreeWindows, Participant } from '@/lib/types';
import { fmtTime, getTenantTz, todayLocal, tzLabel } from '@/lib/format';
import Participants from './Participants';
import { toWire } from '@/lib/participants';

const DURATION_CHIPS = [30, 45, 60, 90, 120];
type MeetingType = 'OFFLINE' | 'ONLINE' | 'HYBRID';

/** "1h", "45m", "1h 30m" from a minute count. */
function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

/** Wall-clock HH:MM of an instant on the tenant's clock. */
function hm(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ms));
}

export interface MeetingComposerProps {
  resourceId: string;
  resourceName?: string;
  resourceFloor?: string | null;
  /** Initial date (tenant-local YYYY-MM-DD). Defaults to today. */
  day?: string;
  /** Optional start to preselect once the day's windows load, as "HH:MM". */
  initialStart?: string;
  onClose: () => void;
  onBooked: (result: { status: string; dayKey: string }) => void;
}

/**
 * The one create-meeting form, used from every entry point (Book, Room
 * Schedule, Denah). Time is chosen from what is genuinely open: pick a duration
 * (preset or typed), then a start, then — the part that was missing — an end,
 * offered only as far as the room stays free. Participants can be checked for
 * clashes and a meeting link added, so the same rich form is everywhere.
 */
export default function MeetingComposer({
  resourceId, resourceName, resourceFloor, day, initialStart, onClose, onBooked,
}: MeetingComposerProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const tz = getTenantTz();
  const features = user?.features ?? [];

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(day ?? todayLocal());
  const [duration, setDuration] = useState(60);
  const [type, setType] = useState<MeetingType>('OFFLINE');
  const [meetingLink, setMeetingLink] = useState('');
  const [pickedStart, setPickedStart] = useState<number | null>(null);
  const [pickedEnd, setPickedEnd] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reminders, setReminders] = useState<number[]>([15]);
  const [repeat, setRepeat] = useState<'' | 'DAILY' | 'WEEKLY'>('');
  const [repeatCount, setRepeatCount] = useState(4);
  const [record, setRecord] = useState(false);

  const [fw, setFw] = useState<FreeWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [avail, setAvail] = useState<AvailabilityCheck | null>(null);
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [appliedInitial, setAppliedInitial] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (step === 'confirm') setStep('form'); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  // One request per room+day; duration and start/end are all derived client-side
  // from the returned free windows.
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ resourceId, day: date });
    api.get<FreeWindows>(`/bookings/free-windows?${p}`)
      .then((r) => {
        setFw(r);
        setDuration((d) => Math.min(Math.max(d, r.minDurationMinutes), r.maxDurationMinutes));
      })
      .catch(() => setFw(null))
      .finally(() => setLoading(false));
    setPickedStart(null);
    setPickedEnd(null);
  }, [resourceId, date]);

  const anchor = fw ? new Date(fw.gridAnchor).getTime() : 0;
  const stepMs = (fw?.slotStepMinutes ?? 30) * 60000;
  const nowMs = fw ? new Date(fw.now).getTime() : Date.now();
  const minDur = fw?.minDurationMinutes ?? 15;
  const maxDur = fw?.maxDurationMinutes ?? 480;
  const allowExternal = fw?.allowExternalParticipants ?? true;
  const allowRecurring = fw?.allowRecurring ?? true;
  const durMs = duration * 60000;

  // ONLINE meetings hold no room, so they run against the whole day, not the
  // room's free gaps.
  const windows = useMemo(() => {
    if (!fw) return [] as { s: number; e: number }[];
    const src = type === 'ONLINE' ? (fw.dayWindow ? [fw.dayWindow] : []) : fw.windows;
    return src.map((w) => ({ s: new Date(w.start).getTime(), e: new Date(w.end).getTime() }));
  }, [fw, type]);

  const startOptions = useMemo(() => {
    const out: number[] = [];
    for (const w of windows) {
      let tms = anchor + Math.ceil((w.s - anchor) / stepMs) * stepMs;
      for (; tms + durMs <= w.e; tms += stepMs) {
        if (tms >= nowMs) out.push(tms);
      }
    }
    return out;
  }, [windows, anchor, stepMs, durMs, nowMs]);

  // End options for the chosen start: snapped to the same :00/:30 grid as the
  // starts (so a 1-hour default lands on a round 08:00, not 07:15), from the
  // first grid point that satisfies the minimum duration up to the window end,
  // capped at the max. The exact end for the chosen duration is always included
  // too, so an off-grid duration (45m, or a manual value) stays selectable.
  const endOptions = useMemo(() => {
    if (pickedStart == null) return [] as number[];
    const w = windows.find((x) => pickedStart >= x.s && pickedStart < x.e);
    if (!w) return [];
    const set = new Set<number>();
    let e = anchor + Math.ceil((pickedStart + minDur * 60000 - anchor) / stepMs) * stepMs;
    for (; e <= w.e && e - pickedStart <= maxDur * 60000; e += stepMs) set.add(e);
    const exact = pickedStart + durMs;
    if (exact > pickedStart && exact <= w.e && durMs >= minDur * 60000 && durMs <= maxDur * 60000) {
      set.add(exact);
    }
    return [...set].sort((a, b) => a - b);
  }, [pickedStart, windows, minDur, maxDur, stepMs, anchor, durMs]);

  // Keep the picked start valid as duration/type/day change; drop it otherwise.
  useEffect(() => {
    if (pickedStart == null) return;
    if (!startOptions.includes(pickedStart)) { setPickedStart(null); setPickedEnd(null); return; }
    const w = windows.find((x) => pickedStart >= x.s && pickedStart < x.e);
    const want = Math.min(pickedStart + durMs, w ? w.e : pickedStart + durMs);
    setPickedEnd(want);
  }, [startOptions, durMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preselect the start the caller arrived with (a click on the schedule),
  // once, after the first windows load.
  useEffect(() => {
    if (appliedInitial || !fw || !initialStart) return;
    const hit = startOptions.find((ms) => hm(ms, tz) === initialStart);
    if (hit != null) { setPickedStart(hit); setPickedEnd(hit + durMs); }
    setAppliedInitial(true);
  }, [fw, startOptions, initialStart, appliedInitial, durMs, tz]);

  function chooseStart(ms: number) {
    setPickedStart(ms);
    const w = windows.find((x) => ms >= x.s && ms < x.e);
    setPickedEnd(Math.min(ms + durMs, w ? w.e : ms + durMs));
  }
  function chooseEnd(ms: number) {
    if (pickedStart == null) return;
    setPickedEnd(ms);
    setDuration(Math.round((ms - pickedStart) / 60000));
  }
  function setDurationClamped(min: number) {
    setDuration(Math.min(Math.max(min, minDur), maxDur));
  }

  // Schedule assistant: check invitees against the chosen slot, debounced.
  useEffect(() => {
    const emails = participants.map((p) => p.email).filter(Boolean);
    if (emails.length === 0 || pickedStart == null || pickedEnd == null) { setAvail(null); return; }
    const id = setTimeout(() => {
      api.post<AvailabilityCheck>('/bookings/participant-availability', {
        emails,
        startTime: new Date(pickedStart).toISOString(),
        endTime: new Date(pickedEnd).toISOString(),
      }).then(setAvail).catch(() => setAvail(null));
    }, 400);
    return () => clearTimeout(id);
  }, [participants, pickedStart, pickedEnd]);

  const clashing = (avail?.people ?? []).filter((p) => p.status === 'busy');

  const canSubmit = pickedStart != null && pickedEnd != null && title.trim().length > 0;

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) { push(t('compose.pick_slot'), 'error'); return; }
    if (participants.length > 0) { setStep('confirm'); return; }
    void submit();
  }

  const submit = useCallback(async () => {
    if (pickedStart == null || pickedEnd == null) return;
    setBusy(true);
    try {
      const res = await api.post<Booking>('/bookings', {
        title: title.trim(),
        type,
        // A pure-online meeting occupies no room, so the resource is dropped.
        ...(type === 'ONLINE' ? {} : { resourceId }),
        ...(type !== 'OFFLINE' && meetingLink.trim() ? { meetingLink: meetingLink.trim() } : {}),
        startTime: new Date(pickedStart).toISOString(),
        endTime: new Date(pickedEnd).toISOString(),
        ...(participants.length ? { participants: toWire(participants), notify } : {}),
        ...(repeat && allowRecurring ? { recurrence: { freq: repeat, count: repeatCount } } : {}),
        ...(reminders.length ? { reminders: reminders.map((m) => ({ offsetMinutes: m, channel: 'app' })) } : {}),
        ...(record ? { recordingRequested: true } : {}),
      });
      const base = res.status === 'PENDING' ? t('book.toast_pending') : t('book.toast_confirmed');
      const n = participants.length && notify ? participants.length : 0;
      push(n > 0 ? `${base} ${t('book.toast_notified').replace('{n}', String(n))}` : base, 'success');
      onBooked({ status: res.status, dayKey: date });
    } catch (err: any) {
      push(err?.message || t('book.toast_fail'), 'error');
      setStep('form');
    } finally {
      setBusy(false);
    }
  }, [pickedStart, pickedEnd, title, type, resourceId, meetingLink, participants, notify,
    repeat, allowRecurring, repeatCount, reminders, record, date, onBooked, push, t]);

  const internal = participants.filter((p) => !p.external);

  if (step === 'confirm') {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>{t('invite.title')}</h3>
            <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
          </div>
          <p className="modal-sub">{t('invite.sub').replace('{n}', String(participants.length))}</p>
          <ul className="invite-list">
            {participants.map((p) => (
              <li key={p.email}><span>{p.name || p.email}</span>{p.external ? <em>{t('part.external')}</em> : null}</li>
            ))}
          </ul>
          <label className="check-row">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>{t('invite.send')}</span>
          </label>
          {notify && internal.length > 0 ? (
            <div className="info-box">{t('invite.inapp').replace('{n}', String(internal.length))}</div>
          ) : null}
          {notify && participants.length > 0 ? (
            <div className="info-box">{t('invite.email').replace('{n}', String(participants.length))}</div>
          ) : null}
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('form')}>{t('common.back')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? <span className="spinner" /> : t('invite.confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={next}>
        <div className="modal-head">
          <h3>{t('modal.new_booking')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">
          {type === 'ONLINE' ? t('modal.type_online') : resourceName}
          {type !== 'ONLINE' && resourceFloor ? ` · ${resourceFloor}` : ''}
          {pickedStart != null && pickedEnd != null
            ? ` · ${hm(pickedStart, tz)}–${hm(pickedEnd, tz)} (${tzLabel(tz)})`
            : ''}
        </div>

        <div className="f-group">
          <label className="f-label">{t('modal.title')}</label>
          <input className="f-input" value={title} onChange={(e) => setTitle(e.target.value)}
            required autoFocus placeholder={t('modal.title_ph')} />
        </div>

        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('modal.date')}</label>
            <input className="f-input" type="date" value={date} min={todayLocal()}
              onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('compose.duration')}</label>
            <div className="dur-row">
              {DURATION_CHIPS.filter((d) => d >= minDur && d <= maxDur).map((d) => (
                <button key={d} type="button" className={`filter-pill ${duration === d ? 'active' : ''}`}
                  aria-pressed={duration === d} onClick={() => setDurationClamped(d)}>
                  {durationLabel(d)}
                </button>
              ))}
              {/* Manual duration, per the request — any value the policy allows. */}
              <input className="f-input dur-manual" type="number" min={minDur} max={maxDur} step={5}
                value={duration} aria-label={t('compose.duration_manual')}
                onChange={(e) => setDurationClamped(Number(e.target.value) || minDur)} />
              <span className="dur-unit">{t('compose.minutes')}</span>
            </div>
          </div>
        </div>

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
          {type === 'ONLINE' ? <div className="f-hint">{t('modal.online_no_room')}</div> : null}
        </div>

        {type !== 'OFFLINE' ? (
          <div className="f-group">
            <label className="f-label">{t('modal.meeting_link')}</label>
            <input className="f-input" type="url" value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://teams.microsoft.com/…" />
          </div>
        ) : null}

        {/* Available START times */}
        <div className="f-group">
          <label className="f-label">{t('compose.start_label')}</label>
          {loading ? (
            <div className="f-hint">{t('common.loading')}</div>
          ) : startOptions.length === 0 ? (
            <div className="warn-box">{t('compose.no_starts')}</div>
          ) : (
            <div className="slot-grid" role="listbox" aria-label={t('compose.start_label')}>
              {startOptions.map((ms) => (
                <button key={ms} type="button" role="option" aria-selected={pickedStart === ms}
                  className={`slot-chip ${pickedStart === ms ? 'active' : ''}`}
                  onClick={() => chooseStart(ms)}>{hm(ms, tz)}</button>
              ))}
            </div>
          )}
        </div>

        {/* Available END times — only as far as the room stays free */}
        {pickedStart != null && endOptions.length > 0 ? (
          <div className="f-group">
            <label className="f-label">{t('compose.end_label')}</label>
            <div className="slot-grid" role="listbox" aria-label={t('compose.end_label')}>
              {endOptions.map((ms) => (
                <button key={ms} type="button" role="option" aria-selected={pickedEnd === ms}
                  className={`slot-chip ${pickedEnd === ms ? 'active' : ''}`}
                  onClick={() => chooseEnd(ms)}>
                  {hm(ms, tz)}
                  <span className="slot-dur">{durationLabel(Math.round((ms - pickedStart) / 60000))}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {fw?.requiresApproval ? <div className="f-hint">{t('book.slots_approval')}</div> : null}

        <Participants value={participants} onChange={setParticipants} selfEmail={user?.email}
          allowExternal={allowExternal} />

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

          {allowRecurring ? (
            <div className="f-group" style={{ marginTop: 12 }}>
              <label className="f-label">{t('modal.repeat')}</label>
              <div className="row-actions">
                {([['', 'once'], ['DAILY', 'daily'], ['WEEKLY', 'weekly']] as const).map(([v, k]) => (
                  <button key={k} type="button" className={`filter-pill ${repeat === v ? 'active' : ''}`}
                    aria-pressed={repeat === v} onClick={() => setRepeat(v)}>{t(`modal.repeat_${k}`)}</button>
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
                  <div className="f-hint">{t('modal.repeat_hint')}</div>
                </>
              ) : null}
            </div>
          ) : null}

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
          <button className="btn btn-primary" disabled={busy || !canSubmit}>
            {busy ? <span className="spinner" /> : participants.length ? t('modal.review') : t('modal.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

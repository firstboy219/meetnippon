'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ChangeRequest, FreeWindows } from '@/lib/types';
import { fmtDateTime, getTenantTz, localDateKey, tzLabel } from '@/lib/format';

const DURATION_CHIPS = [30, 45, 60, 90, 120];

function hm(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ms));
}
function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

/**
 * Approving a change request means picking a new time for your OWN meeting
 * first — the window you are granting is blocked out here so it cannot be
 * picked again by mistake. Nothing moves until this is submitted.
 */
export default function ApproveRescheduleModal({ cr, onClose, onDecided }: {
  cr: ChangeRequest;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const tz = getTenantTz();

  const [fw, setFw] = useState<FreeWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const origDur = Math.round(
    (new Date(cr.booking.endTime).getTime() - new Date(cr.booking.startTime).getTime()) / 60000,
  );
  const [duration, setDuration] = useState(origDur);
  const [pickedStart, setPickedStart] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cr.booking.resourceId) { setErr(true); setLoading(false); return; }
    const day = localDateKey(cr.booking.startTime);
    const p = new URLSearchParams({ resourceId: cr.booking.resourceId, day, excludeBookingId: cr.booking.id });
    api.get<FreeWindows>(`/bookings/free-windows?${p}`)
      .then(setFw).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [cr.booking.id, cr.booking.resourceId, cr.booking.startTime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The granted window is not a real booking yet, so the server has no way
  // to exclude it — subtract it from the free windows here instead.
  const windows = useMemo(() => {
    if (!fw) return [] as { s: number; e: number }[];
    const grantedS = new Date(cr.requestedStartTime).getTime();
    const grantedE = new Date(cr.requestedEndTime).getTime();
    const out: { s: number; e: number }[] = [];
    for (const w of fw.windows) {
      const s = new Date(w.start).getTime();
      const e = new Date(w.end).getTime();
      if (grantedE <= s || grantedS >= e) { out.push({ s, e }); continue; }
      if (grantedS > s) out.push({ s, e: grantedS });
      if (grantedE < e) out.push({ s: grantedE, e });
    }
    return out;
  }, [fw, cr.requestedStartTime, cr.requestedEndTime]);

  const anchor = fw ? new Date(fw.gridAnchor).getTime() : 0;
  const stepMs = (fw?.slotStepMinutes ?? 30) * 60000;
  const durMs = duration * 60000;
  const nowMs = fw ? new Date(fw.now).getTime() : Date.now();

  const startOptions = useMemo(() => {
    const out: number[] = [];
    for (const w of windows) {
      let tms = anchor + Math.ceil((w.s - anchor) / stepMs) * stepMs;
      for (; tms + durMs <= w.e; tms += stepMs) {
        if (tms >= nowMs) out.push(tms);
      }
    }
    return out.sort((a, b) => a - b);
  }, [windows, anchor, stepMs, durMs, nowMs]);

  useEffect(() => {
    if (pickedStart != null && !startOptions.includes(pickedStart)) setPickedStart(null);
  }, [startOptions, pickedStart]);

  async function submit() {
    if (pickedStart == null) return;
    setBusy(true);
    try {
      await api.post(`/change-requests/${cr.id}/decide`, {
        decision: 'APPROVED',
        ownerNewStartTime: new Date(pickedStart).toISOString(),
        ownerNewEndTime: new Date(pickedStart + durMs).toISOString(),
      });
      push(t('creq.applied'), 'success');
      onDecided();
    } catch (err: any) {
      push(err?.message || t('appr.toast_fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal modal-sm" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="modal-head">
          <h3>{t('creq.approve_title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">{cr.booking.title}</div>
        <div className="info-box" style={{ marginBottom: 14 }}>
          {t('creq.granting')}: <strong>{fmtDateTime(cr.requestedStartTime)} – {fmtDateTime(cr.requestedEndTime)}</strong>
          <br />
          {t('creq.approve_explain')}
        </div>

        {loading ? (
          <div className="f-hint">{t('common.loading')}</div>
        ) : err || !fw ? (
          <div className="err-box">{t('common.load_error')}</div>
        ) : (
          <>
            <div className="f-group">
              <label className="f-label">{t('compose.duration')}</label>
              <div className="dur-row">
                {DURATION_CHIPS.filter((d) => d >= fw.minDurationMinutes && d <= fw.maxDurationMinutes).map((d) => (
                  <button key={d} type="button" className={`filter-pill ${duration === d ? 'active' : ''}`}
                    aria-pressed={duration === d} onClick={() => setDuration(d)}>
                    {durationLabel(d)}
                  </button>
                ))}
              </div>
            </div>

            <div className="f-group">
              <label className="f-label">{t('creq.new_start')}</label>
              {startOptions.length === 0 ? (
                <div className="warn-box">{t('compose.no_starts')}</div>
              ) : (
                <div className="slot-grid" role="listbox" aria-label={t('creq.new_start')}>
                  {startOptions.map((ms) => (
                    <button key={ms} type="button" role="option" aria-selected={pickedStart === ms}
                      className={`slot-chip ${pickedStart === ms ? 'active' : ''}`}
                      onClick={() => setPickedStart(ms)}>{hm(ms, tz)}</button>
                  ))}
                </div>
              )}
            </div>
            {pickedStart != null ? (
              <div className="f-hint" style={{ marginBottom: 4 }}>
                {hm(pickedStart, tz)}–{hm(pickedStart + durMs, tz)} ({tzLabel(tz)})
              </div>
            ) : null}
          </>
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy || loading || pickedStart == null}>
            {busy ? <span className="spinner" /> : t('creq.approve_apply')}
          </button>
        </div>
      </form>
    </div>
  );
}

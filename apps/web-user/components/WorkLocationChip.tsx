'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { WorkLocation } from '@/lib/types';

const ICON: Record<string, string> = { OFFICE: '🏢', WFH: '🏠', UNKNOWN: '📍' };

/**
 * Today's work location (BRD 7.13).
 *
 * Detection is geofence-based, so it needs the browser's coordinates — but
 * those are sent once and never stored: the server keeps only the matched
 * office name and whether the day counted as office or home. The manual
 * override exists precisely so nobody is forced to share a location at all.
 */
export default function WorkLocationChip() {
  const { t } = useI18n();
  const { push } = useToast();
  const [today, setToday] = useState<WorkLocation | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    api.get<WorkLocation | null>('/work-location/today').then(setToday).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  async function setManual(location: 'OFFICE' | 'WFH') {
    setBusy(true);
    try {
      setToday(await api.post<WorkLocation>('/work-location/report', { location }));
      setOpen(false);
      push(t('wl.saved'), 'success');
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  function detect() {
    if (!navigator.geolocation) { push(t('wl.unsupported'), 'error'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setToday(await api.post<WorkLocation>('/work-location/report', {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
          }));
          setOpen(false);
          push(t('wl.detected'), 'success');
        } catch (e: any) { push(e?.message || t('wl.detect_fail'), 'error'); }
        finally { setBusy(false); }
      },
      () => { setBusy(false); push(t('wl.denied'), 'error'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const state = today?.location ?? 'UNKNOWN';
  const label = state === 'OFFICE'
    ? (today?.officeName || t('wl.office'))
    : state === 'WFH' ? t('wl.wfh') : t('wl.unset');

  return (
    <div className="wl-chip-wrap" ref={wrapRef}>
      <button type="button" className="wl-chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{ICON[state]}</span>
        <span>{label}</span>
        <span className="wl-chip-mode">{today ? (today.isManual ? t('wl.manual') : t('wl.auto')) : ''}</span>
      </button>

      {open ? (
        <div className="wl-menu">
          <div className="wl-menu-note">{t('wl.privacy')}</div>
          <button type="button" className="wl-menu-item" disabled={busy} onClick={() => setManual('OFFICE')}>
            🏢 {t('wl.office')}
          </button>
          <button type="button" className="wl-menu-item" disabled={busy} onClick={() => setManual('WFH')}>
            🏠 {t('wl.wfh')}
          </button>
          <button type="button" className="wl-menu-item detect" disabled={busy} onClick={detect}>
            {busy ? <span className="spinner" /> : `📡 ${t('wl.detect')}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

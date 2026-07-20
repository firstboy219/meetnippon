'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Booking } from '@/lib/types';
import { fmtDateTime, fmtTime, tzLabel, zonedToUtcIso } from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending',
  WAITLIST: 'pending', REJECTED: 'booked', CANCELLED: 'booked',
};
const STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED', 'APPROVED'] as const;
const PAGE = 20;

/** 'YYYY-MM-DD' -> the calendar day after it. */
function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export default function HistoryPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Booking[]>([]);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState(false);

  /**
   * Asks for one row beyond the page; the surplus is the "there is more"
   * signal, so no total count has to cross the wire.
   */
  const fetchPage = useCallback(async (skip: number) => {
    const q = new URLSearchParams({ scope: 'past', take: String(PAGE + 1), skip: String(skip) });
    if (status) q.set('status', status);
    if (from) q.set('from', zonedToUtcIso(from, '00:00'));
    // The picker's end date reads as inclusive, but the API bound is exclusive,
    // so the window closes at the following local midnight.
    if (to) q.set('to', zonedToUtcIso(nextDay(to), '00:00'));
    const page = await api.get<Booking[]>(`/bookings?${q.toString()}`);
    return { page: page.slice(0, PAGE), hasMore: page.length > PAGE };
  }, [status, from, to]);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    fetchPage(0)
      .then(({ page, hasMore }) => { setRows(page); setMore(hasMore); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [fetchPage]);
  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    setLoading(true);
    try {
      const { page, hasMore } = await fetchPage(rows.length);
      setRows((r) => [...r, ...page]);
      setMore(hasMore);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() { setStatus(''); setFrom(''); setTo(''); }
  const filtered = Boolean(status || from || to);

  return (
    <div className="card">
      <div className="section-head">
        <h3>{t('hist.title')}</h3>
        <span className="cal-tz">{tzLabel()}</span>
      </div>

      <div className="toolbar">
        <select className="filter-pill" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('hist.status')}>
          <option value="">{t('hist.all_status')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="hist-date">
          <span>{t('hist.from')}</span>
          <input type="date" className="filter-pill" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="hist-date">
          <span>{t('hist.to')}</span>
          <input type="date" className="filter-pill" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>{t('hist.reset')}</button>
        ) : null}
      </div>

      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="empty">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="empty">{filtered ? t('hist.empty_filtered') : t('hist.empty')}</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>{t('bookings.when')}</th>
                <th>{t('bookings.what')}</th>
                <th>{t('bookings.where')}</th>
                <th>{t('bookings.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td>{fmtDateTime(b.startTime)}<span className="hist-end"> – {fmtTime(b.endTime)}</span></td>
                  <td style={{ fontWeight: 600 }}>{b.title}</td>
                  <td>{b.resource?.name ?? (b.type === 'ONLINE' ? t('common.online') : '—')}</td>
                  <td><span className={`swatch ${SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {more ? (
            <div className="hist-more">
              <button type="button" className="btn btn-ghost btn-sm" disabled={loading} onClick={loadMore}>
                {loading ? <span className="spinner" /> : t('hist.load_more')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

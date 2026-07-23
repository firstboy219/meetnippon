'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { AdminBooking, Page } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import Pager from '@/components/Pager';

const BADGE: Record<string, string> = {
  APPROVED: 'green', COMPLETED: 'green', PENDING: 'amber', WAITLIST: 'amber', REJECTED: 'red', CANCELLED: 'grey',
};
// NO_SHOW is not a booking status — it filters on the sweep's noShowAt stamp
// (booked, ended, never checked in) per tester feedback #1.
const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'NO_SHOW'];

export default function AdminBookingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Page<AdminBooking> | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (filter === 'NO_SHOW') p.set('noShow', 'true');
    else if (filter !== 'ALL') p.set('status', filter);
    if (term) p.set('q', term);
    api.get<Page<AdminBooking>>(`/admin/bookings?${p}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [filter, term, page]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.items ?? [];

  return (
    <div>
      <div className="page-head"><h1>{t('book.title')}</h1></div>
      <div className="toolbar">
        <input className="search" placeholder={t('book.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map((f) => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setFilter(f); setPage(1); }}>
            {t(`status.${f}`)}
          </button>
        ))}
      </div>
      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : (
        <div className="card">
          {loading && !data ? <div className="empty">{t('common.loading')}</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('th.when')}</th><th>{t('th.title')}</th><th>{t('th.organiser')}</th><th>{t('th.resource')}</th><th>{t('th.usage')}</th><th>{t('th.status')}</th></tr></thead>
                <tbody>
                  {rows.map((b) => {
                    const ended = new Date(b.endTime) < new Date();
                    return (
                      <tr key={b.id}>
                        <td>{fmtDateTime(b.startTime)}</td>
                        <td style={{ fontWeight: 600 }}>{b.title}</td>
                        <td>{b.principal?.fullName ?? '—'}</td>
                        <td>{b.resource?.name ?? '—'}</td>
                        <td>
                          {b.noShowAt ? (
                            <span className="badge red">{t('book.no_show')}</span>
                          ) : b.checkedInAt ? (
                            <span className="badge green">{t('book.checked_in')}</span>
                          ) : ended && b.resource && b.status === 'APPROVED' ? (
                            // Ended, room-backed, no check-in, sweep not yet run.
                            <span className="badge grey">{t('book.no_checkin')}</span>
                          ) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                        </td>
                        <td><span className={`badge ${BADGE[b.status] ?? 'grey'}`}>{t(`status.${b.status}`)}</span></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? <tr><td colSpan={6}><div className="empty">{filter === 'NO_SHOW' ? t('book.no_show_empty') : t('book.empty')}</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
          {data ? (
            <Pager page={data.page} pages={data.pages} total={data.total}
              pageSize={data.pageSize} busy={loading} onPage={setPage} />
          ) : null}
        </div>
      )}
    </div>
  );
}

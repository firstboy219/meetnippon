'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { AuditRow, Page } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import Pager from '@/components/Pager';
import { LoadingRegion, SkeletonRows } from '@/components/Skeleton';

/** Coarse groupings so an admin can narrow down without knowing action strings. */
const ACTION_GROUPS = ['booking.', 'user.', 'mail.', 'office.', 'building.', 'floor.', 'resource.', 'tenant.'];

export default function AuditPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Page<AuditRow> | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const q = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (action) q.set('action', action);
    if (from) q.set('from', new Date(`${from}T00:00:00`).toISOString());
    // `to` reads as inclusive; the API bound is exclusive.
    if (to) {
      const d = new Date(`${to}T00:00:00`);
      d.setDate(d.getDate() + 1);
      q.set('to', d.toISOString());
    }
    api.get<Page<AuditRow>>(`/admin/audit?${q}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [page, action, from, to]);
  useEffect(() => { load(); }, [load]);

  // Any filter change invalidates the current page number.
  function filter(fn: () => void) { fn(); setPage(1); }
  const filtered = Boolean(action || from || to);

  return (
    <div>
      <div className="page-head"><h1>{t('audit.title')}</h1></div>

      <div className="toolbar">
        <select className="filter-pill" value={action}
          onChange={(e) => filter(() => setAction(e.target.value))} aria-label={t('th.action')}>
          <option value="">{t('audit.all_actions')}</option>
          {ACTION_GROUPS.map((g) => <option key={g} value={g}>{g.replace('.', '')}</option>)}
        </select>
        <label className="hist-date"><span>{t('hist.from')}</span>
          <input type="date" className="filter-pill" value={from} max={to || undefined}
            onChange={(e) => filter(() => setFrom(e.target.value))} />
        </label>
        <label className="hist-date"><span>{t('hist.to')}</span>
          <input type="date" className="filter-pill" value={to} min={from || undefined}
            onChange={(e) => filter(() => setTo(e.target.value))} />
        </label>
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => filter(() => { setAction(''); setFrom(''); setTo(''); })}>{t('hist.reset')}</button>
        ) : null}
      </div>

      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : (
        <div className="card">
          {loading && !data ? (
            <LoadingRegion label={t('common.loading')}><SkeletonRows rows={8} /></LoadingRegion>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('th.time')}</th><th>{t('th.action')}</th><th>{t('th.entity')}</th><th>{t('th.entity_id')}</th><th>{t('th.actor')}</th></tr></thead>
                  <tbody>
                    {(data?.items ?? []).map((a) => (
                      <tr key={a.id}>
                        <td>{fmtDateTime(a.createdAt)}</td>
                        <td><span className="badge grey">{a.action}</span></td>
                        <td>{a.entity ?? '—'}</td>
                        <td className="mono">{a.entityId ?? '—'}</td>
                        <td className="mono">{a.actorId ?? t('audit.system')}</td>
                      </tr>
                    ))}
                    {data && data.items.length === 0 ? (
                      <tr><td colSpan={5}><div className="empty">{filtered ? t('audit.empty_filtered') : t('audit.empty')}</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {data ? (
                <Pager page={data.page} pages={data.pages} total={data.total}
                  pageSize={data.pageSize} busy={loading} onPage={setPage} />
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

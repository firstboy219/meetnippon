'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ErrorReport, Page } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import { Modal } from '@/components/Modal';
import Pager from '@/components/Pager';
import { LoadingRegion, SkeletonRows } from '@/components/Skeleton';

export default function ErrorReportsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [data, setData] = useState<Page<ErrorReport> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [app, setApp] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [viewing, setViewing] = useState<ErrorReport | null>(null);

  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (term) p.set('q', term);
    if (app) p.set('app', app);
    api.get<Page<ErrorReport>>(`/admin/error-reports?${p}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [page, term, app]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.items ?? [];
  const filtered = Boolean(term || app);

  return (
    <div>
      <div className="page-head"><h1>{t('errs.title')}</h1></div>
      <p className="f-hint" style={{ marginTop: -8, marginBottom: 16 }}>{t('errs.hint')}</p>

      <div className="toolbar">
        <input className="search" placeholder={t('errs.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-pill" value={app} onChange={(e) => { setApp(e.target.value); setPage(1); }} aria-label={t('errs.app')}>
          <option value="">{t('errs.all_apps')}</option>
          <option value="web-user">{t('errs.app_user')}</option>
          <option value="web-admin">{t('errs.app_admin')}</option>
        </select>
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => { setQ(''); setApp(''); setPage(1); }}>{t('hist.reset')}</button>
        ) : null}
      </div>

      {loading && !data ? (
        <div className="card"><LoadingRegion label={t('common.loading')}><SkeletonRows rows={6} /></LoadingRegion></div>
      ) : err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('errs.when')}</th>
                  <th>{t('errs.app')}</th>
                  <th>{t('errs.message')}</th>
                  <th>{t('errs.route')}</th>
                  <th>{t('errs.who')}</th>
                  <th>{t('errs.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="row-clickable" onClick={() => setViewing(r)}>
                    <td>{fmtDateTime(r.createdAt)}</td>
                    <td>{r.app === 'web-user' ? t('errs.app_user') : t('errs.app_admin')}</td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.message}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.route ?? '—'}</td>
                    <td>{r.userEmail ?? '—'}</td>
                    <td>{r.status ? <span className="badge amber">{r.status}</span> : '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty">{filtered ? t('users.empty_filtered') : t('errs.empty')}</div></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {data ? (
            <Pager page={data.page} pages={data.pages} total={data.total}
              pageSize={data.pageSize} busy={loading} onPage={setPage} />
          ) : null}
        </div>
      )}

      {viewing ? (
        <ErrorDetailModal report={viewing} onClose={() => setViewing(null)}
          onCopied={() => push(t('errs.copied'), 'success')} />
      ) : null}
    </div>
  );
}

function ErrorDetailModal({ report, onClose, onCopied }: {
  report: ErrorReport; onClose: () => void; onCopied: () => void;
}) {
  const { t } = useI18n();

  function asText(): string {
    return [
      `Message: ${report.message}`,
      `App: ${report.app}`,
      `Route: ${report.route ?? '—'}`,
      `HTTP: ${report.method ?? '—'} ${report.endpoint ?? '—'} -> ${report.status ?? '—'}`,
      `User: ${report.userEmail ?? '—'} (${report.userId ?? 'unknown'})`,
      `When: ${report.createdAt}`,
      `User agent: ${report.userAgent ?? '—'}`,
      '',
      'Stack:',
      report.stack ?? '(none captured)',
    ].join('\n');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText());
      onCopied();
    } catch { /* clipboard permission denied — nothing to fall back to here */ }
  }

  return (
    <Modal title={t('errs.detail_title')} onClose={onClose} wide
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={copy}>{t('errs.copy')}</button>
        <button type="button" className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>
      </>}>
      <div className="f-group">
        <label className="f-label">{t('errs.message')}</label>
        <div className="err-box" style={{ cursor: 'default' }}>{report.message}</div>
      </div>
      <div className="f-row2">
        <div className="f-group"><label className="f-label">{t('errs.app')}</label>
          <div>{report.app === 'web-user' ? t('errs.app_user') : t('errs.app_admin')}</div></div>
        <div className="f-group"><label className="f-label">{t('errs.route')}</label>
          <div className="mono">{report.route ?? '—'}</div></div>
      </div>
      <div className="f-row2">
        <div className="f-group"><label className="f-label">HTTP</label>
          <div className="mono">{report.method ?? '—'} {report.endpoint ?? '—'} → {report.status ?? '—'}</div></div>
        <div className="f-group"><label className="f-label">{t('errs.who')}</label>
          <div>{report.userEmail ?? '—'}</div></div>
      </div>
      <div className="f-group"><label className="f-label">{t('errs.when')}</label>
        <div>{fmtDateTime(report.createdAt)}</div></div>
      <div className="f-group"><label className="f-label">User agent</label>
        <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{report.userAgent ?? '—'}</div></div>
      <div className="f-group" style={{ marginBottom: 0 }}>
        <label className="f-label">Stack</label>
        <pre className="err-stack">{report.stack ?? t('errs.no_stack')}</pre>
      </div>
    </Modal>
  );
}

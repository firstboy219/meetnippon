'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ApprovalStep, ChangeRequest } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function ApprovalsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    Promise.all([
      api.get<ApprovalStep[]>('/approvals'),
      api.get<ChangeRequest[]>('/change-requests/incoming'),
    ])
      .then(([s, c]) => { setSteps(s); setChanges(c); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.post(`/approvals/${id}/decide`, { decision });
      push(decision === 'APPROVED' ? t('common.approved') : t('common.rejected'), 'success');
      load();
    } catch (e: any) {
      push(e?.message || t('appr.toast_fail'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function decideChange(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.post(`/change-requests/${id}/decide`, { decision });
      push(decision === 'APPROVED' ? t('creq.applied') : t('common.rejected'), 'success');
      load();
    } catch (e: any) {
      // The move goes through the same policy gate as any edit — a conflict
      // that appeared since the request was made shows up here, verbatim.
      push(e?.message || t('appr.toast_fail'), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div>
      <div className="section-head"><h3>{t('appr.title')}</h3></div>
      {steps.length === 0 ? (
        <div className="empty">{t('appr.empty')}</div>
      ) : (
        <div className="grid grid-2">
          {steps.map((s) => (
            <div key={s.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="card-title">{s.booking.title}</div>
                  <div className="card-sub">{fmtDateTime(s.booking.startTime)} – {fmtDateTime(s.booking.endTime)}</div>
                </div>
                <span className="swatch pending"><span className="dot" />Level {s.level}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => decide(s.id, 'APPROVED')}>
                  {t('appr.approve')}
                </button>
                <button className="btn btn-coral" style={{ flex: 1 }} disabled={busy === s.id} onClick={() => decide(s.id, 'REJECTED')}>
                  {t('appr.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Colleagues asking to move one of MY meetings — I stay in charge. */}
      <div className="section-head" style={{ marginTop: 28 }}><h3>{t('creq.incoming_title')}</h3></div>
      {changes.length === 0 ? (
        <div className="empty">{t('creq.incoming_empty')}</div>
      ) : (
        <div className="grid grid-2">
          {changes.map((c) => (
            <div key={c.id} className="card">
              <div className="card-title">{c.booking.title}</div>
              <div className="card-sub">
                {t('creq.from')} {c.requester?.fullName ?? '—'}
                {c.booking.resource?.name ? ` · ${c.booking.resource.name}` : ''}
              </div>
              <div className="creq-times">
                <div>
                  <span className="creq-label">{t('creq.current')}</span>
                  {fmtDateTime(c.booking.startTime)} – {fmtDateTime(c.booking.endTime)}
                </div>
                {c.proposedStartTime && c.proposedEndTime ? (
                  <div>
                    <span className="creq-label">{t('creq.proposed')}</span>
                    <strong>{fmtDateTime(c.proposedStartTime)} – {fmtDateTime(c.proposedEndTime)}</strong>
                  </div>
                ) : null}
              </div>
              {c.note ? <div className="info-box" style={{ marginTop: 10 }}>&ldquo;{c.note}&rdquo;</div> : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy === c.id}
                  onClick={() => decideChange(c.id, 'APPROVED')}>
                  {c.proposedStartTime ? t('creq.approve_apply') : t('appr.approve')}
                </button>
                <button className="btn btn-coral" style={{ flex: 1 }} disabled={busy === c.id}
                  onClick={() => decideChange(c.id, 'REJECTED')}>
                  {t('appr.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

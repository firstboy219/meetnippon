'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ApprovalStep, ChangeRequest } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import ApproveRescheduleModal from '@/components/ApproveRescheduleModal';

export default function ApprovalsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [mine, setMine] = useState<ChangeRequest[]>([]);
  const [decided, setDecided] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [approving, setApproving] = useState<ChangeRequest | null>(null);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    Promise.all([
      api.get<ApprovalStep[]>('/approvals'),
      api.get<ChangeRequest[]>('/change-requests/incoming'),
      api.get<ChangeRequest[]>('/change-requests/mine'),
      api.get<ChangeRequest[]>('/change-requests/decided'),
    ])
      .then(([s, c, m, d]) => { setSteps(s); setChanges(c); setMine(m); setDecided(d); })
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

  async function rejectChange(id: string) {
    setBusy(id);
    try {
      await api.post(`/change-requests/${id}/decide`, { decision: 'REJECTED' });
      push(t('common.rejected'), 'success');
      load();
    } catch (e: any) {
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
              <div className="creq-times">
                <RoomRow name={s.booking.resource?.name} t={t} />
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
              </div>
              <div className="creq-times">
                <RoomRow name={c.booking.resource?.name} t={t} />
                <div>
                  <span className="creq-label">{t('creq.current')}</span>
                  {fmtDateTime(c.booking.startTime)} – {fmtDateTime(c.booking.endTime)}
                </div>
                <div>
                  <span className="creq-label">{t('creq.requested')}</span>
                  <strong>{fmtDateTime(c.requestedStartTime)} – {fmtDateTime(c.requestedEndTime)}</strong>
                </div>
                <div>
                  <span className="creq-label">{t('creq.for_meeting')}</span>
                  {c.draftTitle} ({fmtDateTime(c.draftStartTime)} – {fmtDateTime(c.draftEndTime)})
                </div>
              </div>
              {c.note ? <div className="info-box" style={{ marginTop: 10 }}>&ldquo;{c.note}&rdquo;</div> : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy === c.id}
                  onClick={() => setApproving(c)}>
                  {t('appr.approve')}
                </button>
                <button className="btn btn-coral" style={{ flex: 1 }} disabled={busy === c.id}
                  onClick={() => rejectChange(c.id)}>
                  {t('appr.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Requests I've made on other people's meetings, and what happened. */}
      <div className="section-head" style={{ marginTop: 28 }}><h3>{t('creq.mine_title')}</h3></div>
      {mine.length === 0 ? (
        <div className="empty">{t('creq.mine_empty')}</div>
      ) : (
        <div className="grid grid-2">
          {mine.map((c) => (
            <div key={c.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="card-title">{c.booking.title}</div>
                  <div className="card-sub">
                    {t('creq.requested')}: {fmtDateTime(c.requestedStartTime)} – {fmtDateTime(c.requestedEndTime)}
                  </div>
                </div>
                <ChangeRequestStatus status={c.status} t={t} />
              </div>
              <div className="creq-times">
                <RoomRow name={c.booking.resource?.name} t={t} />
              </div>
              {c.decisionNote ? <div className="info-box" style={{ marginTop: 10 }}>&ldquo;{c.decisionNote}&rdquo;</div> : null}
            </div>
          ))}
        </div>
      )}

      {/* Requests on my own meetings that I've already approved/rejected. */}
      <div className="section-head" style={{ marginTop: 28 }}><h3>{t('creq.decided_title')}</h3></div>
      {decided.length === 0 ? (
        <div className="empty">{t('creq.decided_empty')}</div>
      ) : (
        <div className="grid grid-2">
          {decided.map((c) => (
            <div key={c.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="card-title">{c.booking.title}</div>
                  <div className="card-sub">
                    {t('creq.from')} {c.requester?.fullName ?? '—'}
                  </div>
                </div>
                <ChangeRequestStatus status={c.status} t={t} />
              </div>
              <div className="creq-times">
                <RoomRow name={c.booking.resource?.name} t={t} />
              </div>
              {c.decisionNote ? <div className="info-box" style={{ marginTop: 10 }}>&ldquo;{c.decisionNote}&rdquo;</div> : null}
            </div>
          ))}
        </div>
      )}

      {approving ? (
        <ApproveRescheduleModal cr={approving} onClose={() => setApproving(null)}
          onDecided={() => { setApproving(null); load(); }} />
      ) : null}
    </div>
  );
}

/**
 * A labelled room line, the same on every card. Labelled rather than tacked
 * onto the subtitle because room names here are product names (Bee Brand,
 * Polyure Mightylac…) — "From Ilham · Bee Brand" does not read as a room.
 */
function RoomRow({ name, t }: { name?: string | null; t: (k: string) => string }) {
  return (
    <div>
      <span className="creq-label">{t('bd.room')}</span>
      <strong>{name ?? t('common.online')}</strong>
    </div>
  );
}

function ChangeRequestStatus({ status, t }: { status: ChangeRequest['status']; t: (k: string) => string }) {
  const swatch = status === 'APPROVED' ? 'available' : status === 'REJECTED' ? 'booked' : 'pending';
  const label = status === 'APPROVED'
    ? t('creq.status_approved')
    : status === 'REJECTED' ? t('creq.status_rejected') : t('creq.status_pending');
  return <span className={`swatch ${swatch}`}><span className="dot" />{label}</span>;
}

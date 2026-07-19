'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ApprovalStep } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function ApprovalsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<ApprovalStep[]>('/approvals').then(setSteps).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.post(`/approvals/${id}/decide`, { decision });
      push(decision === 'APPROVED' ? 'Approved.' : 'Rejected.', 'success');
      load();
    } catch (e: any) {
      push(e?.message || 'Could not submit decision.', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="empty">{t('common.loading')}</div>;

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
    </div>
  );
}

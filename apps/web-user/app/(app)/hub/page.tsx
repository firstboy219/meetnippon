'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { ExternalTask } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function HubPage() {
  const { push } = useToast();
  const [tasks, setTasks] = useState<ExternalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<ExternalTask[]>('/approval-hub/tasks').then(setTasks).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.post(`/approval-hub/tasks/${id}/decide`, { decision });
      push(decision === 'APPROVED' ? 'Approved.' : 'Rejected.', 'success');
      load();
    } catch (e: any) { push(e?.message || 'Failed.', 'error'); }
    finally { setBusy(null); }
  }

  if (loading) return <div className="empty">Loading…</div>;
  const pending = tasks.filter((t) => t.decision === 'PENDING');

  return (
    <div>
      <div className="section-head"><h3>Approval Hub</h3></div>
      <div className="info-box">Approval requests from other systems (pull requests, document sign-off, procurement) land here in one inbox.</div>
      {pending.length === 0 ? <div className="empty">Nothing awaiting your decision.</div> : (
        <div className="grid grid-2">
          {pending.map((t) => (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="swatch pending"><span className="dot" />{t.category}</span>
                {t.sourcePlatform ? <span className="facil-tag">{t.sourcePlatform}</span> : null}
              </div>
              <div className="card-title">{t.title}</div>
              {t.body ? <div className="card-sub" style={{ margin: '6px 0' }}>{t.body}</div> : null}
              <div className="card-sub">{t.requesterName ? `From ${t.requesterName} · ` : ''}{fmtDateTime(t.createdAt)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy === t.id} onClick={() => decide(t.id, 'APPROVED')}>Approve</button>
                <button className="btn btn-coral" style={{ flex: 1 }} disabled={busy === t.id} onClick={() => decide(t.id, 'REJECTED')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { ExternalTask } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function HubPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [tasks, setTasks] = useState<ExternalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    api.get<ExternalTask[]>('/approval-hub/tasks').then(setTasks).catch(() => setErr(true)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.post(`/approval-hub/tasks/${id}/decide`, { decision });
      push(decision === 'APPROVED' ? t('common.approved') : t('common.rejected'), 'success');
      load();
    } catch (e: any) { push(e?.message || t('appr.toast_fail'), 'error'); }
    finally { setBusy(null); }
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

  const pending = tasks.filter((task) => task.decision === 'PENDING');

  return (
    <div>
      <div className="section-head"><h3>{t('hub.title')}</h3></div>
      <div className="info-box">{t('hub.info')}</div>
      {pending.length === 0 ? <div className="empty">{t('appr.empty')}</div> : (
        <div className="grid grid-2">
          {pending.map((task) => (
            <div key={task.id} className="card">
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="swatch pending"><span className="dot" />{task.category}</span>
                {task.sourcePlatform ? <span className="facil-tag">{task.sourcePlatform}</span> : null}
              </div>
              <div className="card-title">{task.title}</div>
              {task.body ? <div className="card-sub" style={{ margin: '6px 0' }}>{task.body}</div> : null}
              <div className="card-sub">{task.requesterName ? `${t('hub.from')} ${task.requesterName} · ` : ''}{fmtDateTime(task.createdAt)}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy === task.id} onClick={() => decide(task.id, 'APPROVED')}>{t('appr.approve')}</button>
                <button className="btn btn-coral" style={{ flex: 1 }} disabled={busy === task.id} onClick={() => decide(task.id, 'REJECTED')}>{t('appr.reject')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

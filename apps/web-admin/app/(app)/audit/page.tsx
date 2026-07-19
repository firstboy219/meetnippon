'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AuditRow } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get<AuditRow[]>('/admin/audit').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <div className="page-head"><h1>Audit log</h1></div>
      <div className="card">
        {loading ? <div className="empty">Loading…</div> : (
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Actor</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.createdAt)}</td>
                  <td><span className="badge grey">{a.action}</span></td>
                  <td>{a.entity ?? '—'}</td>
                  <td className="mono">{a.entityId ?? '—'}</td>
                  <td className="mono">{a.actorId ?? 'system'}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5}><div className="empty">No audit entries.</div></td></tr> : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

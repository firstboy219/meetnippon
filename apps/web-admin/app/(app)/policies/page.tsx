'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { Policy } from '@/lib/types';
import { Modal } from '@/components/Modal';

export default function PoliciesPage() {
  const { push } = useToast();
  const [rows, setRows] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);

  const load = useCallback(() => {
    api.get<Policy[]>('/policies').then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    try { await api.del(`/policies/${id}`); push('Policy deleted.', 'success'); load(); }
    catch (e: any) { push(e?.message || 'Delete failed.', 'error'); }
  }

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head"><h1>Booking policies</h1><button className="btn btn-primary" onClick={() => setEditing('new')}>+ New policy</button></div>
      <div className="info-box">Policies resolve most-specific first: <b>Tenant → Category → Room</b>. A room policy overrides the category, which overrides the tenant baseline.</div>
      <div className="card">
        <table>
          <thead><tr><th>Scope</th><th>Applies to</th><th>Key rules</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><span className="badge teal">{p.scope}</span></td>
                <td>{p.scope === 'CATEGORY' ? p.category : p.scope === 'ROOM' ? p.resourceId : 'All resources'}</td>
                <td className="card-sub">{summarize(p.rules)}</td>
                <td><div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4}><div className="empty">No policies yet — the tenant defaults apply.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      {editing ? <PolicyModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { push('Saved.', 'success'); setEditing(null); load(); }} /> : null}
    </div>
  );
}

function summarize(rules: Record<string, any>): string {
  const bits: string[] = [];
  if (rules.requiresApproval) bits.push('requires approval');
  if (rules.maxDurationMinutes) bits.push(`≤ ${rules.maxDurationMinutes}m`);
  if (rules.bufferMinutes) bits.push(`${rules.bufferMinutes}m buffer`);
  if (rules.maxBookingsPerUserPerDay) bits.push(`≤ ${rules.maxBookingsPerUserPerDay}/day`);
  if (rules.checkInRequired) bits.push('check-in');
  return bits.length ? bits.join(' · ') : '—';
}

function PolicyModal({ row, onClose, onSaved }: { row: Policy | null; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const r = row?.rules ?? {};
  const [scope, setScope] = useState<Policy['scope']>(row?.scope ?? 'TENANT');
  const [category, setCategory] = useState(row?.category ?? '');
  const [resourceId, setResourceId] = useState(row?.resourceId ?? '');
  const [requiresApproval, setRequiresApproval] = useState(!!r.requiresApproval);
  const [checkInRequired, setCheckInRequired] = useState(!!r.checkInRequired);
  const [maxDuration, setMaxDuration] = useState(r.maxDurationMinutes ? String(r.maxDurationMinutes) : '');
  const [buffer, setBuffer] = useState(r.bufferMinutes ? String(r.bufferMinutes) : '');
  const [maxAdvance, setMaxAdvance] = useState(r.maxAdvanceDays ? String(r.maxAdvanceDays) : '');
  const [perDay, setPerDay] = useState(r.maxBookingsPerUserPerDay ? String(r.maxBookingsPerUserPerDay) : '');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const rules: Record<string, any> = { requiresApproval, checkInRequired };
    if (maxDuration) rules.maxDurationMinutes = Number(maxDuration);
    if (buffer) rules.bufferMinutes = Number(buffer);
    if (maxAdvance) rules.maxAdvanceDays = Number(maxAdvance);
    if (perDay) rules.maxBookingsPerUserPerDay = Number(perDay);
    const payload: any = { scope, rules };
    if (scope === 'CATEGORY') payload.category = category;
    if (scope === 'ROOM') payload.resourceId = resourceId;
    try { await api.put('/policies', payload); onSaved(); }
    catch (e: any) { push(e?.message || 'Save failed.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? 'Edit policy' : 'New policy'} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save as any}>{busy ? <span className="spinner" /> : 'Save'}</button>
      </>}>
      <form onSubmit={save}>
        <div className="f-group"><label className="f-label">Scope</label>
          <select className="f-select" value={scope} onChange={(e) => setScope(e.target.value as any)} disabled={!!row}>
            <option value="TENANT">Tenant (baseline)</option><option value="CATEGORY">Category</option><option value="ROOM">Room</option>
          </select>
        </div>
        {scope === 'CATEGORY' ? <div className="f-group"><label className="f-label">Category</label><input className="f-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="VIP Room" required /></div> : null}
        {scope === 'ROOM' ? <div className="f-group"><label className="f-label">Resource ID</label><input className="f-input" value={resourceId} onChange={(e) => setResourceId(e.target.value)} required /></div> : null}
        <label className="f-check"><input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} /> Requires approval</label>
        <label className="f-check"><input type="checkbox" checked={checkInRequired} onChange={(e) => setCheckInRequired(e.target.checked)} /> Requires check-in</label>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">Max duration (min)</label><input className="f-input" type="number" value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} /></div>
          <div className="f-group"><label className="f-label">Buffer (min)</label><input className="f-input" type="number" value={buffer} onChange={(e) => setBuffer(e.target.value)} /></div>
        </div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">Max advance (days)</label><input className="f-input" type="number" value={maxAdvance} onChange={(e) => setMaxAdvance(e.target.value)} /></div>
          <div className="f-group"><label className="f-label">Max bookings/user/day</label><input className="f-input" type="number" value={perDay} onChange={(e) => setPerDay(e.target.value)} /></div>
        </div>
      </form>
    </Modal>
  );
}

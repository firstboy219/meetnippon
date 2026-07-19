'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { AdminResource } from '@/lib/types';
import { Modal } from '@/components/Modal';

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'green', MAINTENANCE: 'amber', INACTIVE: 'grey' };

export default function ResourcesPage() {
  const { push } = useToast();
  const [rows, setRows] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);

  const load = useCallback(() => {
    api.get<AdminResource[]>('/admin/resources').then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    try { await api.del(`/admin/resources/${id}`); push('Resource deleted.', 'success'); load(); }
    catch (e: any) { push(e?.message || 'Delete failed.', 'error'); }
  }

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head"><h1>Resources</h1><button className="btn btn-primary" onClick={() => setEditing('new')}>+ New resource</button></div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Floor</th><th>Cap.</th><th>Category</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td><span className="badge teal">{r.type}</span></td>
                <td>{r.floor?.name ?? '—'}</td>
                <td>{r.capacity}</td>
                <td>{r.category ?? '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                <td><div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}>Delete</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7}><div className="empty">No resources.</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      {editing ? <ResourceModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { push('Saved.', 'success'); setEditing(null); load(); }} /> : null}
    </div>
  );
}

function ResourceModal({ row, onClose, onSaved }: { row: AdminResource | null; onClose: () => void; onSaved: () => void }) {
  const { push } = useToast();
  const [type, setType] = useState<'ROOM' | 'DESK'>(row?.type ?? 'ROOM');
  const [name, setName] = useState(row?.name ?? '');
  const [category, setCategory] = useState(row?.category ?? '');
  const [capacity, setCapacity] = useState(String(row?.capacity ?? 1));
  const [facilities, setFacilities] = useState((row?.facilities ?? []).join(', '));
  const [status, setStatus] = useState(row?.status ?? 'ACTIVE');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const payload = {
      type, name, category: category || undefined, capacity: Number(capacity),
      facilities: facilities.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (row) await api.put(`/admin/resources/${row.id}`, { ...payload, status });
      else await api.post('/admin/resources', payload);
      onSaved();
    } catch (e: any) { push(e?.message || 'Save failed.', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? 'Edit resource' : 'New resource'} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save as any}>{busy ? <span className="spinner" /> : 'Save'}</button>
      </>}>
      <form onSubmit={save}>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">Type</label>
            <select className="f-select" value={type} onChange={(e) => setType(e.target.value as any)} disabled={!!row}>
              <option value="ROOM">Room</option><option value="DESK">Desk</option>
            </select>
          </div>
          <div className="f-group"><label className="f-label">Capacity</label>
            <input className="f-input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </div>
        </div>
        <div className="f-group"><label className="f-label">Name</label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="f-group"><label className="f-label">Category</label>
          <input className="f-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. VIP Room" />
        </div>
        <div className="f-group"><label className="f-label">Facilities (comma-separated)</label>
          <input className="f-input" value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder="Projector, VC" />
        </div>
        {row ? (
          <div className="f-group"><label className="f-label">Status</label>
            <select className="f-select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="ACTIVE">Active</option><option value="MAINTENANCE">Maintenance</option><option value="INACTIVE">Inactive</option>
            </select>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

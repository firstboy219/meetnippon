'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { AdminUser, UserRole } from '@/lib/types';
import { Modal } from '@/components/Modal';

export default function UsersPage() {
  const { push } = useToast();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get<AdminUser[]>('/admin/users').then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function changeRole(id: string, role: UserRole) {
    try { await api.put(`/admin/users/${id}`, { role }); push('Role updated.', 'success'); load(); }
    catch (e: any) { push(e?.message || 'Update failed.', 'error'); }
  }
  async function toggleActive(u: AdminUser) {
    try { await api.put(`/admin/users/${u.id}/active`, { isActive: !u.isActive }); push('Updated.', 'success'); load(); }
    catch (e: any) { push(e?.message || 'Update failed.', 'error'); }
  }

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <div>
      <div className="page-head"><h1>Users</h1><button className="btn btn-primary" onClick={() => setCreating(true)}>+ New user</button></div>
      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Dept.</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                <td>{u.email}</td>
                <td>
                  <select className="f-select" style={{ width: 130, padding: '6px 8px' }} value={u.role} onChange={(e) => changeRole(u.id, e.target.value as UserRole)}>
                    <option value="EMPLOYEE">Employee</option><option value="APPROVER">Approver</option><option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>{u.department ?? '—'}</td>
                <td><span className={`badge ${u.isActive ? 'green' : 'grey'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                <td><button className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-ghost'}`} onClick={() => toggleActive(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating ? <CreateUserModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} /> : null}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');
  const [department, setDepartment] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const res = await api.post<AdminUser>('/admin/users', {
        email, fullName, role, department: department || undefined, password: password || undefined,
      });
      if (res.tempPassword) { setTemp(res.tempPassword); push('User created.', 'success'); }
      else { push('User created.', 'success'); onCreated(); }
    } catch (e: any) { push(e?.message || 'Create failed.', 'error'); }
    finally { setBusy(false); }
  }

  if (temp) {
    return (
      <Modal title="User created" onClose={onCreated}
        footer={<button className="btn btn-primary" onClick={onCreated}>Done</button>}>
        <div className="info-box">Share this temporary password securely. It won&apos;t be shown again.</div>
        <div className="f-label">Temporary password</div>
        <div className="mono" style={{ padding: '10px 12px', background: '#F5F4EF', borderRadius: 9 }}>{temp}</div>
      </Modal>
    );
  }

  return (
    <Modal title="New user" onClose={onClose}
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save as any}>{busy ? <span className="spinner" /> : 'Create'}</button>
      </>}>
      <form onSubmit={save}>
        <div className="f-group"><label className="f-label">Full name</label><input className="f-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
        <div className="f-group"><label className="f-label">Email</label><input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">Role</label>
            <select className="f-select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="EMPLOYEE">Employee</option><option value="APPROVER">Approver</option><option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="f-group"><label className="f-label">Department</label><input className="f-input" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <div className="f-group"><label className="f-label">Password (optional)</label>
          <input className="f-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate" />
          <div className="f-hint">If blank, a temporary password is generated for handoff.</div>
        </div>
      </form>
    </Modal>
  );
}

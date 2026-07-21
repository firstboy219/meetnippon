'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminUser, Page, UserRole } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';
import Pager from '@/components/Pager';
import { LoadingRegion, SkeletonRows } from '@/components/Skeleton';

const FORM_ID = 'user-form';
const ROLES: UserRole[] = ['EMPLOYEE', 'APPROVER', 'ADMIN'];

export default function UsersPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const { user: me } = useAuth();
  const [data, setData] = useState<Page<AdminUser> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [active, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roleReq, setRoleReq] = useState<{ id: string; role: UserRole } | null>(null);
  const [deactivate, setDeactivate] = useState<AdminUser | null>(null);

  // Debounced so typing in the search box does not fire a request per keystroke.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => { setTerm(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (term) p.set('q', term);
    if (role) p.set('role', role);
    if (active) p.set('isActive', active);
    api.get<Page<AdminUser>>(`/admin/users?${p}`)
      .then(setData).catch(() => setErr(true)).finally(() => setLoading(false));
  }, [page, term, role, active]);
  useEffect(() => { load(); }, [load]);

  const rows = data?.items ?? [];
  const filtered = Boolean(term || role || active);

  function requestRole(u: AdminUser, role: UserRole) {
    if (role === u.role) return;
    // Guard: an admin must not be able to demote (or otherwise change) their own role.
    if (me && u.id === me.id) { push(t('users.self_role'), 'error'); return; }
    setRoleReq({ id: u.id, role });
  }

  async function changeRole(id: string, role: UserRole) {
    setBusy(true);
    try { await api.put(`/admin/users/${id}`, { role }); push(t('users.role_updated'), 'success'); setRoleReq(null); load(); }
    catch (e: any) { push(e?.message || t('common.update_failed'), 'error'); }
    finally { setBusy(false); }
  }

  async function setActive(u: AdminUser, isActive: boolean) {
    setBusy(true);
    try { await api.put(`/admin/users/${u.id}/active`, { isActive }); push(t('users.updated'), 'success'); setDeactivate(null); load(); }
    catch (e: any) { push(e?.message || t('common.update_failed'), 'error'); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return (
      <div className="card">
        <LoadingRegion label={t('common.loading')}><SkeletonRows rows={6} /></LoadingRegion>
      </div>
    );
  }
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
      <div className="page-head"><h1>{t('users.title')}</h1><button className="btn btn-primary" onClick={() => setCreating(true)}>{t('users.new')}</button></div>

      <div className="toolbar">
        <input className="search" placeholder={t('users.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="filter-pill" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label={t('th.role')}>
          <option value="">{t('users.all_roles')}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
        </select>
        <select className="filter-pill" value={active} onChange={(e) => { setActiveFilter(e.target.value); setPage(1); }} aria-label={t('th.status')}>
          <option value="">{t('users.all_status')}</option>
          <option value="true">{t('status.ACTIVE')}</option>
          <option value="false">{t('status.INACTIVE')}</option>
        </select>
        {filtered ? (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => { setQ(''); setRole(''); setActiveFilter(''); setPage(1); }}>{t('hist.reset')}</button>
        ) : null}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('th.name')}</th><th>{t('th.email')}</th><th>{t('th.role')}</th><th>{t('th.department')}</th><th>{t('th.status')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select className="f-select" style={{ width: 130, padding: '6px 8px' }} value={u.role}
                      onChange={(e) => requestRole(u, e.target.value as UserRole)}>
                      {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                    </select>
                  </td>
                  <td>{u.department ?? '—'}</td>
                  <td><span className={`badge ${u.isActive ? 'green' : 'grey'}`}>{u.isActive ? t('status.ACTIVE') : t('status.INACTIVE')}</span></td>
                  <td>
                    <button className={`btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => (u.isActive ? setDeactivate(u) : setActive(u, true))}>
                      {u.isActive ? t('users.deactivate') : t('users.activate')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={6}><div className="empty">{filtered ? t('users.empty_filtered') : t('users.empty')}</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {data ? (
          <Pager page={data.page} pages={data.pages} total={data.total}
            pageSize={data.pageSize} busy={loading} onPage={setPage} />
        ) : null}
      </div>
      {creating ? <CreateUserModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} /> : null}
      {roleReq ? (
        <ConfirmModal title={t('users.confirm_role_title')} body={t('users.confirm_role_body')} busy={busy}
          onClose={() => setRoleReq(null)} onConfirm={() => changeRole(roleReq.id, roleReq.role)} />
      ) : null}
      {deactivate ? (
        <ConfirmModal title={t('users.confirm_deactivate_title')} body={t('users.confirm_deactivate_body')}
          confirmLabel={t('users.deactivate')} busy={busy}
          onClose={() => setDeactivate(null)} onConfirm={() => setActive(deactivate, false)} />
      ) : null}
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useI18n();
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
      if (res.tempPassword) { setTemp(res.tempPassword); push(t('users.created'), 'success'); }
      else { push(t('users.created'), 'success'); onCreated(); }
    } catch (e: any) { push(e?.message || t('common.create_failed'), 'error'); }
    finally { setBusy(false); }
  }

  if (temp) {
    return (
      <Modal title={t('users.created_title')} onClose={onCreated}
        footer={<button type="button" className="btn btn-primary" onClick={onCreated}>{t('common.done')}</button>}>
        <div className="info-box">{t('users.temp_info')}</div>
        <div className="f-label">{t('users.temp_label')}</div>
        <div className="mono" style={{ padding: '10px 12px', background: '#F5F4EF', borderRadius: 9 }}>{temp}</div>
      </Modal>
    );
  }

  return (
    <Modal title={t('users.new_title')} onClose={onClose}
      formId={FORM_ID} submitLabel={t('common.create')} busy={busy}>
      <form id={FORM_ID} onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('users.full_name')}</label><input className="f-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
        <div className="f-group"><label className="f-label">{t('th.email')}</label><input className="f-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('th.role')}</label>
            <select className="f-select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
          </div>
          <div className="f-group"><label className="f-label">{t('users.department')}</label><input className="f-input" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
        </div>
        <div className="f-group"><label className="f-label">{t('users.password')}</label>
          <input className="f-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('users.password_ph')} />
          <div className="f-hint">{t('users.password_hint')}</div>
        </div>
      </form>
    </Modal>
  );
}

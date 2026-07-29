'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminUser, Page, RegistrationRequest, UserRole } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
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
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState<AdminUser | null>(null);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [approving, setApproving] = useState<RegistrationRequest | null>(null);
  const [rejecting, setRejecting] = useState<RegistrationRequest | null>(null);
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

  // People from a verified company domain who tried to activate an account
  // nobody created for them — they wait here for a decision.
  const loadRequests = useCallback(() => {
    api.get<RegistrationRequest[]>('/admin/users/requests')
      .then(setRequests).catch(() => setRequests([]));
  }, []);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function removeUser(u: AdminUser) {
    setBusy(true);
    try {
      await api.del(`/admin/users/${u.id}`);
      push(t('users.deleted'), 'success');
      setRemoving(null);
      load();
    } catch (e: any) { push(e?.message || t('common.delete_failed'), 'error'); }
    finally { setBusy(false); }
  }

  async function rejectRequest(r: RegistrationRequest) {
    setBusy(true);
    try {
      await api.post(`/admin/users/requests/${r.id}/reject`, {});
      push(t('req.rejected'), 'success');
      setRejecting(null);
      loadRequests();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

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
      <div className="page-head"><h1>{t('users.title')}</h1>
        <div className="row-actions">
          <button className="btn btn-ghost" onClick={() => setImporting(true)}>{t('imp.button')}</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>{t('users.new')}</button>
        </div>
      </div>

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

      {/* Sign-up attempts from company domains, waiting on a decision. Shown
          above the roster because it is the only thing here that is blocking
          somebody from working. */}
      {requests.length > 0 ? (
        <div className="card req-card">
          <div className="section-head">
            <div>
              <div className="card-title">{t('req.title')}</div>
              <div className="card-sub">{t('req.sub')}</div>
            </div>
            <span className="badge amber">{requests.length}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('th.email')}</th><th>{t('req.asked')}</th><th></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.email}</td>
                    <td>{fmtDateTime(r.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => setApproving(r)}>{t('req.approve')}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(r)}>{t('req.reject')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>{t('common.edit')}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setResetting(u)}>{t('users.reset_password')}</button>
                      <button className={`btn btn-sm ${u.isActive ? 'btn-ghost' : 'btn-ghost'}`}
                        onClick={() => (u.isActive ? setDeactivate(u) : setActive(u, true))}>
                        {u.isActive ? t('users.deactivate') : t('users.activate')}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => setRemoving(u)}>{t('common.delete')}</button>
                    </div>
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
      {importing ? <ImportUsersModal onClose={() => setImporting(false)} onDone={() => load()} /> : null}
      {roleReq ? (
        <ConfirmModal title={t('users.confirm_role_title')} body={t('users.confirm_role_body')} busy={busy}
          onClose={() => setRoleReq(null)} onConfirm={() => changeRole(roleReq.id, roleReq.role)} />
      ) : null}
      {deactivate ? (
        <ConfirmModal title={t('users.confirm_deactivate_title')} body={t('users.confirm_deactivate_body')}
          confirmLabel={t('users.deactivate')} busy={busy}
          onClose={() => setDeactivate(null)} onConfirm={() => setActive(deactivate, false)} />
      ) : null}
      {editing ? (
        <EditUserModal user={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      ) : null}
      {resetting ? (
        <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      ) : null}
      {removing ? (
        <ConfirmModal title={t('users.confirm_delete_title')}
          body={t('users.confirm_delete_body').replace('{name}', removing.fullName)}
          confirmLabel={t('common.delete')} busy={busy}
          onClose={() => setRemoving(null)} onConfirm={() => removeUser(removing)} />
      ) : null}
      {approving ? (
        <ApproveRequestModal req={approving} onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); loadRequests(); load(); }} />
      ) : null}
      {rejecting ? (
        <ConfirmModal title={t('req.confirm_reject_title')}
          body={t('req.confirm_reject_body').replace('{email}', rejecting.email)}
          confirmLabel={t('req.reject')} busy={busy}
          onClose={() => setRejecting(null)} onConfirm={() => rejectRequest(rejecting)} />
      ) : null}
    </div>
  );
}

/** Full edit of an existing account — name, role, position, language. */
function EditUserModal({ user, onClose, onSaved }: {
  user: AdminUser; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user: me } = useAuth();
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [department, setDepartment] = useState(user.department ?? '');
  const [languagePref, setLanguagePref] = useState(user.languagePref ?? 'EN');
  const [busy, setBusy] = useState(false);
  const isSelf = me?.id === user.id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/admin/users/${user.id}`, {
        fullName: fullName.trim(),
        // Changing your own role would let an admin lock themselves out.
        ...(isSelf ? {} : { role }),
        department: department.trim() || undefined,
        languagePref,
      });
      push(t('users.updated'), 'success');
      onSaved();
    } catch (e: any) { push(e?.message || t('common.update_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={t('users.edit_title')} onClose={onClose}
      formId="user-edit-form" submitLabel={t('common.save')} busy={busy}>
      <form id="user-edit-form" onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('th.email')}</label>
          <input className="f-input" value={user.email} readOnly disabled />
          <div className="f-hint">{t('users.email_locked')}</div>
        </div>
        <div className="f-group"><label className="f-label">{t('users.full_name')}</label>
          <input className="f-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('th.role')}</label>
            <select className="f-select" value={role} disabled={isSelf}
              onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
            {isSelf ? <div className="f-hint">{t('users.self_role')}</div> : null}
          </div>
          <div className="f-group"><label className="f-label">{t('users.department')}</label>
            <input className="f-input" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </div>
        <div className="f-group"><label className="f-label">{t('users.language')}</label>
          <select className="f-select" value={languagePref} onChange={(e) => setLanguagePref(e.target.value as 'EN' | 'ID')}>
            <option value="EN">English</option>
            <option value="ID">Bahasa Indonesia</option>
          </select>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Sets a new password directly — no email involved, unlike self-service
 * activation. The admin has to hand the value to the person themselves, so it
 * stays on screen (once) after a successful reset, same pattern as the
 * temporary password shown right after creating a user.
 */
function genPassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  return `${body}A1!`;
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/admin/users/${user.id}/password`, { password });
      push(t('users.reset_done'), 'success');
      setDone(true);
    } catch (e: any) { push(e?.message || t('common.update_failed'), 'error'); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <Modal title={t('users.reset_done_title')} onClose={onClose}
        footer={<button type="button" className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>}>
        <div className="info-box">{t('users.reset_done_info').replace('{name}', user.fullName)}</div>
        <div className="f-label">{t('users.reset_password_label')}</div>
        <div className="mono" style={{ padding: '10px 12px', background: '#F5F4EF', borderRadius: 9 }}>{password}</div>
      </Modal>
    );
  }

  return (
    <Modal title={t('users.reset_title')} onClose={onClose}
      formId="reset-password-form" submitLabel={t('users.reset_submit')} busy={busy}>
      <form id="reset-password-form" onSubmit={submit}>
        <div className="info-box">{t('users.reset_info').replace('{name}', user.fullName)}</div>
        <div className="f-group">
          <label className="f-label">{t('users.reset_password_label')}</label>
          <div className="row-actions">
            <input className="f-input" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users.reset_password_ph')} minLength={8} required autoFocus />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPassword(genPassword())}>
              {t('users.reset_generate')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Approve a self-service sign-up. The request only carried an email address,
 * so the admin supplies the details a roster entry needs before the account
 * exists at all.
 */
function ApproveRequestModal({ req, onClose, onDone }: {
  req: RegistrationRequest; onClose: () => void; onDone: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  // A sensible starting point from the address; the admin corrects it.
  const guess = req.email.split('@')[0].replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const [fullName, setFullName] = useState(req.fullName ?? guess);
  const [department, setDepartment] = useState(req.department ?? '');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/users/requests/${req.id}/approve`, {
        fullName: fullName.trim(), department: department.trim() || undefined, role,
      });
      push(t('req.approved'), 'success');
      onDone();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={t('req.approve_title')} onClose={onClose}
      formId="req-approve-form" submitLabel={t('req.approve_submit')} busy={busy}>
      <form id="req-approve-form" onSubmit={save}>
        <div className="info-box">{t('req.approve_info')}</div>
        <div className="f-group"><label className="f-label">{t('th.email')}</label>
          <input className="f-input" value={req.email} readOnly disabled />
        </div>
        <div className="f-group"><label className="f-label">{t('users.full_name')}</label>
          <input className="f-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        </div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('th.role')}</label>
            <select className="f-select" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
          </div>
          <div className="f-group"><label className="f-label">{t('users.department')}</label>
            <input className="f-input" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

interface ParsedRow { fullName: string; email: string; department?: string }
interface ImportResult {
  created: number; failed: number;
  users: { email: string; fullName: string }[];
  errors: { row: number; email: string; reason: string }[];
}

/**
 * Minimal CSV reader for the 3-column roster template.
 *
 * Handles quoted fields and both line endings; anything more exotic belongs in
 * a spreadsheet, not here. The header row is optional — matched by name when
 * present so column order does not have to be memorised.
 */
function parseCsv(text: string): { rows: ParsedRow[]; problems: string[] } {
  const problems: string[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], problems: ['The file is empty.'] };

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  let idx = { name: 0, email: 1, dept: 2 };
  let start = 0;
  const first = splitLine(lines[0]).map((c) => c.toLowerCase());
  const looksLikeHeader = first.some((c) => ['nama', 'name', 'email', 'jabatan', 'position', 'department'].includes(c));
  if (looksLikeHeader) {
    const find = (...names: string[]) => first.findIndex((c) => names.includes(c));
    idx = {
      name: find('nama', 'name', 'fullname', 'nama lengkap'),
      email: find('email', 'e-mail', 'alamat email'),
      dept: find('jabatan', 'position', 'department', 'departemen', 'divisi'),
    };
    if (idx.name < 0 || idx.email < 0) {
      return { rows: [], problems: ['Header must include a name column and an email column.'] };
    }
    start = 1;
  }

  const rows: ParsedRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const c = splitLine(lines[i]);
    const fullName = c[idx.name] ?? '';
    const email = c[idx.email] ?? '';
    const department = idx.dept >= 0 ? (c[idx.dept] ?? '') : '';
    if (!fullName && !email) continue;
    rows.push({ fullName, email, ...(department ? { department } : {}) });
  }
  if (!rows.length) problems.push('No data rows found.');
  return { rows, problems };
}

const TEMPLATE_CSV = 'nama,email,jabatan\nBudi Santoso,budi@nipseapaint.com,Staff Marketing\nSiti Rahayu,siti@nipponpaint-indonesia.com,Manager Produksi\n';

function ImportUsersModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [sendInvites, setSendInvites] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows: r, problems: p } = parseCsv(String(reader.result ?? ''));
      setRows(r); setProblems(p); setResult(null);
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'template-user-meetnippon.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post<ImportResult>('/admin/users/import', { rows, sendInvites });
      setResult(res);
      push(t('imp.done').replace('{n}', String(res.created)), res.failed ? 'error' : 'success');
      onDone();
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally { setBusy(false); }
  }

  // After importing, the modal turns into a report rather than closing — a
  // partial failure is exactly what the admin needs to read.
  if (result) {
    return (
      <Modal title={t('imp.result_title')} onClose={onClose}
        footer={<button type="button" className="btn btn-primary" onClick={onClose}>{t('common.done')}</button>}>
        <div className="info-box">
          {t('imp.result_summary').replace('{ok}', String(result.created)).replace('{bad}', String(result.failed))}
          {sendInvites && result.created > 0 ? ` ${t('imp.result_invited')}` : ''}
        </div>
        {result.errors.length ? (
          <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>{t('imp.row')}</th><th>{t('th.email')}</th><th>{t('imp.reason')}</th></tr></thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={`${e.row}-${e.email}`}>
                    <td>{e.row}</td><td>{e.email}</td><td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    );
  }

  const valid = rows.length > 0 && problems.length === 0;
  return (
    <Modal title={t('imp.title')} onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? <span className="spinner" /> : t('imp.submit').replace('{n}', String(rows.length))}
          </button>
        </>
      }>
      <div className="info-box">{t('imp.info')}</div>

      <div className="f-group">
        <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}>{t('imp.template')}</button>
      </div>

      <div className="f-group">
        <label className="f-label">{t('imp.file')}</label>
        <input className="f-input" type="file" accept=".csv,text/csv" onChange={onFile} />
        {fileName ? <div className="f-hint">{fileName} — {t('imp.rows_found').replace('{n}', String(rows.length))}</div> : null}
      </div>

      {problems.length ? <div className="err-box">{problems.join(' ')}</div> : null}

      {rows.length ? (
        <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>{t('th.name')}</th><th>{t('th.email')}</th><th>{t('imp.position')}</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td>{r.fullName || <span style={{ color: 'var(--red)' }}>—</span>}</td>
                  <td>{r.email}</td>
                  <td>{r.department ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 ? <div className="f-hint" style={{ padding: '6px 2px' }}>{t('imp.more').replace('{n}', String(rows.length - 50))}</div> : null}
        </div>
      ) : null}

      <label className="f-check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={sendInvites} onChange={(e) => setSendInvites(e.target.checked)} />
        {t('imp.send_invites')}
      </label>
      <div className="f-hint">{t('imp.send_invites_hint')}</div>
    </Modal>
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

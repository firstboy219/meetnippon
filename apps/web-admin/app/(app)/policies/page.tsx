'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminResource, AdminUser, Page, Policy } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';

const FORM_ID = 'policy-form';

export default function PoliciesPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [rows, setRows] = useState<Policy[]>([]);
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<Policy[]>('/policies').then(setRows).catch(() => setErr(true)).finally(() => setLoading(false));
    // Names for ROOM-scope rows — an id in the table tells the admin nothing.
    api.get<AdminResource[]>('/admin/resources')
      .then((rs) => setRoomNames(Object.fromEntries(rs.map((r) => [r.id, r.name]))))
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    setBusy(true);
    try { await api.del(`/policies/${id}`); push(t('pol.deleted'), 'success'); setConfirmId(null); load(); }
    catch (e: any) { push(e?.message || t('common.delete_failed'), 'error'); }
    finally { setBusy(false); }
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
      <div className="page-head"><h1>{t('pol.title')}</h1><button className="btn btn-primary" onClick={() => setEditing('new')}>{t('pol.new')}</button></div>
      <div className="info-box">{t('pol.info')}</div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('th.scope')}</th><th>{t('th.applies_to')}</th><th>{t('th.key_rules')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><span className="badge teal">{t(`scope.${p.scope}`)}</span></td>
                  <td>{p.scope === 'CATEGORY' ? p.category : p.scope === 'ROOM' ? (roomNames[p.resourceId ?? ''] ?? p.resourceId) : t('pol.all_resources')}</td>
                  <td className="card-sub">{summarize(p.rules, t)}</td>
                  <td><div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(p.id)}>{t('common.delete')}</button>
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={4}><div className="empty">{t('pol.empty')}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      {editing ? <PolicyModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); load(); }} /> : null}
      {confirmId ? (
        <ConfirmModal title={t('pol.confirm_title')} body={t('pol.confirm_body')} confirmLabel={t('common.delete')}
          busy={busy} onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
    </div>
  );
}

function summarize(rules: Record<string, any>, t: (k: string) => string): string {
  const bits: string[] = [];
  if (rules.requiresApproval) bits.push(t('pol.sum_approval'));
  if (rules.maxDurationMinutes) bits.push(`≤ ${rules.maxDurationMinutes}m`);
  if (rules.maxAdvanceDays) bits.push(`≤ ${rules.maxAdvanceDays}${t('pol.sum_days')}`);
  if (rules.overAdvanceRequiresApproval) bits.push(t('pol.sum_over_advance'));
  if (rules.bufferMinutes) bits.push(`${rules.bufferMinutes}m ${t('pol.sum_buffer')}`);
  if (rules.maxBookingsPerUserPerDay) bits.push(`≤ ${rules.maxBookingsPerUserPerDay}${t('pol.sum_per_day')}`);
  if (rules.checkInRequired) bits.push(t('pol.sum_check_in'));
  if (rules.allowedUserIds?.length) bits.push(`${rules.allowedUserIds.length} ${t('pol.sum_allowed')}`);
  return bits.length ? bits.join(' · ') : '—';
}

function PolicyModal({ row, onClose, onSaved }: { row: Policy | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const r = row?.rules ?? {};
  const [scope, setScope] = useState<Policy['scope']>(row?.scope ?? 'TENANT');
  const [category, setCategory] = useState(row?.category ?? '');
  const [resourceId, setResourceId] = useState(row?.resourceId ?? '');
  const [requiresApproval, setRequiresApproval] = useState(!!r.requiresApproval);
  const [overAdvanceApproval, setOverAdvanceApproval] = useState(!!r.overAdvanceRequiresApproval);
  const [checkInRequired, setCheckInRequired] = useState(!!r.checkInRequired);
  const [maxDuration, setMaxDuration] = useState(r.maxDurationMinutes ? String(r.maxDurationMinutes) : '');
  const [buffer, setBuffer] = useState(r.bufferMinutes ? String(r.bufferMinutes) : '');
  const [maxAdvance, setMaxAdvance] = useState(r.maxAdvanceDays ? String(r.maxAdvanceDays) : '');
  const [perDay, setPerDay] = useState(r.maxBookingsPerUserPerDay ? String(r.maxBookingsPerUserPerDay) : '');
  const [allowed, setAllowed] = useState<string[]>(Array.isArray(r.allowedUserIds) ? r.allowedUserIds : []);
  const [userQ, setUserQ] = useState('');
  const [busy, setBusy] = useState(false);

  // Pickers instead of raw ids: the admin should choose a room by name and
  // allowed users by name, not paste database ids into a text box.
  const [rooms, setRooms] = useState<AdminResource[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => {
    api.get<AdminResource[]>('/admin/resources').then(setRooms).catch(() => {});
    api.get<Page<AdminUser>>('/admin/users?page=1&pageSize=200')
      .then((p) => setUsers(p.items)).catch(() => {});
  }, []);

  const shownUsers = useMemo(() => {
    const term = userQ.trim().toLowerCase();
    const list = term
      ? users.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(term))
      : users;
    // Already-allowed users float to the top so the current list is visible.
    return [...list].sort((a, b) =>
      Number(allowed.includes(b.id)) - Number(allowed.includes(a.id)));
  }, [users, userQ, allowed]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const rules: Record<string, any> = {
      requiresApproval,
      checkInRequired,
      overAdvanceRequiresApproval: overAdvanceApproval,
    };
    if (maxDuration) rules.maxDurationMinutes = Number(maxDuration);
    if (buffer) rules.bufferMinutes = Number(buffer);
    if (maxAdvance) rules.maxAdvanceDays = Number(maxAdvance);
    if (perDay) rules.maxBookingsPerUserPerDay = Number(perDay);
    // Sent even when empty: clearing the list must clear the restriction.
    if (scope === 'ROOM') rules.allowedUserIds = allowed;
    const payload: any = { scope, rules };
    if (scope === 'CATEGORY') payload.category = category;
    if (scope === 'ROOM') payload.resourceId = resourceId;
    try { await api.put('/policies', payload); onSaved(); }
    catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? t('pol.edit_title') : t('pol.new_title')} onClose={onClose}
      formId={FORM_ID} submitLabel={t('common.save')} busy={busy}>
      <form id={FORM_ID} onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('th.scope')}</label>
          <select className="f-select" value={scope} onChange={(e) => setScope(e.target.value as any)} disabled={!!row}>
            <option value="TENANT">{t('pol.scope_tenant')}</option>
            <option value="CATEGORY">{t('pol.scope_category')}</option>
            <option value="ROOM">{t('pol.scope_room')}</option>
          </select>
        </div>
        {scope === 'CATEGORY' ? <div className="f-group"><label className="f-label">{t('th.category')}</label><input className="f-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('res.category_ph')} required /></div> : null}
        {scope === 'ROOM' ? (
          <div className="f-group"><label className="f-label">{t('pol.room')}</label>
            <select className="f-select" value={resourceId} onChange={(e) => setResourceId(e.target.value)} required>
              <option value="">{t('pol.room_pick')}</option>
              {rooms.map((rm) => (
                <option key={rm.id} value={rm.id}>{rm.name}{rm.floor?.name ? ` — ${rm.floor.name}` : ''}</option>
              ))}
            </select>
          </div>
        ) : null}
        <label className="f-check"><input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} /> {t('pol.requires_approval')}</label>
        <label className="f-check"><input type="checkbox" checked={checkInRequired} onChange={(e) => setCheckInRequired(e.target.checked)} /> {t('pol.check_in')}</label>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('pol.max_duration')}</label><input className="f-input" type="number" min={1} value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)} /></div>
          <div className="f-group"><label className="f-label">{t('pol.buffer')}</label><input className="f-input" type="number" min={0} value={buffer} onChange={(e) => setBuffer(e.target.value)} /></div>
        </div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('pol.max_advance')}</label><input className="f-input" type="number" min={0} value={maxAdvance} onChange={(e) => setMaxAdvance(e.target.value)} /></div>
          <div className="f-group"><label className="f-label">{t('pol.per_day')}</label><input className="f-input" type="number" min={1} value={perDay} onChange={(e) => setPerDay(e.target.value)} /></div>
        </div>
        <label className="f-check" style={{ marginTop: 2 }}>
          <input type="checkbox" checked={overAdvanceApproval} onChange={(e) => setOverAdvanceApproval(e.target.checked)} /> {t('pol.over_advance')}
        </label>
        <div className="f-hint">{t('pol.over_advance_hint')}</div>

        {scope === 'ROOM' ? (
          <div className="f-group" style={{ marginTop: 12 }}>
            <label className="f-label">{t('pol.allowed_users')}</label>
            <div className="f-hint" style={{ marginBottom: 6 }}>{t('pol.allowed_hint')}</div>
            <input className="f-input" value={userQ} onChange={(e) => setUserQ(e.target.value)}
              placeholder={t('pol.allowed_search')} style={{ marginBottom: 8 }} />
            <div className="allow-list">
              {shownUsers.map((u) => (
                <label key={u.id} className="allow-row">
                  <input type="checkbox" checked={allowed.includes(u.id)}
                    onChange={(e) => setAllowed((a) =>
                      e.target.checked ? [...a, u.id] : a.filter((x) => x !== u.id))} />
                  <span className="allow-name">{u.fullName}</span>
                  <span className="allow-mail">{u.email}</span>
                </label>
              ))}
              {shownUsers.length === 0 ? <div className="empty" style={{ padding: 12 }}>{t('pol.allowed_none')}</div> : null}
            </div>
            {allowed.length > 0 ? (
              <div className="f-hint" style={{ marginTop: 6 }}>
                {t('pol.allowed_count').replace('{n}', String(allowed.length))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminFloor, AdminResource, AdminUser, Page, Policy } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';
import RoomQrModal from '@/components/RoomQrModal';

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'green', MAINTENANCE: 'amber', INACTIVE: 'grey' };
const AUDIENCE_BADGE: Record<string, string> = { BOTH: 'grey', INTERNAL: 'teal', EXTERNAL: 'amber' };
const FORM_ID = 'resource-form';

export default function ResourcesPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [rows, setRows] = useState<AdminResource[]>([]);
  // resourceId -> how many people it's restricted to (absent/0 = anyone).
  const [restricted, setRestricted] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<AdminResource | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<AdminResource[]>('/admin/resources').then(setRows).catch(() => setErr(true)).finally(() => setLoading(false));
    api.get<Policy[]>('/policies').then((all) => {
      const map: Record<string, number> = {};
      for (const p of all) {
        const ids = p.scope === 'ROOM' && p.resourceId ? p.rules?.allowedUserIds : null;
        if (Array.isArray(ids) && ids.length > 0) map[p.resourceId!] = ids.length;
      }
      setRestricted(map);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    setBusy(true);
    try { await api.del(`/admin/resources/${id}`); push(t('res.deleted'), 'success'); setConfirmId(null); load(); }
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
      <div className="page-head"><h1>{t('res.title')}</h1><button className="btn btn-primary" onClick={() => setEditing('new')}>{t('res.new')}</button></div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('th.name')}</th><th>{t('th.type')}</th><th>{t('th.floor')}</th><th>{t('th.capacity')}</th><th>{t('th.category')}</th><th>{t('th.audience')}</th><th>{t('th.status')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td><span className="badge teal">{r.type === 'ROOM' ? t('res.room') : t('res.desk')}</span></td>
                  <td>{r.floor?.name ?? '—'}</td>
                  <td>{r.capacity}</td>
                  <td>{r.category ?? '—'}</td>
                  <td><span className={`badge ${AUDIENCE_BADGE[r.audience] ?? 'grey'}`}>{t(`res.audience_${r.audience.toLowerCase()}`)}</span></td>
                  <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{t(`status.${r.status}`)}</span>
                    {restricted[r.id] ? (
                      <span className="badge amber" style={{ marginLeft: 6 }} title={t('res.bookable_specific')}>
                        {t('res.restricted_badge').replace('{n}', String(restricted[r.id]))}
                      </span>
                    ) : null}
                  </td>
                  <td><div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setQrFor(r)}>{t('qr.button')}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(r.id)}>{t('common.delete')}</button>
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={8}><div className="empty">{t('res.empty')}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      {editing ? <ResourceModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); load(); }} /> : null}
      {confirmId ? (
        <ConfirmModal title={t('res.confirm_title')} body={t('res.confirm_body')} confirmLabel={t('common.delete')}
          busy={busy} onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
      {qrFor ? <RoomQrModal resource={qrFor} onClose={() => setQrFor(null)} /> : null}
    </div>
  );
}

function ResourceModal({ row, onClose, onSaved }: { row: AdminResource | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [type, setType] = useState<'ROOM' | 'DESK'>(row?.type ?? 'ROOM');
  const [name, setName] = useState(row?.name ?? '');
  const [category, setCategory] = useState(row?.category ?? '');
  const [capacity, setCapacity] = useState(String(row?.capacity ?? 1));
  const [facilities, setFacilities] = useState((row?.facilities ?? []).join(', '));
  const [status, setStatus] = useState(row?.status ?? 'ACTIVE');
  const [audience, setAudience] = useState(row?.audience ?? 'BOTH');
  const [floorId, setFloorId] = useState(row?.floorId ?? '');
  const [floors, setFloors] = useState<AdminFloor[]>([]);
  const [busy, setBusy] = useState(false);

  // Who may book this room (tester feedback, folded into the room form
  // instead of a separate trip to Policies). Backed by the same ROOM-scope
  // BookingPolicy.rules.allowedUserIds the Policies page already writes.
  const [bookableBy, setBookableBy] = useState<'ANYONE' | 'SPECIFIC'>('ANYONE');
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>([]);
  const [userQ, setUserQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  // Any OTHER rules already set for this room (duration caps, approval, etc.)
  // via the Policies page — preserved on save so this form only ever touches
  // allowedUserIds, never silently wipes a colleague's other room rules.
  const [existingRules, setExistingRules] = useState<Record<string, any> | null>(null);

  // Without a floor a resource can never appear on a plan, so the picker is
  // loaded here rather than making admins go hunting for it.
  useEffect(() => { api.get<AdminFloor[]>('/admin/floors').then(setFloors).catch(() => {}); }, []);
  useEffect(() => {
    api.get<Page<AdminUser>>('/admin/users?page=1&pageSize=200').then((p) => setUsers(p.items)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!row) return;
    api.get<Policy[]>('/policies').then((all) => {
      const p = all.find((x) => x.scope === 'ROOM' && x.resourceId === row.id);
      if (!p) return;
      setExistingRules(p.rules ?? {});
      const ids = Array.isArray(p.rules?.allowedUserIds) ? p.rules.allowedUserIds : [];
      setAllowedUserIds(ids);
      if (ids.length > 0) setBookableBy('SPECIFIC');
    }).catch(() => {});
  }, [row]);

  const shownUsers = useMemo(() => {
    const term = userQ.trim().toLowerCase();
    const list = term
      ? users.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(term))
      : users;
    // Already-allowed users float to the top so the current list is visible.
    return [...list].sort((a, b) =>
      Number(allowedUserIds.includes(b.id)) - Number(allowedUserIds.includes(a.id)));
  }, [users, userQ, allowedUserIds]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const payload = {
      name, category: category || undefined, capacity: Number(capacity),
      facilities: facilities.split(',').map((s) => s.trim()).filter(Boolean),
      floorId: floorId || undefined,
      audience,
    };
    try {
      // `type` is fixed once a resource exists — the picker is disabled on edit
      // and the update DTO rejects it, so it is only sent on create.
      let resourceId = row?.id;
      if (row) await api.put(`/admin/resources/${row.id}`, { ...payload, status });
      else {
        const created = await api.post<AdminResource>('/admin/resources', { ...payload, type });
        resourceId = created.id;
      }
      // Skip the policy write for a fresh "anyone can book" room with nothing
      // to restrict yet — no reason to create an empty policy row for it.
      if (resourceId && (bookableBy === 'SPECIFIC' || existingRules)) {
        await api.put('/policies', {
          scope: 'ROOM',
          resourceId,
          rules: { ...(existingRules ?? {}), allowedUserIds: bookableBy === 'SPECIFIC' ? allowedUserIds : [] },
        });
      }
      onSaved();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? t('res.edit_title') : t('res.new_title')} onClose={onClose}
      formId={FORM_ID} submitLabel={t('common.save')} busy={busy}>
      <form id={FORM_ID} onSubmit={save}>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('th.type')}</label>
            <select className="f-select" value={type} onChange={(e) => setType(e.target.value as any)} disabled={!!row}>
              <option value="ROOM">{t('res.room')}</option><option value="DESK">{t('res.desk')}</option>
            </select>
          </div>
          <div className="f-group"><label className="f-label">{t('th.capacity')}</label>
            <input className="f-input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
          </div>
        </div>
        <div className="f-group"><label className="f-label">{t('th.name')}</label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="f-group"><label className="f-label">{t('th.category')}</label>
          <input className="f-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('res.category_ph')} />
        </div>
        <div className="f-group"><label className="f-label">{t('th.floor')}</label>
          <select className="f-select" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            <option value="">{t('res.no_floor')}</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>{f.building?.name ? `${f.building.name} · ${f.name}` : f.name}</option>
            ))}
          </select>
        </div>
        <div className="f-group"><label className="f-label">{t('res.facilities')}</label>
          <input className="f-input" value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder={t('res.facilities_ph')} />
        </div>
        <div className="f-group"><label className="f-label">{t('res.audience')}</label>
          <select className="f-select" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
            <option value="BOTH">{t('res.audience_both')}</option>
            <option value="INTERNAL">{t('res.audience_internal')}</option>
            <option value="EXTERNAL">{t('res.audience_external')}</option>
          </select>
        </div>
        {row ? (
          <div className="f-group"><label className="f-label">{t('th.status')}</label>
            <select className="f-select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="ACTIVE">{t('status.ACTIVE')}</option>
              <option value="MAINTENANCE">{t('status.MAINTENANCE')}</option>
              <option value="INACTIVE">{t('status.INACTIVE')}</option>
            </select>
          </div>
        ) : null}

        <div className="f-group" style={{ marginTop: 12 }}>
          <label className="f-label">{t('res.bookable_by')}</label>
          <label className="f-check"><input type="radio" name="bookableBy" checked={bookableBy === 'ANYONE'}
            onChange={() => setBookableBy('ANYONE')} /> {t('res.bookable_anyone')}</label>
          <label className="f-check"><input type="radio" name="bookableBy" checked={bookableBy === 'SPECIFIC'}
            onChange={() => setBookableBy('SPECIFIC')} /> {t('res.bookable_specific')}</label>
        </div>
        {bookableBy === 'SPECIFIC' ? (
          <div className="f-group">
            <div className="f-hint" style={{ marginBottom: 6 }}>{t('pol.allowed_hint')}</div>
            <input className="f-input" value={userQ} onChange={(e) => setUserQ(e.target.value)}
              placeholder={t('pol.allowed_search')} style={{ marginBottom: 8 }} />
            <div className="allow-list">
              {shownUsers.map((u) => (
                <label key={u.id} className="allow-row">
                  <input type="checkbox" checked={allowedUserIds.includes(u.id)}
                    onChange={(e) => setAllowedUserIds((a) =>
                      e.target.checked ? [...a, u.id] : a.filter((x) => x !== u.id))} />
                  <span className="allow-name">{u.fullName}</span>
                  <span className="allow-mail">{u.email}</span>
                </label>
              ))}
              {shownUsers.length === 0 ? <div className="empty" style={{ padding: 12 }}>{t('pol.allowed_none')}</div> : null}
            </div>
            {allowedUserIds.length > 0 ? (
              <div className="f-hint" style={{ marginTop: 6 }}>
                {t('pol.allowed_count').replace('{n}', String(allowedUserIds.length))}
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

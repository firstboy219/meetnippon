'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminResource } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';

const STATUS_BADGE: Record<string, string> = { ACTIVE: 'green', MAINTENANCE: 'amber', INACTIVE: 'grey' };
const FORM_ID = 'resource-form';

export default function ResourcesPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [rows, setRows] = useState<AdminResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    api.get<AdminResource[]>('/admin/resources').then(setRows).catch(() => setErr(true)).finally(() => setLoading(false));
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
            <thead><tr><th>{t('th.name')}</th><th>{t('th.type')}</th><th>{t('th.floor')}</th><th>{t('th.capacity')}</th><th>{t('th.category')}</th><th>{t('th.status')}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td><span className="badge teal">{r.type === 'ROOM' ? t('res.room') : t('res.desk')}</span></td>
                  <td>{r.floor?.name ?? '—'}</td>
                  <td>{r.capacity}</td>
                  <td>{r.category ?? '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{t(`status.${r.status}`)}</span></td>
                  <td><div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>{t('common.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(r.id)}>{t('common.delete')}</button>
                  </div></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={7}><div className="empty">{t('res.empty')}</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      {editing ? <ResourceModal row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); load(); }} /> : null}
      {confirmId ? (
        <ConfirmModal title={t('res.confirm_title')} body={t('res.confirm_body')} confirmLabel={t('common.delete')}
          busy={busy} onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
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
        <div className="f-group"><label className="f-label">{t('res.facilities')}</label>
          <input className="f-input" value={facilities} onChange={(e) => setFacilities(e.target.value)} placeholder={t('res.facilities_ph')} />
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
      </form>
    </Modal>
  );
}

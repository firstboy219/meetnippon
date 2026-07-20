'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { AdminBuilding, AdminFloor, AdminOffice, FloorPlan, FloorPlanPin } from '@/lib/types';
import { ConfirmModal, Modal } from '@/components/Modal';

type Tab = 'offices' | 'buildings' | 'floors';

export default function LocationsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('offices');
  const [offices, setOffices] = useState<AdminOffice[]>([]);
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [floors, setFloors] = useState<AdminFloor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false); setLoading(true);
    Promise.all([
      api.get<AdminOffice[]>('/admin/offices'),
      api.get<AdminBuilding[]>('/admin/buildings'),
      api.get<AdminFloor[]>('/admin/floors'),
    ])
      .then(([o, b, f]) => { setOffices(o); setBuildings(b); setFloors(f); })
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }

  const TABS: [Tab, string, number][] = [
    ['offices', t('loc.tab_offices'), offices.length],
    ['buildings', t('loc.tab_buildings'), buildings.length],
    ['floors', t('loc.tab_floors'), floors.length],
  ];

  return (
    <div>
      <div className="page-head"><h1>{t('loc.title')}</h1></div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label, n]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label} <span className="tab-count">{n}</span>
          </button>
        ))}
      </div>
      {tab === 'offices' ? <Offices rows={offices} reload={load} /> : null}
      {tab === 'buildings' ? <Buildings rows={buildings} offices={offices} reload={load} /> : null}
      {tab === 'floors' ? <Floors rows={floors} buildings={buildings} reload={load} /> : null}
    </div>
  );
}

/* ---------------------------------- offices --------------------------------- */

const OFFICE_FORM = 'office-form';

function Offices({ rows, reload }: { rows: AdminOffice[]; reload: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [editing, setEditing] = useState<AdminOffice | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(id: string) {
    setBusy(true);
    try { await api.del(`/admin/offices/${id}`); push(t('common.deleted'), 'success'); setConfirmId(null); reload(); }
    catch (e: any) { push(e?.message || t('common.delete_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h3>{t('loc.offices_title')}</h3>
          <div className="card-sub">{t('loc.offices_sub')}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>{t('loc.new_office')}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('th.name')}</th><th>{t('loc.address')}</th><th>{t('loc.geofence')}</th>
            <th>{t('loc.buildings')}</th><th>{t('th.status')}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 600 }}>{o.name}</td>
                <td>{o.address || '—'}</td>
                <td>
                  {o.lat != null && o.lng != null ? (
                    <span className="geo-cell">
                      <span className="badge teal">{o.geofenceRadiusM} m</span>
                      <span className="geo-coords">{o.lat.toFixed(5)}, {o.lng.toFixed(5)}</span>
                    </span>
                  ) : (
                    <span className="badge amber" title={t('loc.no_geo_hint')}>{t('loc.no_geo')}</span>
                  )}
                </td>
                <td>{o.buildings?.length ?? 0}</td>
                <td><span className={`badge ${o.isActive ? 'green' : 'grey'}`}>{o.isActive ? t('status.ACTIVE') : t('status.INACTIVE')}</span></td>
                <td><div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(o)}>{t('common.edit')}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(o.id)}>{t('common.delete')}</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={6}><div className="empty">{t('loc.offices_empty')}</div></td></tr> : null}
          </tbody>
        </table>
      </div>
      {editing ? (
        <OfficeModal row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); reload(); }} />
      ) : null}
      {confirmId ? (
        <ConfirmModal title={t('loc.del_office_title')} body={t('loc.del_office_body')}
          confirmLabel={t('common.delete')} busy={busy}
          onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
    </div>
  );
}

function OfficeModal({ row, onClose, onSaved }: { row: AdminOffice | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [name, setName] = useState(row?.name ?? '');
  const [address, setAddress] = useState(row?.address ?? '');
  const [lat, setLat] = useState(row?.lat != null ? String(row.lat) : '');
  const [lng, setLng] = useState(row?.lng != null ? String(row.lng) : '');
  const [radius, setRadius] = useState(String(row?.geofenceRadiusM ?? 150));
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    // Coordinates are all-or-nothing: half a pair can never match a geofence,
    // so it is better to reject it here than to store a location that silently
    // never classifies anyone as being in the office.
    const hasLat = lat.trim() !== '';
    const hasLng = lng.trim() !== '';
    if (hasLat !== hasLng) {
      push(t('loc.coords_pair'), 'error'); setBusy(false); return;
    }
    const payload: Record<string, unknown> = {
      name,
      address: address.trim() || undefined,
      geofenceRadiusM: Number(radius),
      isActive,
    };
    if (hasLat) { payload.lat = Number(lat); payload.lng = Number(lng); }
    try {
      if (row) await api.put(`/admin/offices/${row.id}`, payload);
      else await api.post('/admin/offices', payload);
      onSaved();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { push(t('loc.geo_unsupported'), 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        push(t('loc.geo_filled'), 'success');
      },
      () => push(t('loc.geo_denied'), 'error'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <Modal title={row ? t('loc.edit_office') : t('loc.new_office')} onClose={onClose}
      formId={OFFICE_FORM} submitLabel={t('common.save')} busy={busy}>
      <form id={OFFICE_FORM} onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('th.name')}</label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="f-group"><label className="f-label">{t('loc.address')}</label>
          <input className="f-input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="f-row2">
          <div className="f-group"><label className="f-label">{t('loc.lat')}</label>
            <input className="f-input" type="number" step="any" min={-90} max={90}
              value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-6.200000" />
          </div>
          <div className="f-group"><label className="f-label">{t('loc.lng')}</label>
            <input className="f-input" type="number" step="any" min={-180} max={180}
              value={lng} onChange={(e) => setLng(e.target.value)} placeholder="106.816666" />
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>{t('loc.use_my_location')}</button>
        <div className="f-group" style={{ marginTop: 14 }}><label className="f-label">{t('loc.radius')}</label>
          <input className="f-input" type="number" min={10} max={100000}
            value={radius} onChange={(e) => setRadius(e.target.value)} required />
          <div className="f-hint">{t('loc.radius_hint')}</div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>{t('loc.active')}</span>
        </label>
        <div className="info-box">{t('loc.privacy_note')}</div>
      </form>
    </Modal>
  );
}

/* -------------------------------- buildings -------------------------------- */

const BUILDING_FORM = 'building-form';

function Buildings({ rows, offices, reload }: { rows: AdminBuilding[]; offices: AdminOffice[]; reload: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [editing, setEditing] = useState<AdminBuilding | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const officeName = (id: string | null) => offices.find((o) => o.id === id)?.name ?? '—';

  async function remove(id: string) {
    setBusy(true);
    try { await api.del(`/admin/buildings/${id}`); push(t('common.deleted'), 'success'); setConfirmId(null); reload(); }
    catch (e: any) { push(e?.message || t('common.delete_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="section-head">
        <div><h3>{t('loc.buildings_title')}</h3><div className="card-sub">{t('loc.buildings_sub')}</div></div>
        <button className="btn btn-primary btn-sm" disabled={offices.length === 0}
          title={offices.length === 0 ? t('loc.need_office') : undefined}
          onClick={() => setEditing('new')}>{t('loc.new_building')}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t('th.name')}</th><th>{t('loc.office')}</th><th>{t('loc.floors')}</th><th></th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.name}</td>
                <td>{officeName(b.officeLocationId)}</td>
                <td>{b.floors?.length ?? 0}</td>
                <td><div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(b)}>{t('common.edit')}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(b.id)}>{t('common.delete')}</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={4}><div className="empty">{offices.length === 0 ? t('loc.need_office') : t('loc.buildings_empty')}</div></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {editing ? (
        <BuildingModal row={editing === 'new' ? null : editing} offices={offices}
          onClose={() => setEditing(null)}
          onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); reload(); }} />
      ) : null}
      {confirmId ? (
        <ConfirmModal title={t('loc.del_building_title')} body={t('loc.del_building_body')}
          confirmLabel={t('common.delete')} busy={busy}
          onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
    </div>
  );
}

function BuildingModal({ row, offices, onClose, onSaved }: {
  row: AdminBuilding | null; offices: AdminOffice[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [name, setName] = useState(row?.name ?? '');
  const [officeId, setOfficeId] = useState(row?.officeLocationId ?? offices[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const payload = { name, officeLocationId: officeId || undefined };
    try {
      if (row) await api.put(`/admin/buildings/${row.id}`, payload);
      else await api.post('/admin/buildings', payload);
      onSaved();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? t('loc.edit_building') : t('loc.new_building')} onClose={onClose}
      formId={BUILDING_FORM} submitLabel={t('common.save')} busy={busy}>
      <form id={BUILDING_FORM} onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('th.name')}</label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="f-group"><label className="f-label">{t('loc.office')}</label>
          <select className="f-select" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
            {offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- floors --------------------------------- */

const FLOOR_FORM = 'floor-form';

function Floors({ rows, buildings, reload }: { rows: AdminFloor[]; buildings: AdminBuilding[]; reload: () => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [editing, setEditing] = useState<AdminFloor | 'new' | null>(null);
  const [planFor, setPlanFor] = useState<AdminFloor | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(id: string) {
    setBusy(true);
    try { await api.del(`/admin/floors/${id}`); push(t('common.deleted'), 'success'); setConfirmId(null); reload(); }
    catch (e: any) { push(e?.message || t('common.delete_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="section-head">
        <div><h3>{t('loc.floors_title')}</h3><div className="card-sub">{t('loc.floors_sub')}</div></div>
        <button className="btn btn-primary btn-sm" disabled={buildings.length === 0}
          title={buildings.length === 0 ? t('loc.need_building') : undefined}
          onClick={() => setEditing('new')}>{t('loc.new_floor')}</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('th.name')}</th><th>{t('loc.building')}</th><th>{t('loc.resources')}</th>
            <th>{t('loc.plan')}</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td style={{ fontWeight: 600 }}>{f.name}</td>
                <td>{f.building?.name ?? '—'}</td>
                <td>{f._count?.resources ?? 0}</td>
                <td>
                  <span className={`badge ${f.floorPlan?.imageUrl ? 'green' : 'grey'}`}>
                    {f.floorPlan?.imageUrl ? t('loc.plan_set') : t('loc.plan_none')}
                  </span>
                </td>
                <td><div className="row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setPlanFor(f)}>{t('loc.edit_plan')}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(f)}>{t('common.edit')}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmId(f.id)}>{t('common.delete')}</button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5}><div className="empty">{buildings.length === 0 ? t('loc.need_building') : t('loc.floors_empty')}</div></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {editing ? (
        <FloorModal row={editing === 'new' ? null : editing} buildings={buildings}
          onClose={() => setEditing(null)}
          onSaved={() => { push(t('common.saved'), 'success'); setEditing(null); reload(); }} />
      ) : null}
      {planFor ? (
        <FloorPlanEditor floor={planFor} onClose={() => setPlanFor(null)}
          onSaved={() => { push(t('common.saved'), 'success'); setPlanFor(null); reload(); }} />
      ) : null}
      {confirmId ? (
        <ConfirmModal title={t('loc.del_floor_title')} body={t('loc.del_floor_body')}
          confirmLabel={t('common.delete')} busy={busy}
          onClose={() => setConfirmId(null)} onConfirm={() => remove(confirmId)} />
      ) : null}
    </div>
  );
}

function FloorModal({ row, buildings, onClose, onSaved }: {
  row: AdminFloor | null; buildings: AdminBuilding[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [name, setName] = useState(row?.name ?? '');
  const [buildingId, setBuildingId] = useState(row?.buildingId ?? buildings[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (row) await api.put(`/admin/floors/${row.id}`, { name, buildingId });
      else await api.post('/admin/floors', { name, buildingId });
      onSaved();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={row ? t('loc.edit_floor') : t('loc.new_floor')} onClose={onClose}
      formId={FLOOR_FORM} submitLabel={t('common.save')} busy={busy}>
      <form id={FLOOR_FORM} onSubmit={save}>
        <div className="f-group"><label className="f-label">{t('th.name')}</label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('loc.floor_ph')} />
        </div>
        <div className="f-group"><label className="f-label">{t('loc.building')}</label>
          <select className="f-select" value={buildingId} onChange={(e) => setBuildingId(e.target.value)} required>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ floor plan pins ----------------------------- */

/**
 * Places resources on the plan image. Coordinates are stored as a fraction of
 * the rendered image (0..1), so swapping in a plan at a different resolution
 * leaves every pin where the admin put it.
 */
function FloorPlanEditor({ floor, onClose, onSaved }: {
  floor: AdminFloor; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [pins, setPins] = useState<FloorPlanPin[]>([]);
  const [placing, setPlacing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const imgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.get<FloorPlan>(`/admin/floors/${floor.id}/plan`)
      .then((p) => { setPlan(p); setImageUrl(p.imageUrl ?? ''); setPins(p.pins ?? []); })
      .catch((e: any) => push(e?.message || t('common.load_error'), 'error'))
      .finally(() => setLoading(false));
  }, [floor.id, push, t]);

  // ESC cancels pin placement before it closes the dialog, so an admin mid-place
  // does not lose the unsaved layout.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPlacing(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [placing]);

  function placeAt(e: React.MouseEvent) {
    if (!placing || !imgRef.current) return;
    const r = imgRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setPins((ps) => [...ps.filter((p) => p.resourceId !== placing), { resourceId: placing, x, y }]);
    setPlacing(null);
  }

  async function save() {
    setBusy(true);
    try {
      await api.put(`/admin/floors/${floor.id}/plan`, { imageUrl: imageUrl.trim() || null, pins });
      onSaved();
    } catch (e: any) { push(e?.message || t('common.save_failed'), 'error'); }
    finally { setBusy(false); }
  }

  const resources = plan?.resources ?? [];
  const pinned = new Map(pins.map((p) => [p.resourceId, p]));
  const nameOf = (id: string) => resources.find((r) => r.id === id)?.name ?? id;

  return (
    <Modal title={`${t('loc.plan_for')} ${floor.name}`} onClose={onClose} wide
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-primary" disabled={busy || loading} onClick={save}>
          {busy ? <span className="spinner" /> : t('common.save')}
        </button>
      </>}>
      {loading ? <div className="empty">{t('common.loading')}</div> : (
        <div className="plan-editor">
          <div className="f-group">
            <label className="f-label">{t('loc.plan_url')}</label>
            <input className="f-input" value={imageUrl} placeholder="https://…"
              onChange={(e) => { setImageUrl(e.target.value); setImgBroken(false); }} />
            <div className="f-hint">{t('loc.plan_url_hint')}</div>
          </div>

          {imageUrl.trim() ? (
            <div className={`plan-canvas ${placing ? 'placing' : ''}`} ref={imgRef} onClick={placeAt}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={floor.name} onError={() => setImgBroken(true)} onLoad={() => setImgBroken(false)} />
              {imgBroken ? <div className="plan-broken">{t('loc.plan_broken')}</div> : null}
              {pins.map((p) => (
                <span key={p.resourceId} className="plan-pin" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                  <span className="plan-pin-dot" />
                  <span className="plan-pin-label">{nameOf(p.resourceId)}</span>
                </span>
              ))}
              {placing ? <div className="plan-hint">{t('loc.click_to_place')}</div> : null}
            </div>
          ) : (
            <div className="empty">{t('loc.plan_add_url')}</div>
          )}

          <div className="plan-list">
            <div className="f-label">{t('loc.resources_on_floor')} ({resources.length})</div>
            {resources.length === 0 ? (
              <div className="f-hint">{t('loc.no_resources_hint')}</div>
            ) : resources.map((r) => {
              const p = pinned.get(r.id);
              return (
                <div key={r.id} className="plan-row">
                  <span className={`badge ${r.type === 'ROOM' ? 'teal' : 'grey'}`}>{r.type === 'ROOM' ? t('res.room') : t('res.desk')}</span>
                  <span className="plan-row-name">{r.name}</span>
                  <span className="plan-row-pos">{p ? `${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%` : t('loc.unplaced')}</span>
                  <button type="button" className={`btn btn-sm ${placing === r.id ? 'btn-primary' : 'btn-ghost'}`}
                    disabled={!imageUrl.trim()}
                    onClick={() => setPlacing(placing === r.id ? null : r.id)}>
                    {placing === r.id ? t('common.cancel') : p ? t('loc.move') : t('loc.place')}
                  </button>
                  {p ? (
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => setPins((ps) => ps.filter((x) => x.resourceId !== r.id))}>
                      {t('common.remove')}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

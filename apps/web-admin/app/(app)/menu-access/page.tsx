'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { MenuVisibilityRow, UserRole } from '@/lib/types';

/**
 * Same order and keys as the API's MENU_KEYS (apps/api/src/menu/menu-keys.ts)
 * — kept as a small duplicated constant rather than fetched, since the grid
 * needs to render every key (even ones with no override row yet) in a stable
 * order the moment the page loads, before any network round trip.
 */
const MENU_KEYS = [
  'book', 'denah', 'schedule', 'bookings', 'calendar', 'history',
  'approvals', 'hub', 'chat', 'about',
] as const;

const ROLES: UserRole[] = ['EMPLOYEE', 'APPROVER', 'ADMIN'];

/** grid[menuKey][role] = visible */
type Grid = Record<string, Record<UserRole, boolean>>;

function rowsToGrid(rows: MenuVisibilityRow[]): Grid {
  const g: Grid = {};
  for (const key of MENU_KEYS) g[key] = { EMPLOYEE: true, APPROVER: true, ADMIN: true };
  for (const r of rows) {
    if (!g[r.menuKey]) continue;
    g[r.menuKey][r.role] = r.visible;
  }
  return g;
}

export default function MenuAccessPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [grid, setGrid] = useState<Grid | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    api.get<MenuVisibilityRow[]>('/admin/menu-visibility')
      .then((rows) => setGrid(rowsToGrid(rows)))
      .catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggle(menuKey: string, role: UserRole) {
    setGrid((g) => {
      if (!g) return g;
      return { ...g, [menuKey]: { ...g[menuKey], [role]: !g[menuKey][role] } };
    });
  }

  async function save() {
    if (!grid) return;
    setBusy(true);
    try {
      const rows: MenuVisibilityRow[] = MENU_KEYS.flatMap((menuKey) =>
        ROLES.map((role) => ({ menuKey, role, visible: grid[menuKey][role] })));
      const saved = await api.put<MenuVisibilityRow[]>('/admin/menu-visibility', { rows });
      setGrid(rowsToGrid(saved));
      push(t('menuAccess.saved'), 'success');
    } catch (e: any) {
      push(e?.message || t('common.save_failed'), 'error');
    } finally { setBusy(false); }
  }

  if (!grid) {
    if (err) {
      return (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      );
    }
    return <div className="empty">{t('common.loading')}</div>;
  }

  return (
    <div>
      <div className="page-head"><h1>{t('menuAccess.title')}</h1></div>
      <div className="info-box">{t('menuAccess.info')}</div>

      <div className="card">
        <div className="table-wrap">
          <table className="mv-table">
            <thead>
              <tr>
                <th>{t('menuAccess.menu')}</th>
                {ROLES.map((r) => <th key={r} className="mv-col">{t(`role.${r}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {MENU_KEYS.map((key) => (
                <tr key={key}>
                  <td style={{ fontWeight: 600 }}>{t(`menuAccess.${key}`)}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="mv-col">
                      <input type="checkbox" checked={grid[key][role]}
                        aria-label={`${t(`menuAccess.${key}`)} — ${t(`role.${role}`)}`}
                        onChange={() => toggle(key, role)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="f-hint" style={{ padding: '12px 4px 0' }}>{t('menuAccess.dashboard_note')}</div>
        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? <span className="spinner" /> : t('menuAccess.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

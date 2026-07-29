import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { runUnscoped } from '../tenant/tenant-context';
import { MENU_KEYS, MENU_ROLES, MenuKey, MenuRole } from './menu-keys';

export interface MenuVisibilityRow {
  menuKey: string;
  role: MenuRole;
  visible: boolean;
}

/**
 * Per-tenant, per-role control over which sidebar items appear in the user
 * portal (BRD: admin decides what each role can see).
 *
 * `HiddenMenuItem` rows only ever record exceptions — a menu item with no row
 * for a given role is visible, which is why the default state (before any
 * admin ever opens this settings page) is "everything visible", and a menu
 * key added by a future release needs no data migration to be seen.
 */
@Injectable()
export class MenuVisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Full grid for the admin console: every menu key × every role. */
  async matrix(): Promise<MenuVisibilityRow[]> {
    const hidden = await this.prisma.scoped.hiddenMenuItem.findMany({
      select: { menuKey: true, role: true },
    });
    const hiddenSet = new Set(hidden.map((h) => `${h.menuKey}:${h.role}`));
    const rows: MenuVisibilityRow[] = [];
    for (const menuKey of MENU_KEYS) {
      for (const role of MENU_ROLES) {
        rows.push({ menuKey, role, visible: !hiddenSet.has(`${menuKey}:${role}`) });
      }
    }
    return rows;
  }

  /**
   * Replace the tenant's hidden set with exactly what the console submitted.
   *
   * The grid UI always sends its full current state (every checkbox), so a
   * full delete-and-recreate is simpler and safer than diffing row by row —
   * there is no partial-update case to get wrong. Unknown menu keys or roles
   * are dropped rather than stored, so a stale client build cannot wedge junk
   * into the table.
   */
  async save(rows: MenuVisibilityRow[]): Promise<MenuVisibilityRow[]> {
    const knownKeys = new Set<string>(MENU_KEYS);
    const knownRoles = new Set<string>(MENU_ROLES);
    const toHide = rows.filter((r) => !r.visible && knownKeys.has(r.menuKey) && knownRoles.has(r.role));

    await this.prisma.scoped.hiddenMenuItem.deleteMany({});
    if (toHide.length) {
      await this.prisma.scoped.hiddenMenuItem.createMany({
        data: toHide.map((r) => ({ menuKey: r.menuKey, role: r.role })) as any,
      });
    }
    await this.audit.log({
      action: 'menu_visibility.update',
      entity: 'HiddenMenuItem',
      metadata: { hiddenCount: toHide.length },
    });
    return this.matrix();
  }

  /**
   * Menu keys hidden from a given role. Called on every `/auth/me`, so it
   * takes an explicit tenantId rather than relying on ambient request context
   * — the same defensive style `me()` already uses for its own user lookup.
   */
  async hiddenFor(tenantId: string, role: string): Promise<MenuKey[]> {
    const rows = await runUnscoped(() =>
      this.prisma.hiddenMenuItem.findMany({
        where: { tenantId, role: role as MenuRole },
        select: { menuKey: true },
      }),
    );
    return rows.map((r) => r.menuKey as MenuKey);
  }
}

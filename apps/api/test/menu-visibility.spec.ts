/**
 * Admin-configurable menu visibility per role. Live DB.
 *
 * The properties worth pinning: default is "everyone sees everything" (no
 * migration needed for a menu key nobody has configured yet), hiding is
 * per-role (not global), a save() fully replaces the previous hidden set
 * rather than merging with it, and `/auth/me`'s hiddenMenus reflects exactly
 * what an admin configured for the CALLER's own role.
 */
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { NotificationService } from '../src/notification/notification.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service';
import { MenuVisibilityService } from '../src/menu/menu-visibility.service';
import { MENU_KEYS, MENU_ROLES, MenuRole } from '../src/menu/menu-keys';

/** Every key visible for every role, except the ones named as hidden for a role. */
function gridWithHidden(hidden: Partial<Record<MenuRole, string[]>>) {
  const rows: { menuKey: string; role: MenuRole; visible: boolean }[] = [];
  for (const menuKey of MENU_KEYS) {
    for (const role of MENU_ROLES) {
      rows.push({ menuKey, role, visible: !(hidden[role] ?? []).includes(menuKey) });
    }
  }
  return rows;
}
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'mv-tenant';
const ADMIN = 'mv-admin';
const EMP = 'mv-emp';
const APPR = 'mv-appr';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const mail = new TestMailService();
const config = new ConfigService({
  APP_BASE_URL: 'https://test.local',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
});
const flags = new FeatureFlagService(prisma, audit, config);
const notifications = new NotificationService(prisma, flags);
const menu = new MenuVisibilityService(prisma, audit);
const resolver = new TenantResolverService(prisma, config);
const auth = new AuthService(prisma, new JwtService({}), config, audit, resolver, mail, notifications, menu);

const asAdmin = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: ADMIN, role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.hiddenMenuItem.deleteMany({ where: { tenantId: T } });
  await prisma.auditLog.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'MV Co', slug: 'mv-co' } });
  await prisma.user.createMany({
    data: [
      { id: ADMIN, tenantId: T, email: 'admin@mv.co', fullName: 'Admin', role: 'ADMIN' },
      { id: EMP, tenantId: T, email: 'emp@mv.co', fullName: 'Emp', role: 'EMPLOYEE' },
      { id: APPR, tenantId: T, email: 'appr@mv.co', fullName: 'Appr', role: 'APPROVER' },
    ],
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(() => prisma.hiddenMenuItem.deleteMany({ where: { tenantId: T } }));

describe('menu visibility matrix', () => {
  it('defaults to visible for every menu key × role with no overrides', async () => {
    const rows = await asAdmin(() => menu.matrix());
    expect(rows).toHaveLength(MENU_KEYS.length * MENU_ROLES.length);
    expect(rows.every((r) => r.visible)).toBe(true);
  });

  it('save() hides exactly the submitted rows, per role', async () => {
    await asAdmin(() => menu.save(gridWithHidden({ EMPLOYEE: ['chat'] })));

    expect(await menu.hiddenFor(T, 'EMPLOYEE')).toEqual(['chat']);
    // Not a global switch — the other roles are untouched.
    expect(await menu.hiddenFor(T, 'APPROVER')).toEqual([]);
    expect(await menu.hiddenFor(T, 'ADMIN')).toEqual([]);
  });

  it('save() fully replaces the previous hidden set rather than merging', async () => {
    await asAdmin(() => menu.save(gridWithHidden({ EMPLOYEE: ['chat'] })));
    expect(await menu.hiddenFor(T, 'EMPLOYEE')).toEqual(['chat']);

    // Re-save with 'chat' turned back on and 'hub' hidden instead.
    await asAdmin(() => menu.save(gridWithHidden({ EMPLOYEE: ['hub'] })));
    // 'chat' came back, 'hub' is now the only one hidden — not both.
    expect(await menu.hiddenFor(T, 'EMPLOYEE')).toEqual(['hub']);
  });

  it('drops unknown menu keys and roles rather than storing them', async () => {
    await asAdmin(() => menu.save([
      { menuKey: 'not-a-real-menu', role: 'EMPLOYEE', visible: false },
      { menuKey: 'book', role: 'NOT_A_ROLE' as any, visible: false },
      { menuKey: 'book', role: 'EMPLOYEE', visible: false }, // the one legitimate row
    ] as any));
    expect(await menu.hiddenFor(T, 'EMPLOYEE')).toEqual(['book']);
    const stray = await prisma.hiddenMenuItem.count({
      where: { tenantId: T, menuKey: { notIn: [...MENU_KEYS] } },
    });
    expect(stray).toBe(0);
  });
});

describe('/auth/me integration', () => {
  it('reflects the caller\'s own role, and stays empty for a role with no hidden items', async () => {
    await asAdmin(() => menu.save(gridWithHidden({ EMPLOYEE: ['approvals'] })));

    const empMe = await auth.me(EMP);
    expect(empMe.hiddenMenus).toEqual(['approvals']);

    const apprMe = await auth.me(APPR);
    expect(apprMe.hiddenMenus).toEqual([]);

    const adminMe = await auth.me(ADMIN);
    expect(adminMe.hiddenMenus).toEqual([]);
  });
});

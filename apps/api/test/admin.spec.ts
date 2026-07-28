/**
 * Admin CRUD integration tests (Phase 4). Require a live database.
 * Covers location/resource/user/branding management, key guards, and that
 * admin listings never cross tenants.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { LocationService } from '../src/admin/location.service';
import { ResourceAdminService } from '../src/admin/resource-admin.service';
import { UserAdminService } from '../src/admin/user-admin.service';
import { AuthService } from '../src/auth/auth.service';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service';
import { JwtService } from '@nestjs/jwt';
import { BrandingService } from '../src/admin/branding.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { PlanService } from '../src/billing/plan.service';
import { runWithTenant } from '../src/tenant/tenant-context';
import { ConfigService } from '@nestjs/config';
import { TestMailService } from './helpers/test-mail';

const A = 'adm-tA';
const B = 'adm-tB';
const ADMIN = 'adm-admin';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const plan = new PlanService(prisma, flags);
const loc = new LocationService(prisma, audit);
const resAdmin = new ResourceAdminService(prisma, audit, plan);
const mail = new TestMailService();
const adminCfg = new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(64), JWT_REFRESH_SECRET: 'b'.repeat(64) });
const adminAuth = new AuthService(prisma, new JwtService({}), adminCfg, audit,
  new TenantResolverService(prisma, adminCfg), mail);
const users = new UserAdminService(prisma, audit, plan, mail, adminCfg, adminAuth);
const branding = new BrandingService(prisma, audit);

const asAdmin = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: A, userId: ADMIN, role: 'ADMIN' }, fn);
const asAdminB = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: B, userId: 'adm-adminB', role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.resource.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.floor.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.building.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.officeLocation.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenantBranding.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  for (const id of [A, B]) await prisma.tenant.create({ data: { id, name: id, slug: id } });
  await prisma.user.create({ data: { id: ADMIN, tenantId: A, email: 'admin@a.co', fullName: 'Admin A', role: 'ADMIN' } });
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe('admin location + resource CRUD', () => {
  it('creates office -> building -> floor -> resource', async () => {
    await asAdmin(async () => {
      const office = await loc.createOffice({ name: 'HQ' });
      const building = await loc.createBuilding({ name: 'Tower', officeLocationId: office.id });
      const floor = await loc.createFloor({ name: 'L1', buildingId: building.id });
      const room = await resAdmin.create({ type: 'ROOM', name: 'Alpha', floorId: floor.id, capacity: 6 });
      expect(room.tenantId).toBe(A);
      expect(room.status).toBe('ACTIVE');
    });
  });

  it('updates resource status', async () => {
    await asAdmin(async () => {
      const all = await resAdmin.listAll();
      const r = all[0];
      const updated = await resAdmin.update(r.id, { status: 'MAINTENANCE' });
      expect(updated.status).toBe('MAINTENANCE');
    });
  });
});

describe('floor plans', () => {
  it('saves pins and reads them back with the floor\'s resources', async () => {
    await asAdmin(async () => {
      const floors = await loc.listFloors();
      const floor = floors[0];
      const room = (await resAdmin.listAll()).find((r) => r.floorId === floor.id)!;

      const saved = await loc.saveFloorPlan(floor.id, {
        imageUrl: 'https://cdn.example.com/l1.png',
        pins: [{ resourceId: room.id, x: 0.25, y: 0.8 }],
      });
      expect(saved.imageUrl).toBe('https://cdn.example.com/l1.png');
      expect(saved.pins).toEqual([{ resourceId: room.id, x: 0.25, y: 0.8 }]);
      expect(saved.resources.map((r) => r.id)).toContain(room.id);

      // upsert path: a second save must update, not duplicate
      const again = await loc.saveFloorPlan(floor.id, { pins: [] });
      expect(again.pins).toEqual([]);
      expect(again.imageUrl).toBe('https://cdn.example.com/l1.png'); // untouched
    });
  });

  it('refuses a pin for a resource that is not on this floor', async () => {
    await asAdmin(async () => {
      const floors = await loc.listFloors();
      const other = await loc.createFloor({ name: 'L2', buildingId: floors[0].buildingId });
      const room = (await resAdmin.listAll()).find((r) => r.floorId === floors[0].id)!;
      await expect(
        loc.saveFloorPlan(other.id, { pins: [{ resourceId: room.id, x: 0.5, y: 0.5 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('refuses the same resource pinned twice', async () => {
    await asAdmin(async () => {
      const floor = (await loc.listFloors())[0];
      const room = (await resAdmin.listAll()).find((r) => r.floorId === floor.id)!;
      await expect(
        loc.saveFloorPlan(floor.id, {
          pins: [
            { resourceId: room.id, x: 0.1, y: 0.1 },
            { resourceId: room.id, x: 0.9, y: 0.9 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('does not expose one tenant\'s floor plan to another', async () => {
    const floorA = await asAdmin(async () => (await loc.listFloors())[0]);
    // Tenant B asking for tenant A's floor must not find it at all.
    await expect(asAdminB(() => loc.getFloorPlan(floorA.id))).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      asAdminB(() => loc.saveFloorPlan(floorA.id, { imageUrl: 'https://evil.example/x.png' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('admin user management', () => {
  it('creates a user and rejects duplicate email', async () => {
    await asAdmin(async () => {
      const u: any = await users.create({ email: 'newbie@a.co', fullName: 'New Bie', role: 'EMPLOYEE' });
      expect(u.email).toBe('newbie@a.co');
      expect(u.tempPassword).toBeTruthy(); // generated since no password supplied
    });
    await expect(asAdmin(() => users.create({ email: 'newbie@a.co', fullName: 'Dup' }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents an admin from deactivating themselves', async () => {
    await expect(asAdmin(() => users.setActive(ADMIN, { isActive: false }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('user list paging', () => {
  it('pages, reports a real total, and never leaks another tenant\'s users', async () => {
    await asAdmin(async () => {
      for (let i = 0; i < 7; i++) {
        await users.create({ email: `page${i}@a.co`, fullName: `Page User ${i}`, role: 'EMPLOYEE' });
      }
    });
    await asAdminB(() => users.create({ email: 'other@b.co', fullName: 'Other Tenant' }));

    const first = await asAdmin(() => users.list({ page: 1, pageSize: 3 }));
    expect(first.items).toHaveLength(3);
    expect(first.pageSize).toBe(3);
    expect(first.pages).toBe(Math.ceil(first.total / 3));
    // the count is of this tenant only
    expect(first.items.every((u: any) => u.email.endsWith('@a.co'))).toBe(true);

    const second = await asAdmin(() => users.list({ page: 2, pageSize: 3 }));
    expect(second.items[0].id).not.toBe(first.items[0].id);
    // pages do not overlap
    const ids = new Set(first.items.map((u: any) => u.id));
    expect(second.items.some((u: any) => ids.has(u.id))).toBe(false);

    // a page past the end is empty, not an error
    const far = await asAdmin(() => users.list({ page: 999, pageSize: 3 }));
    expect(far.items).toHaveLength(0);
    expect(far.total).toBe(first.total);
  });

  it('filters by search term and by role', async () => {
    const byName = await asAdmin(() => users.list({ q: 'Page User 3' }));
    expect(byName.total).toBe(1);
    expect(byName.items[0].fullName).toBe('Page User 3');

    const byEmail = await asAdmin(() => users.list({ q: 'page5@a.co' }));
    expect(byEmail.total).toBe(1);

    const admins = await asAdmin(() => users.list({ role: 'ADMIN' }));
    expect(admins.items.every((u: any) => u.role === 'ADMIN')).toBe(true);

    const nothing = await asAdmin(() => users.list({ q: 'no-such-person' }));
    expect(nothing.total).toBe(0);
    expect(nothing.pages).toBe(1); // never "page 1 of 0"
  });

  it('filters by active state', async () => {
    const target = (await asAdmin(() => users.list({ q: 'page0@a.co' }))).items[0];
    await asAdmin(() => users.setActive(target.id, { isActive: false }));

    const inactive = await asAdmin(() => users.list({ isActive: 'false' }));
    expect(inactive.items.some((u: any) => u.id === target.id)).toBe(true);
    const active = await asAdmin(() => users.list({ isActive: 'true' }));
    expect(active.items.some((u: any) => u.id === target.id)).toBe(false);
  });
});

describe('admin branding', () => {
  it('rejects an invalid subdomain and accepts a valid one', async () => {
    await expect(asAdmin(() => branding.update({ subdomain: 'ab' }))).rejects.toBeInstanceOf(BadRequestException);
    await asAdmin(async () => {
      const b = await branding.update({ primaryColor: '#123456', subdomain: 'tenant-a' });
      expect(b.subdomain).toBe('tenant-a');
      expect(b.primaryColor).toBe('#123456');
    });
  });
});

describe('admin tenant isolation', () => {
  it('does not list another tenant resources', async () => {
    await asAdminB(() => resAdmin.create({ type: 'ROOM', name: 'B-Room' }));
    const namesA = await asAdmin(async () => resAdmin.listAll());
    expect(namesA.some((r) => r.name === 'B-Room')).toBe(false);
  });
});

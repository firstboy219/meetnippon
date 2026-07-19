/**
 * Admin CRUD integration tests (Phase 4). Require a live database.
 * Covers location/resource/user/branding management, key guards, and that
 * admin listings never cross tenants.
 */
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { LocationService } from '../src/admin/location.service';
import { ResourceAdminService } from '../src/admin/resource-admin.service';
import { UserAdminService } from '../src/admin/user-admin.service';
import { BrandingService } from '../src/admin/branding.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const A = 'adm-tA';
const B = 'adm-tB';
const ADMIN = 'adm-admin';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const loc = new LocationService(prisma, audit);
const resAdmin = new ResourceAdminService(prisma, audit);
const users = new UserAdminService(prisma, audit);
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

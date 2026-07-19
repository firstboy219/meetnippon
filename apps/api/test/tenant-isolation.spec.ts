/**
 * Cross-tenant leakage tests — the Phase 1 non-negotiable.
 *
 * Proves the tenant-scoping Prisma extension (PrismaService.scoped) makes it
 * impossible for one tenant's request context to read or mutate another
 * tenant's rows, and fails closed when there is no tenant in context.
 *
 * Requires a reachable database (DATABASE_URL). Run inside the compose network.
 */
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const A = 'test-tenant-A';
const B = 'test-tenant-B';

const prisma = new PrismaService();
const scoped = prisma.scoped;

async function wipe() {
  // base client = no extension = unscoped; clean our fixtures only
  await prisma.resource.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenantBranding.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  for (const id of [A, B]) {
    await prisma.tenant.create({ data: { id, name: id, slug: id } });
    await prisma.resource.create({
      data: {
        id: `res-${id}`,
        tenantId: id,
        type: 'ROOM',
        name: `Room ${id}`,
      },
    });
  }
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe('tenant isolation', () => {
  // NOTE: the tenant-scoping extension reads AsyncLocalStorage lazily, when the
  // PrismaPromise executes. The query MUST therefore be awaited *inside* the
  // runWithTenant callback (mirroring the HTTP middleware, which wraps the whole
  // request). Awaiting the lazy promise outside the scope loses the context.

  it('findMany only returns the current tenant rows', async () => {
    await runWithTenant({ tenantId: A }, async () => {
      const rows = await scoped.resource.findMany();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenantId === A)).toBe(true);
      expect(rows.some((r) => r.tenantId === B)).toBe(false);
    });
  });

  it('cannot read another tenant row by id', async () => {
    await runWithTenant({ tenantId: A }, async () => {
      const row = await scoped.resource.findFirst({ where: { id: `res-${B}` } });
      expect(row).toBeNull();
    });
  });

  it('cannot update another tenant row', async () => {
    await runWithTenant({ tenantId: A }, async () => {
      const res = await scoped.resource.updateMany({
        where: { id: `res-${B}` },
        data: { name: 'HIJACKED' },
      });
      expect(res.count).toBe(0);
    });
    const victim = await prisma.resource.findUnique({ where: { id: `res-${B}` } });
    expect(victim?.name).toBe(`Room ${B}`);
  });

  it('create stamps the current tenant, ignoring a spoofed tenantId', async () => {
    await runWithTenant({ tenantId: A }, async () => {
      const created = await scoped.resource.create({
        data: {
          id: 'res-spoof',
          tenantId: B, // attempt to plant into tenant B
          type: 'DESK',
          name: 'Spoof',
        } as any,
      });
      expect(created.tenantId).toBe(A);
    });
    await prisma.resource.delete({ where: { id: 'res-spoof' } });
  });

  it('fails closed with no tenant in context', async () => {
    await expect(scoped.resource.findMany()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

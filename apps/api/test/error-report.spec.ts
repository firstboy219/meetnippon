/**
 * Client-side error reports: anyone signed in can submit one, only an admin
 * can read the full technical detail back. Live DB.
 */
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ErrorReportService } from '../src/error-report/error-report.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'err-tenant';
const EMP = 'err-emp';

const prisma = new PrismaService();
const svc = new ErrorReportService(prisma);

const asEmp = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: EMP, role: 'EMPLOYEE' }, fn);

async function wipe() {
  await prisma.errorReport.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Err Co', slug: 'err-co' } });
  await prisma.user.create({
    data: { id: EMP, tenantId: T, email: 'emp@err.co', fullName: 'Emp', role: 'EMPLOYEE' },
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(() => prisma.errorReport.deleteMany({ where: { tenantId: T } }));

describe('create()', () => {
  it('stores full technical detail and resolves the reporter from the token, not client input', async () => {
    await asEmp(() => svc.create({
      app: 'web-user',
      route: '/bookings',
      message: 'This booking has already ended.',
      status: 400,
      endpoint: '/bookings/abc123',
      method: 'PATCH',
      stack: 'ApiError: This booking has already ended.\n    at request (api.ts:80)',
      userAgent: 'Mozilla/5.0 (test)',
    } as any));

    const rows = await prisma.errorReport.findMany({ where: { tenantId: T } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      app: 'web-user', route: '/bookings', message: 'This booking has already ended.',
      status: 400, endpoint: '/bookings/abc123', method: 'PATCH',
      userId: EMP, userEmail: 'emp@err.co',
    });
    expect(rows[0].stack).toContain('api.ts:80');
  });

  it('never fails outright even with only the required fields', async () => {
    const res = await asEmp(() => svc.create({ app: 'web-admin', message: 'Network error.' } as any));
    expect(res).toEqual({ received: true });
  });
});

describe('list() / getOne()', () => {
  it('filters by app and by a message substring, newest first', async () => {
    await asEmp(() => svc.create({ app: 'web-user', message: 'First problem' } as any));
    await asEmp(() => svc.create({ app: 'web-admin', message: 'Second problem' } as any));
    await asEmp(() => svc.create({ app: 'web-user', message: 'Totally different' } as any));

    const webUserOnly = await asEmp(() => svc.list({ app: 'web-user' } as any));
    expect(webUserOnly.items.map((r: any) => r.message)).toEqual(['Totally different', 'First problem']);

    const bySearch = await asEmp(() => svc.list({ q: 'problem' } as any));
    expect(bySearch.items.map((r: any) => r.message).sort()).toEqual(['First problem', 'Second problem']);
  });

  it('getOne returns the full row; an unknown id 404s', async () => {
    await asEmp(() => svc.create({
      app: 'web-user', message: 'Detail check', stack: 'trace-line-1\ntrace-line-2',
    } as any));
    const [row] = (await asEmp(() => svc.list({} as any))).items;
    const full: any = await asEmp(() => svc.getOne(row.id));
    expect(full.stack).toBe('trace-line-1\ntrace-line-2');

    await expect(asEmp(() => svc.getOne('does-not-exist'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

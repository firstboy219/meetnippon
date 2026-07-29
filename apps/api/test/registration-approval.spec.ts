/**
 * Self-service sign-up from a company domain, and user deletion. Live DB.
 *
 * The rule being pinned: a verified email domain earns you a place in the
 * approval queue, never an account. Nothing that can sign in exists until an
 * admin says so.
 */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { NotificationService } from '../src/notification/notification.service';
import { MenuVisibilityService } from '../src/menu/menu-visibility.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service';
import { UserAdminService } from '../src/admin/user-admin.service';
import { PlanService } from '../src/billing/plan.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'reg-tenant';
const ADMIN = 'reg-admin';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const specMenuVisibility = new MenuVisibilityService(prisma, audit);
const mail = new TestMailService();
const config = new ConfigService({
  APP_BASE_URL: 'https://test.local',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
});
const flags = new FeatureFlagService(prisma, audit, config);
const notifications = new NotificationService(prisma, flags);
const resolver = new TenantResolverService(prisma, config);
const auth = new AuthService(prisma, new JwtService({}), config, audit, resolver, mail, notifications, specMenuVisibility);
const plan = new PlanService(prisma, flags);
const users = new UserAdminService(prisma, audit, plan, mail, config, auth);

const asAdmin = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: ADMIN, role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.registrationRequest.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.auditLog.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.resource.deleteMany({ where: { tenantId: T } });
  await prisma.tenantDomain.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Reg Co', slug: 'reg-co' } });
  await prisma.user.create({
    data: { id: ADMIN, tenantId: T, email: 'admin@reg.co', fullName: 'Admin', role: 'ADMIN' },
  });
  await prisma.tenantDomain.create({
    data: { tenantId: T, domain: 'reg-co.com', status: 'VERIFIED' },
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.registrationRequest.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T, id: { not: ADMIN } } });
  mail.reset();
});

describe('self-service sign-up', () => {
  it('parks a request for a verified domain — and creates nothing that can sign in', async () => {
    await auth.requestActivation('newbie@reg-co.com', 'reg-co');

    const reqs = await prisma.registrationRequest.findMany({ where: { tenantId: T } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].email).toBe('newbie@reg-co.com');
    expect(reqs[0].status).toBe('PENDING');

    // Crucially: no account yet.
    const user = await prisma.user.findFirst({ where: { tenantId: T, email: 'newbie@reg-co.com' } });
    expect(user).toBeNull();
    // ...and no activation link went out.
    expect(mail.sent).toHaveLength(0);
    // The admin is told there is something to look at.
    expect(await prisma.notification.count({ where: { tenantId: T, userId: ADMIN } })).toBe(1);
  });

  it('ignores an address outside the verified domains', async () => {
    await auth.requestActivation('stranger@gmail.com', 'reg-co');
    expect(await prisma.registrationRequest.count({ where: { tenantId: T } })).toBe(0);
    expect(await prisma.notification.count({ where: { tenantId: T } })).toBe(0);
  });

  it('does not stack duplicate requests, and a rejected address cannot re-queue', async () => {
    await auth.requestActivation('newbie@reg-co.com', 'reg-co');
    await auth.requestActivation('newbie@reg-co.com', 'reg-co');
    expect(await prisma.registrationRequest.count({ where: { tenantId: T } })).toBe(1);

    const req = await prisma.registrationRequest.findFirst({ where: { tenantId: T } });
    await asAdmin(() => users.rejectRegistration(req!.id, 'not staff'));

    await auth.requestActivation('newbie@reg-co.com', 'reg-co');
    const after = await prisma.registrationRequest.findMany({ where: { tenantId: T } });
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('REJECTED');
  });

  it('approving creates the account and emails the activation link', async () => {
    await auth.requestActivation('newbie@reg-co.com', 'reg-co');
    const req = await prisma.registrationRequest.findFirst({ where: { tenantId: T } });

    const created = await asAdmin(() => users.approveRegistration(req!.id, {
      fullName: 'New Bie', department: 'Finance', role: 'EMPLOYEE',
    } as any));

    expect(created.email).toBe('newbie@reg-co.com');
    const row = await prisma.user.findFirst({ where: { tenantId: T, email: 'newbie@reg-co.com' } });
    expect(row!.passwordHash).toBeNull();            // activation only
    expect(row!.activationTokenHash).toBeTruthy();
    expect(row!.department).toBe('Finance');
    expect(mail.recipients()).toEqual(['newbie@reg-co.com']);

    const done = await prisma.registrationRequest.findUnique({ where: { id: req!.id } });
    expect(done!.status).toBe('APPROVED');

    await expect(asAdmin(() => users.approveRegistration(req!.id, { fullName: 'Again' } as any)))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('user deletion', () => {
  it('deletes an account with no history', async () => {
    const u = await prisma.user.create({
      data: { tenantId: T, email: 'temp@reg-co.com', fullName: 'Temp' },
    });
    await asAdmin(() => users.remove(u.id));
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it('refuses to delete someone with bookings, and refuses self-deletion', async () => {
    const r = await prisma.resource.create({
      data: { tenantId: T, type: 'ROOM', name: 'Reg Room', status: 'ACTIVE' },
    });
    const u = await prisma.user.create({
      data: { tenantId: T, email: 'busy@reg-co.com', fullName: 'Busy' },
    });
    await prisma.booking.create({
      data: {
        tenantId: T, title: 'Has history', type: 'OFFLINE', resourceId: r.id,
        principalId: u.id, bookerId: u.id,
        startTime: new Date(Date.now() + 3600_000), endTime: new Date(Date.now() + 7200_000),
        status: 'APPROVED',
      },
    });

    await expect(asAdmin(() => users.remove(u.id))).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();

    await expect(asAdmin(() => users.remove(ADMIN))).rejects.toBeInstanceOf(BadRequestException);
  });
});

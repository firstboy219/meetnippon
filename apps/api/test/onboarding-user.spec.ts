/**
 * First-sign-in password gate + new-user onboarding state. Live DB.
 *
 * Two rules worth pinning: an admin-handed-over password forces a change and
 * the gate lifts only when the user sets their own; and "new user" means
 * "has never booked", not an age or a manual flag.
 */
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ProfileService } from '../src/profile/profile.service';
import { UserAdminService } from '../src/admin/user-admin.service';
import { PlanService } from '../src/billing/plan.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'ob-tenant';
const ADMIN = 'ob-admin';
const R = 'ob-room';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const mail = new TestMailService();
const config = new ConfigService({ APP_BASE_URL: 'https://test.local' });
const flags = new FeatureFlagService(prisma, audit);
const plan = new PlanService(prisma, flags);
const users = new UserAdminService(prisma, audit, plan, mail, config);
const profile = new ProfileService(prisma, audit, mail);

const asAdmin = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: ADMIN, role: 'ADMIN' }, fn);
const asUser = <X>(id: string, fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: id, role: 'EMPLOYEE' }, fn);

async function wipe() {
  await prisma.workLocationLog.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.resource.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'OB Co', slug: 'ob-co', timezone: 'UTC' } });
  await prisma.user.create({
    data: { id: ADMIN, tenantId: T, email: 'admin@ob.co', fullName: 'Admin', role: 'ADMIN' },
  });
  await prisma.resource.create({
    data: { id: R, tenantId: T, type: 'ROOM', name: 'OB Room', status: 'ACTIVE' },
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(() => { mail.reset(); });

describe('forced password change', () => {
  it('an admin-created account must change its password, and changing it lifts the gate', async () => {
    const created: any = await asAdmin(() => users.create({
      email: 'newbie@ob.co', fullName: 'Newbie',
    } as any));
    const temp: string = created.tempPassword;
    expect(temp).toBeTruthy(); // handed back for the admin to pass on

    const row = await prisma.user.findUnique({ where: { id: created.id } });
    expect(row!.mustChangePassword).toBe(true);

    await asUser(created.id, () => profile.changePassword({
      currentPassword: temp, newPassword: 'a-brand-new-secret',
    } as any));

    const after = await prisma.user.findUnique({ where: { id: created.id } });
    expect(after!.mustChangePassword).toBe(false);

    await prisma.user.delete({ where: { id: created.id } });
  });

  it('an admin password reset re-arms the gate', async () => {
    const created: any = await asAdmin(() => users.create({
      email: 'reset@ob.co', fullName: 'Reset Me', password: 'admin-chosen-1',
    } as any));
    // Clear it as if the user had already set their own.
    await prisma.user.update({ where: { id: created.id }, data: { mustChangePassword: false } });

    await asAdmin(() => users.resetPassword(created.id, { password: 'admin-reset-2' } as any));
    const after = await prisma.user.findUnique({ where: { id: created.id } });
    expect(after!.mustChangePassword).toBe(true);

    await prisma.user.delete({ where: { id: created.id } });
  });
});

describe('onboarding state', () => {
  it('treats someone with no bookings as new, and stops once they book', async () => {
    const u = await prisma.user.create({
      data: { id: 'ob-fresh', tenantId: T, email: 'fresh@ob.co', fullName: 'Fresh' },
    });

    let state = await asUser(u.id, () => profile.onboarding());
    expect(state.isNewUser).toBe(true);
    expect(state.bookings).toBe(0);
    expect(state.steps.firstBooking).toBe(false);
    expect(state.tourDone).toBe(false);

    // Completing the tour persists on the user, not the browser.
    await asUser(u.id, () => profile.completeOnboarding());
    state = await asUser(u.id, () => profile.onboarding());
    expect(state.tourDone).toBe(true);
    expect(state.isNewUser).toBe(true); // still new — no booking yet

    await prisma.booking.create({
      data: {
        tenantId: T, title: 'First one', type: 'OFFLINE', resourceId: R,
        principalId: u.id, bookerId: u.id,
        startTime: new Date(Date.now() + 3600_000),
        endTime: new Date(Date.now() + 7200_000),
        status: 'APPROVED',
      },
    });

    state = await asUser(u.id, () => profile.onboarding());
    expect(state.isNewUser).toBe(false); // guidance retires itself
    expect(state.steps.firstBooking).toBe(true);

    await prisma.booking.deleteMany({ where: { principalId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  });

  it('counts a booking made on the user\'s behalf, and tracks the other steps', async () => {
    const u = await prisma.user.create({
      data: { id: 'ob-deleg', tenantId: T, email: 'deleg@ob.co', fullName: 'Deleg', avatarUrl: '/u/x.png' },
    });
    await prisma.workLocationLog.create({
      data: { tenantId: T, userId: u.id, day: new Date('2026-07-24T00:00:00Z'), location: 'OFFICE' },
    });
    // Booked BY the admin FOR this user — still counts as having started.
    await prisma.booking.create({
      data: {
        tenantId: T, title: 'On behalf', type: 'OFFLINE', resourceId: R,
        principalId: u.id, bookerId: ADMIN,
        startTime: new Date(Date.now() + 3600_000),
        endTime: new Date(Date.now() + 7200_000),
        status: 'APPROVED',
      },
    });

    const state = await asUser(u.id, () => profile.onboarding());
    expect(state.isNewUser).toBe(false);
    expect(state.steps.profilePhoto).toBe(true);
    expect(state.steps.workLocation).toBe(true);

    await prisma.workLocationLog.deleteMany({ where: { userId: u.id } });
    await prisma.booking.deleteMany({ where: { principalId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  });
});

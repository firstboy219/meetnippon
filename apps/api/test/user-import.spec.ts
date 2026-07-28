/**
 * Bulk roster import + activation links. Live DB.
 *
 * The rules worth pinning: imported accounts carry NO password (so nothing
 * secret travels through a spreadsheet), a bad row does not abort the good
 * ones, activation is single-use, and the request endpoint cannot be used to
 * discover who has an account.
 */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { NotificationService } from '../src/notification/notification.service';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service';
import { UserAdminService } from '../src/admin/user-admin.service';
import { PlanService } from '../src/billing/plan.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';
import { verifyPassword } from '../src/auth/password.util';

const T = 'imp-tenant';
const ADMIN = 'imp-admin';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const mail = new TestMailService();
const config = new ConfigService({
  APP_BASE_URL: 'https://test.local',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
});
const jwt = new JwtService({});
const resolver = new TenantResolverService(prisma, config);
const flags = new FeatureFlagService(prisma, audit, config);
const specNotifications = new NotificationService(prisma, flags);
const auth = new AuthService(prisma, jwt, config, audit, resolver, mail, specNotifications);
const plan = new PlanService(prisma, flags);
const users = new UserAdminService(prisma, audit, plan, mail, config, auth);

const asAdmin = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: ADMIN, role: 'ADMIN' }, fn);

async function wipe() {
  await prisma.auditLog.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'Imp Co', slug: 'imp-co' } });
  await prisma.user.create({
    data: { id: ADMIN, tenantId: T, email: 'admin@imp.co', fullName: 'Admin', role: 'ADMIN' },
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.user.deleteMany({ where: { tenantId: T, id: { not: ADMIN } } });
  mail.reset();
});

describe('roster import', () => {
  it('creates passwordless accounts and emails each one an activation link', async () => {
    const res = await asAdmin(() => users.importUsers({
      rows: [
        { fullName: 'Budi Santoso', email: 'Budi@Imp.co', department: 'Marketing' },
        { fullName: 'Siti Rahayu', email: 'siti@imp.co', department: 'Produksi' },
      ],
    } as any));

    expect(res.created).toBe(2);
    expect(res.failed).toBe(0);

    const budi = await prisma.user.findFirst({ where: { tenantId: T, email: 'budi@imp.co' } });
    expect(budi).toBeTruthy();
    expect(budi!.passwordHash).toBeNull();          // nothing secret was minted
    expect(budi!.department).toBe('Marketing');
    expect(budi!.role).toBe('EMPLOYEE');
    expect(budi!.activationTokenHash).toBeTruthy(); // invite issued
    expect(mail.recipients().sort()).toEqual(['budi@imp.co', 'siti@imp.co']);
    // The raw token must be in the link, never the stored hash.
    const body = JSON.stringify(mail.sent);
    expect(body).not.toContain(budi!.activationTokenHash);
  });

  it('reports bad rows without discarding the good ones', async () => {
    await prisma.user.create({
      data: { tenantId: T, email: 'taken@imp.co', fullName: 'Already Here' },
    });
    const res = await asAdmin(() => users.importUsers({
      rows: [
        { fullName: 'Good One', email: 'good@imp.co' },
        { fullName: 'Bad Email', email: 'not-an-email' },
        { fullName: '', email: 'noname@imp.co' },
        { fullName: 'Dup In File', email: 'good@imp.co' },
        { fullName: 'Existing', email: 'taken@imp.co' },
      ],
    } as any));

    expect(res.created).toBe(1);
    expect(res.failed).toBe(4);
    const reasons = res.errors.map((e) => e.reason).join(' | ');
    expect(reasons).toMatch(/valid email/i);
    expect(reasons).toMatch(/Name is empty/i);
    expect(reasons).toMatch(/Duplicated within this file/i);
    expect(reasons).toMatch(/already exists/i);
    expect(res.errors[0].row).toBe(2); // 1-based, points at the offending line
  });

  it('can stage accounts without sending invites', async () => {
    const res = await asAdmin(() => users.importUsers({
      rows: [{ fullName: 'Quiet One', email: 'quiet@imp.co' }],
      sendInvites: false,
    } as any));
    expect(res.created).toBe(1);
    expect(mail.sent).toHaveLength(0);
  });
});

describe('activation', () => {
  async function importOne() {
    await asAdmin(() => users.importUsers({
      rows: [{ fullName: 'Budi Santoso', email: 'budi@imp.co' }],
    } as any));
    // Pull the raw token out of the emailed link.
    const link = JSON.stringify(mail.sent).match(/activate\?token=([A-Za-z0-9_-]+)/);
    return link![1];
  }

  it('sets the first password, signs the user in, and cannot be reused', async () => {
    const token = await importOne();
    const session = await auth.completeActivation(token, 'my-own-secret-1');
    expect(session.accessToken).toBeTruthy();
    expect(session.user.email).toBe('budi@imp.co');

    const after = await prisma.user.findFirst({ where: { tenantId: T, email: 'budi@imp.co' } });
    expect(await verifyPassword(after!.passwordHash!, 'my-own-secret-1')).toBe(true);
    // Their own password from the start — no forced-change screen.
    expect(after!.mustChangePassword).toBe(false);
    expect(after!.activationTokenHash).toBeNull();

    await expect(auth.completeActivation(token, 'another-one-99'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an expired link', async () => {
    const token = await importOne();
    await prisma.user.updateMany({
      where: { tenantId: T, email: 'budi@imp.co' },
      data: { activationExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(auth.completeActivation(token, 'my-own-secret-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('never reveals whether an address exists, and will not reset a real password', async () => {
    // Unknown address: silently does nothing, no mail, no error.
    await auth.requestActivation('nobody@imp.co', 'imp-co');
    expect(mail.sent).toHaveLength(0);

    // An account that already has a password must not be resettable this way.
    await prisma.user.create({
      data: { tenantId: T, email: 'has-pw@imp.co', fullName: 'Has Pw', passwordHash: 'x' },
    });
    await auth.requestActivation('has-pw@imp.co', 'imp-co');
    expect(mail.sent).toHaveLength(0);

    // A genuinely pending account does get one.
    await asAdmin(() => users.importUsers({
      rows: [{ fullName: 'Pending', email: 'pending@imp.co' }], sendInvites: false,
    } as any));
    await auth.requestActivation('pending@imp.co', 'imp-co');
    expect(mail.recipients()).toEqual(['pending@imp.co']);
  });
});

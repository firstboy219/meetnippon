/**
 * Admin bulk email: resend activation to whoever hasn't set a password yet,
 * and a free-form announcement to a chosen slice of the roster. Live DB.
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
import { BroadcastService } from '../src/broadcast/broadcast.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'bc-tenant';
const ADMIN = 'bc-admin';

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
const menuVisibility = new MenuVisibilityService(prisma, audit);
const resolver = new TenantResolverService(prisma, config);
const auth = new AuthService(prisma, new JwtService({}), config, audit, resolver, mail, notifications, menuVisibility);
const broadcast = new BroadcastService(prisma, audit, mail, auth);

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
  await prisma.tenant.create({ data: { id: T, name: 'Blast Co', slug: 'blast-co' } });
  await prisma.user.createMany({
    data: [
      { id: ADMIN, tenantId: T, email: 'admin@blast.co', fullName: 'Admin', role: 'ADMIN', passwordHash: 'x' },
      { id: 'bc-pending-1', tenantId: T, email: 'pending1@blast.co', fullName: 'Pending One', role: 'EMPLOYEE', passwordHash: null },
      { id: 'bc-pending-2', tenantId: T, email: 'pending2@blast.co', fullName: 'Pending Two', role: 'EMPLOYEE', passwordHash: null },
      { id: 'bc-active-1', tenantId: T, email: 'active1@blast.co', fullName: 'Active One', role: 'EMPLOYEE', passwordHash: 'x' },
      { id: 'bc-approver-1', tenantId: T, email: 'appr1@blast.co', fullName: 'Approver One', role: 'APPROVER', passwordHash: 'x' },
      { id: 'bc-inactive-1', tenantId: T, email: 'inactive1@blast.co', fullName: 'Inactive One', role: 'EMPLOYEE', passwordHash: null, isActive: false },
      // Admin-created (or admin-reset), never signed in and changed it —
      // has a real passwordHash, but it is the generic one, not theirs.
      { id: 'bc-generic-1', tenantId: T, email: 'generic1@blast.co', fullName: 'Generic One', role: 'EMPLOYEE', passwordHash: 'temp-hash', mustChangePassword: true },
    ] as any,
  });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(() => mail.reset());

describe('recipients()', () => {
  it('filters by role, active status, and password state, with a derived hasPassword flag', async () => {
    const employees = await asAdmin(() => broadcast.recipients({ role: 'EMPLOYEE' } as any));
    expect(employees.items.map((u) => u.email).sort()).toEqual([
      'active1@blast.co', 'generic1@blast.co', 'inactive1@blast.co', 'pending1@blast.co', 'pending2@blast.co',
    ]);

    // "Not activated" is two different DB states: no password at all, or a
    // password that exists but is still the admin-set generic one.
    const pendingOnly = await asAdmin(() => broadcast.recipients({ hasPassword: 'false' } as any));
    expect(pendingOnly.items.map((u) => u.email).sort()).toEqual([
      'generic1@blast.co', 'inactive1@blast.co', 'pending1@blast.co', 'pending2@blast.co',
    ]);
    // The hash itself never leaves the service.
    expect((pendingOnly.items[0] as any).passwordHash).toBeUndefined();
    expect(pendingOnly.items.every((u) => u.hasPassword === false)).toBe(true);

    // The reverse filter correctly excludes the generic-password account too.
    const activatedOnly = await asAdmin(() => broadcast.recipients({ hasPassword: 'true' } as any));
    expect(activatedOnly.items.map((u) => u.email)).not.toContain('generic1@blast.co');

    const activeOnly = await asAdmin(() => broadcast.recipients({ isActive: 'true' } as any));
    expect(activeOnly.items.map((u) => u.email)).not.toContain('inactive1@blast.co');
  });
});

describe('resendActivation()', () => {
  it('SELECTED: only actually emails the ones not yet activated, even if others were included', async () => {
    const res = await asAdmin(() => broadcast.resendActivation({
      mode: 'SELECTED',
      // active1 and admin have their own password; generic1 has a password
      // too, but it is the admin-set one — still counts as not activated.
      userIds: ['bc-pending-1', 'bc-active-1', 'bc-admin', 'bc-generic-1'],
    } as any));
    expect(res.sent).toBe(2);
    expect(mail.recipients().sort()).toEqual(['generic1@blast.co', 'pending1@blast.co']);
  });

  it('ALL_MATCHING: targets everyone not yet activated matching the filter, ignoring an explicit hasPassword override', async () => {
    const res = await asAdmin(() => broadcast.resendActivation({
      mode: 'ALL_MATCHING',
      // hasPassword: 'true' would (wrongly) ask for already-activated users —
      // forced to false regardless. No isActive filter, so the deactivated
      // employee with no password is included too — the filter only narrows
      // by role and password state here, nothing else.
      filter: { role: 'EMPLOYEE', hasPassword: 'true' },
    } as any));
    expect(res.sent).toBe(4);
    expect(mail.recipients().sort()).toEqual([
      'generic1@blast.co', 'inactive1@blast.co', 'pending1@blast.co', 'pending2@blast.co',
    ]);

    const log = await prisma.auditLog.findFirst({
      where: { tenantId: T, action: 'broadcast.activation_resend' }, orderBy: { createdAt: 'desc' },
    });
    expect((log?.metadata as any)?.count).toBe(4);
  });

  it('SELECTED with no ids refuses rather than silently sending nothing', async () => {
    await expect(asAdmin(() => broadcast.resendActivation({ mode: 'SELECTED', userIds: [] } as any)))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('sendAnnouncement()', () => {
  it('emails each recipient individually with sanitized rich HTML, never one message with everyone in "to"', async () => {
    const res = await asAdmin(() => broadcast.sendAnnouncement({
      mode: 'ALL_MATCHING',
      filter: { role: 'EMPLOYEE', isActive: 'true' },
      subject: 'Office closed Friday',
      messageHtml: '<p>We\'re closed <strong>this Friday</strong>.</p><script>alert(1)</script><p>See you Monday!</p>',
    } as any));
    expect(res.sent).toBe(4); // active1, generic1, pending1, pending2 — inactive1 excluded by isActive filter
    expect(mail.sent).toHaveLength(4);
    // One recipient per message, not a shared "to" array.
    for (const m of mail.sent) {
      const to = Array.isArray(m.to) ? m.to : [m.to];
      expect(to).toHaveLength(1);
    }
    expect(mail.sent[0].subject).toBe('Office closed Friday');
    // Formatting survives, the injected script does not.
    expect(mail.sent[0].bodyHtml).toContain('<strong>this Friday</strong>');
    expect(mail.sent[0].bodyHtml).not.toContain('<script');
    // A plain-text fallback is derived for non-HTML mail clients.
    expect(mail.sent[0].text).toContain('this Friday');
    expect(mail.sent[0].text).toContain('See you Monday!');
    expect(mail.sent[0].text).not.toContain('<');

    const log = await prisma.auditLog.findFirst({
      where: { tenantId: T, action: 'broadcast.announcement_sent' }, orderBy: { createdAt: 'desc' },
    });
    expect((log?.metadata as any)?.count).toBe(4);
    expect((log?.metadata as any)?.subject).toBe('Office closed Friday');
  });
});

describe('previewAnnouncement()', () => {
  it('renders the exact email without sending it, filing a report, or needing any recipients', async () => {
    const before = mail.sent.length;
    const res = await asAdmin(() => broadcast.previewAnnouncement({
      subject: 'Preview me',
      messageHtml: '<p>Hello <em>world</em></p>',
    } as any));
    expect(res.html).toContain('Preview me');
    expect(res.html).toContain('<em>world</em>');
    // Nothing was actually sent.
    expect(mail.sent.length).toBe(before);
  });

  it('strips disallowed markup the same way a real send would', async () => {
    const res = await asAdmin(() => broadcast.previewAnnouncement({
      subject: 'x',
      messageHtml: '<p onclick="evil()">safe</p><img src=x onerror=alert(1)>',
    } as any));
    expect(res.html).toContain('safe');
    expect(res.html).not.toContain('onclick');
    expect(res.html).not.toContain('<img');
  });
});

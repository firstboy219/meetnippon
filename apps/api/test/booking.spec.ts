/**
 * Booking core integration tests (BRD 7.4) — require a live database.
 * Covers conflict detection, the approval flow, policy rejection, and that
 * bookings never leak across tenants. Run inside the compose network.
 */
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { PolicyResolverService } from '../src/booking/policy/policy-resolver.service';
import { BookingService } from '../src/booking/booking.service';
import { ApprovalService } from '../src/booking/approval.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { CalendarService } from '../src/calendar/calendar.service';
import { NotificationService } from '../src/notification/notification.service';
import { ConfigService } from '@nestjs/config';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const A = 'bk-tA';
const B = 'bk-tB';
const EMP = 'bk-emp';
const APPR = 'bk-appr';
const EMP_B = 'bk-empB';

const prisma = new PrismaService();
const resolver = new PolicyResolverService(prisma);
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const calendar = new CalendarService(prisma, flags);
const notifications = new NotificationService(prisma, flags);
const mail = new TestMailService();
const config = new ConfigService({ APP_BASE_URL: 'https://test.local' });
const booking = new BookingService(prisma, audit, resolver, calendar, notifications, mail, config);
const approvals = new ApprovalService(prisma, audit, mail, notifications, config);

// two days out, avoids min-advance and past-time issues
const D = new Date(Date.now() + 2 * 86400000);
const at = (h: number, m = 0) =>
  new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), h, m, 0));
const iso = (d: Date) => d.toISOString();

const asEmp = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: A, userId: EMP, role: 'EMPLOYEE' }, fn);
const asApprover = <T>(fn: () => Promise<T>) =>
  runWithTenant({ tenantId: A, userId: APPR, role: 'APPROVER' }, fn);

async function wipe() {
  await prisma.notification.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.approvalStep.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.booking.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.bookingPolicy.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.resource.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: [A, B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  for (const id of [A, B]) {
    await prisma.tenant.create({ data: { id, name: id, slug: id } });
  }
  await prisma.user.createMany({
    data: [
      { id: EMP, tenantId: A, email: 'emp@a.co', fullName: 'Emp A', role: 'EMPLOYEE' },
      { id: APPR, tenantId: A, email: 'appr@a.co', fullName: 'Appr A', role: 'APPROVER' },
      { id: EMP_B, tenantId: B, email: 'emp@b.co', fullName: 'Emp B', role: 'EMPLOYEE' },
    ],
  });
  await prisma.resource.createMany({
    data: [
      { id: 'roomA1', tenantId: A, type: 'ROOM', name: 'A1', category: 'VIP', status: 'ACTIVE' },
      { id: 'roomA2', tenantId: A, type: 'ROOM', name: 'A2', status: 'ACTIVE' },
      { id: 'roomA3', tenantId: A, type: 'ROOM', name: 'A3', status: 'ACTIVE' },
      { id: 'roomB1', tenantId: B, type: 'ROOM', name: 'B1', status: 'ACTIVE' },
    ],
  });
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe('booking core', () => {
  it('auto-approves when no policy requires approval', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'M1', resourceId: 'roomA1', startTime: iso(at(10)), endTime: iso(at(11)) }),
    );
    expect(b.status).toBe('APPROVED');
    expect(b.resourceId).toBe('roomA1');
    expect(b.bookerId).toBe(EMP);
  });

  it('rejects a conflicting overlapping slot', async () => {
    await expect(
      asEmp(() =>
        booking.create({ title: 'M-clash', resourceId: 'roomA1', startTime: iso(at(10, 30)), endTime: iso(at(11, 30)) }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an adjacent non-overlapping slot', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'M2', resourceId: 'roomA1', startTime: iso(at(11)), endTime: iso(at(12)) }),
    );
    expect(b.status).toBe('APPROVED');
  });

  it('reports busy slots via availability', async () => {
    const avail: any = await asEmp(() =>
      booking.availability({ resourceId: 'roomA1', from: iso(at(9)), to: iso(at(13)) }),
    );
    expect(avail.busy.length).toBeGreaterThanOrEqual(2);
  });

  it('requires approval when policy demands it, then approves end-to-end', async () => {
    await asEmp(async () => {
      // ROOM-scoped policy: approval required on roomA2
      await prisma.scoped.bookingPolicy.create({
        data: { scope: 'ROOM', resourceId: 'roomA2', rules: { requiresApproval: true } } as any,
      });
    });

    const b: any = await asEmp(() =>
      booking.create({ title: 'NeedsOK', resourceId: 'roomA2', startTime: iso(at(14)), endTime: iso(at(15)) }),
    );
    expect(b.status).toBe('PENDING');

    const step = await prisma.approvalStep.findFirst({ where: { bookingId: b.id } });
    expect(step).not.toBeNull();

    const res: any = await asApprover(() => approvals.decide(step!.id, 'APPROVED'));
    expect(res.bookingStatus).toBe('APPROVED');

    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.status).toBe('APPROVED');
  });

  it('rejects a booking that violates a policy (max duration)', async () => {
    await asEmp(async () => {
      await prisma.scoped.bookingPolicy.create({
        data: { scope: 'ROOM', resourceId: 'roomA3', rules: { maxDurationMinutes: 30 } } as any,
      });
    });
    await expect(
      asEmp(() =>
        booking.create({ title: 'TooLong', resourceId: 'roomA3', startTime: iso(at(9)), endTime: iso(at(11)) }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets the owner edit title and move to a free slot', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Edit me', resourceId: 'roomA1', startTime: iso(at(16)), endTime: iso(at(17)) }),
    );
    const renamed: any = await asEmp(() => booking.update(b.id, { title: 'Renamed' }));
    expect(renamed.title).toBe('Renamed');
    // times untouched when only the title is sent
    expect(new Date(renamed.startTime).getTime()).toBe(at(16).getTime());

    const moved: any = await asEmp(() =>
      booking.update(b.id, { startTime: iso(at(18)), endTime: iso(at(19)) }),
    );
    expect(new Date(moved.startTime).getTime()).toBe(at(18).getTime());
  });

  it('does not treat a booking as conflicting with itself', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Self', resourceId: 'roomA1', startTime: iso(at(20)), endTime: iso(at(21)) }),
    );
    // same slot, only the title changes — the row must not block its own edit
    const same: any = await asEmp(() =>
      booking.update(b.id, { title: 'Self v2', startTime: iso(at(20)), endTime: iso(at(21)) }),
    );
    expect(same.title).toBe('Self v2');
  });

  it('rejects a move onto another booking', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Mover', resourceId: 'roomA1', startTime: iso(at(22)), endTime: iso(at(23)) }),
    );
    // 20:00-21:00 on roomA1 is taken by the previous test
    await expect(
      asEmp(() => booking.update(b.id, { startTime: iso(at(20)), endTime: iso(at(21)) })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a half-specified time change', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Half', resourceId: 'roomA2', startTime: iso(at(6)), endTime: iso(at(7)) }),
    );
    await expect(
      asEmp(() => booking.update(b.id, { startTime: iso(at(8)) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets only the owner or an admin edit', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Mine', resourceId: 'roomA1', startTime: iso(at(3)), endTime: iso(at(4)) }),
    );
    // an approver in the same tenant is still a stranger to this booking
    await expect(
      asApprover(() => booking.update(b.id, { title: 'Hijacked' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const asAdmin = <T>(fn: () => Promise<T>) =>
      runWithTenant({ tenantId: A, userId: 'bk-admin', role: 'ADMIN' }, fn);
    const fixed: any = await asAdmin(() => booking.update(b.id, { title: 'Admin fixed' }));
    expect(fixed.title).toBe('Admin fixed');
  });

  it('will not edit a cancelled booking', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Doomed', resourceId: 'roomA1', startTime: iso(at(2)), endTime: iso(at(3)) }),
    );
    await asEmp(() => booking.cancel(b.id));
    await expect(
      asEmp(() => booking.update(b.id, { title: 'Zombie' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends an approved booking back through approval when its time moves', async () => {
    // roomA2 requires approval (policy created earlier in this file)
    const b: any = await asEmp(() =>
      booking.create({ title: 'Reappr', resourceId: 'roomA2', startTime: iso(at(19)), endTime: iso(at(20)) }),
    );
    expect(b.status).toBe('PENDING');
    const step = await prisma.approvalStep.findFirst({ where: { bookingId: b.id } });
    await asApprover(() => approvals.decide(step!.id, 'APPROVED'));
    const approved = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(approved!.status).toBe('APPROVED');

    const moved: any = await asEmp(() =>
      booking.update(b.id, { startTime: iso(at(21)), endTime: iso(at(22)) }),
    );
    expect(moved.status).toBe('PENDING');
    const steps = await prisma.approvalStep.findMany({ where: { bookingId: b.id } });
    expect(steps.every((s) => s.decision === 'PENDING')).toBe(true);
  });

  it('notifies colleagues in-app and emails everyone on the list', async () => {
    await prisma.notification.deleteMany({ where: { tenantId: A } });
    mail.reset();
    const b: any = await asEmp(() =>
      booking.create({
        title: 'Standup',
        resourceId: 'roomA1',
        startTime: iso(at(1)),
        endTime: iso(at(2)),
        participants: [
          { email: 'appr@a.co' },            // a colleague — reachable in-app
          { email: 'emp@a.co' },             // the organiser — not notified
          { email: 'outsider@vendor.com', external: true }, // no in-app inbox
        ],
      }),
    );
    // one colleague reached in-app; both non-organiser addresses get email
    expect(b.invites).toEqual({ notified: 1, emailQueued: 2 });
    expect(mail.recipients().sort()).toEqual(['appr@a.co', 'outsider@vendor.com']);
    expect(mail.sent[0].subject).toContain('Standup');
    // the organiser is not mailed about their own booking
    expect(mail.recipients()).not.toContain('emp@a.co');

    const notes = await prisma.notification.findMany({ where: { tenantId: A } });
    expect(notes).toHaveLength(1);
    expect(notes[0].userId).toBe(APPR);
    expect(notes[0].title).toContain('Standup');

    // rescheduling tells them again
    await prisma.notification.deleteMany({ where: { tenantId: A } });
    mail.reset();
    const moved: any = await asEmp(() =>
      booking.update(b.id, { startTime: iso(at(4, 30)), endTime: iso(at(5, 30)) }),
    );
    expect(moved.invites.notified).toBe(1);
    const after = await prisma.notification.findMany({ where: { tenantId: A } });
    expect(after[0].title).toContain('rescheduled');
    expect(mail.sent[0].subject).toContain('Rescheduled');
    // the new time, on the tenant clock, must appear in the body
    expect(mail.sent[0].text).toMatch(/When:/);
  });

  it('sends nothing at all when notify is false', async () => {
    mail.reset();
    await prisma.notification.deleteMany({ where: { tenantId: A } });
    await asEmp(() =>
      booking.create({
        title: 'Silent', resourceId: 'roomA1',
        startTime: iso(at(23, 10)), endTime: iso(at(23, 40)),
        notify: false,
        participants: [{ email: 'appr@a.co' }, { email: 'outsider@vendor.com', external: true }],
      }),
    );
    expect(mail.sent).toHaveLength(0);
    expect(await prisma.notification.count({ where: { tenantId: A } })).toBe(0);
  });

  it('emails the requester when an approval is decided', async () => {
    const b: any = await asEmp(() =>
      booking.create({ title: 'Decide me', resourceId: 'roomA2', startTime: iso(at(15)), endTime: iso(at(16)) }),
    );
    expect(b.status).toBe('PENDING');
    mail.reset();
    const step = await prisma.approvalStep.findFirst({ where: { bookingId: b.id, decision: 'PENDING' } });
    await asApprover(() => approvals.decide(step!.id, 'REJECTED', 'Room is reserved for the board'));

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe('emp@a.co');
    expect(mail.sent[0].subject).toContain('Rejected');
    expect(mail.sent[0].text).toContain('Room is reserved for the board');
  });

  it('does not notify or email when only the title changes', async () => {
    const b: any = await asEmp(() =>
      booking.create({
        title: 'Quiet', resourceId: 'roomA1',
        startTime: iso(at(7)), endTime: iso(at(8)),
        participants: [{ email: 'appr@a.co' }],
      }),
    );
    await prisma.notification.deleteMany({ where: { tenantId: A } });
    mail.reset();
    await asEmp(() => booking.update(b.id, { title: 'Quiet v2' }));
    expect(await prisma.notification.count({ where: { tenantId: A } })).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it('does not leak bookings across tenants', async () => {
    const bInB: any = await runWithTenant(
      { tenantId: B, userId: EMP_B, role: 'EMPLOYEE' },
      () => booking.create({ title: 'B-only', resourceId: 'roomB1', startTime: iso(at(10)), endTime: iso(at(11)) }),
    );
    // tenant A cannot read tenant B's booking
    await expect(asEmp(() => booking.getOne(bInB.id))).rejects.toBeInstanceOf(NotFoundException);
    // tenant A cannot query availability on tenant B's resource
    await expect(
      asEmp(() => booking.availability({ resourceId: 'roomB1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
    // nor edit it
    await expect(
      asEmp(() => booking.update(bInB.id, { title: 'Stolen' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

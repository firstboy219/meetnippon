/**
 * Booking core integration tests (BRD 7.4) — require a live database.
 * Covers conflict detection, the approval flow, policy rejection, and that
 * bookings never leak across tenants. Run inside the compose network.
 */
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { PolicyResolverService } from '../src/booking/policy/policy-resolver.service';
import { BookingService } from '../src/booking/booking.service';
import { ApprovalService } from '../src/booking/approval.service';
import { runWithTenant } from '../src/tenant/tenant-context';

const A = 'bk-tA';
const B = 'bk-tB';
const EMP = 'bk-emp';
const APPR = 'bk-appr';
const EMP_B = 'bk-empB';

const prisma = new PrismaService();
const resolver = new PolicyResolverService(prisma);
const audit = new AuditService(prisma);
const booking = new BookingService(prisma, audit, resolver);
const approvals = new ApprovalService(prisma, audit);

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
  });
});

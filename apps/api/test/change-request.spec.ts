/**
 * Booking change requests (tester feedback #4). Live DB.
 *
 * The invariant: the requester never changes the calendar. Only the author's
 * approval applies the move, and the applied move goes through the same
 * conflict gate as a direct edit.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { FeatureFlagService } from '../src/flags/feature-flag.service';
import { NotificationService } from '../src/notification/notification.service';
import { CalendarService } from '../src/calendar/calendar.service';
import { PolicyResolverService } from '../src/booking/policy/policy-resolver.service';
import { BookingService } from '../src/booking/booking.service';
import { ChangeRequestService } from '../src/booking/change-request.service';
import { TestMailService } from './helpers/test-mail';
import { runWithTenant } from '../src/tenant/tenant-context';

const T = 'cr-tenant';
const OWNER = 'cr-owner';
const PEER = 'cr-peer';
const R = 'cr-room';

const prisma = new PrismaService();
const audit = new AuditService(prisma);
const flags = new FeatureFlagService(prisma, audit);
const notifications = new NotificationService(prisma, flags);
const calendar = new CalendarService(prisma, flags);
const mail = new TestMailService();
const config = new ConfigService({ APP_BASE_URL: 'https://test.local' });
const resolver = new PolicyResolverService(prisma);
const bookings = new BookingService(prisma, audit, resolver, calendar, notifications, mail, config);
const changes = new ChangeRequestService(prisma, audit, notifications, mail, bookings, config);

const asOwner = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: OWNER, role: 'EMPLOYEE' }, fn);
const asPeer = <X>(fn: () => Promise<X>) =>
  runWithTenant({ tenantId: T, userId: PEER, role: 'EMPLOYEE' }, fn);

// two days out — clear of min-advance and past-time rules
const D = new Date(Date.now() + 2 * 86400000);
const at = (h: number) =>
  new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), D.getUTCDate(), h, 0, 0));

async function wipe() {
  await prisma.bookingChangeRequest.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  await prisma.resource.deleteMany({ where: { tenantId: T } });
  await prisma.user.deleteMany({ where: { tenantId: T } });
  await prisma.tenant.deleteMany({ where: { id: T } });
}

beforeAll(async () => {
  await prisma.$connect();
  await wipe();
  await prisma.tenant.create({ data: { id: T, name: 'CR Co', slug: 'cr-co', timezone: 'Asia/Jakarta' } });
  await prisma.user.createMany({
    data: [
      { id: OWNER, tenantId: T, email: 'owner@cr.co', fullName: 'Owner' },
      { id: PEER, tenantId: T, email: 'peer@cr.co', fullName: 'Peer' },
    ],
  });
  await prisma.resource.create({ data: { id: R, tenantId: T, type: 'ROOM', name: 'CR Room', status: 'ACTIVE' } });
});
afterAll(async () => { await wipe(); await prisma.$disconnect(); });
beforeEach(async () => {
  await prisma.bookingChangeRequest.deleteMany({ where: { tenantId: T } });
  await prisma.notification.deleteMany({ where: { tenantId: T } });
  await prisma.booking.deleteMany({ where: { tenantId: T } });
  mail.reset();
});

const makeBooking = () => asOwner(() => bookings.create({
  title: 'Owner sync', resourceId: R,
  startTime: at(2).toISOString(), endTime: at(3).toISOString(),
} as any));

describe('change requests', () => {
  it('peer requests, owner approves, the time actually moves', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, {
      proposedStartTime: at(5).toISOString(),
      proposedEndTime: at(6).toISOString(),
      note: 'client call clash',
    }));
    expect(req.status).toBe('PENDING');

    // Nothing changed yet — the requester holds no power over the calendar.
    let current = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(current!.startTime.getTime()).toBe(at(2).getTime());

    // The owner was told, in-app and by mail.
    expect(await prisma.notification.count({ where: { tenantId: T, userId: OWNER } })).toBe(1);
    expect(mail.recipients()).toContain('owner@cr.co');

    await asOwner(() => changes.decide(req.id, 'APPROVED'));
    current = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(current!.startTime.getTime()).toBe(at(5).getTime());
    expect(current!.endTime.getTime()).toBe(at(6).getTime());

    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('APPROVED');
    // The requester hears the outcome.
    expect(await prisma.notification.count({ where: { tenantId: T, userId: PEER } })).toBe(1);
  });

  it('reject leaves the booking untouched', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { note: 'please move it' }));
    await asOwner(() => changes.decide(req.id, 'REJECTED', 'no can do'));

    const current = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(current!.startTime.getTime()).toBe(at(2).getTime());
    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('REJECTED');
    expect(after!.decisionNote).toBe('no can do');
  });

  it('only the author can decide', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { note: 'move?' }));
    await expect(asPeer(() => changes.decide(req.id, 'APPROVED')))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the owner is told to edit directly instead of requesting', async () => {
    const b = await makeBooking();
    await expect(asOwner(() => changes.create(b.id, { note: 'move my own' })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('one open request per requester per booking', async () => {
    const b = await makeBooking();
    await asPeer(() => changes.create(b.id, { note: 'first' }));
    await expect(asPeer(() => changes.create(b.id, { note: 'second' })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('an approval that no longer fits fails loudly and stays pending', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, {
      proposedStartTime: at(5).toISOString(),
      proposedEndTime: at(6).toISOString(),
    }));
    // A booking has since landed on the proposed slot.
    await asPeer(() => bookings.create({
      title: 'Peer meeting', resourceId: R,
      startTime: at(5).toISOString(), endTime: at(6).toISOString(),
    } as any));

    await expect(asOwner(() => changes.decide(req.id, 'APPROVED'))).rejects.toThrow();
    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('PENDING'); // not marked approved-with-nothing-applied
  });

  it('extending a meeting already in progress is allowed for the owner', async () => {
    // Created directly: the service refuses to *create* in the past, which is
    // exactly why the update path has a separate in-progress rule to test.
    const started = await prisma.booking.create({
      data: {
        tenantId: T, title: 'Running now', type: 'OFFLINE', resourceId: R,
        principalId: OWNER, bookerId: OWNER,
        startTime: new Date(Date.now() - 30 * 60000),
        endTime: new Date(Date.now() + 30 * 60000),
        status: 'APPROVED',
      },
    });
    const newEnd = new Date(Date.now() + 90 * 60000);
    const updated = await asOwner(() => bookings.update(started.id, {
      startTime: started.startTime.toISOString(),
      endTime: newEnd.toISOString(),
    } as any));
    expect(new Date(updated.endTime).getTime()).toBe(newEnd.getTime());

    // But moving its start remains impossible.
    await expect(asOwner(() => bookings.update(started.id, {
      startTime: new Date(Date.now() + 10 * 60000).toISOString(),
      endTime: newEnd.toISOString(),
    } as any))).rejects.toBeInstanceOf(BadRequestException);
  });
});

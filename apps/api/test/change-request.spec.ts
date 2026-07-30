/**
 * Booking change requests (tester feedback #4, extended): a colleague asks
 * for a slice of someone else's booking. Live DB.
 *
 * The invariant: nothing is booked for either side until the author decides.
 * Approving requires the author to pick their own new time (the granted
 * slice is off the table); the requester's full wanted meeting is then
 * created. Rejecting auto-books the requester at the fallback range — their
 * wanted range with the granted slice trimmed off.
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

// Owner: 2 hours, at(2)-at(4).
const makeBooking = () => asOwner(() => bookings.create({
  title: 'Owner sync', resourceId: R,
  startTime: at(2).toISOString(), endTime: at(4).toISOString(),
} as any));

// Peer wants at(3)-at(6); the busy overlap [at(3),at(4)] touches the START
// of that wanted range — the BRD's own worked example, hours shifted.
const wantedDraft = { title: 'Peer sync', startTime: at(3).toISOString(), endTime: at(6).toISOString() };
const carveOut = { requestedStartTime: at(3).toISOString(), requestedEndTime: at(4).toISOString() };

describe('change requests', () => {
  it('peer requests part of a booking; nothing is booked for either side yet', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft, note: 'need the back half' }));
    expect(req.status).toBe('PENDING');

    const current = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(current!.startTime.getTime()).toBe(at(2).getTime());
    expect(await prisma.booking.count({ where: { tenantId: T, principalId: PEER } })).toBe(0);

    expect(await prisma.notification.count({ where: { tenantId: T, userId: OWNER } })).toBe(1);
    expect(mail.recipients()).toContain('owner@cr.co');
  });

  it('approve: owner picks a new time, then their move and the requester\'s meeting both land', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));

    await asOwner(() => changes.decide(req.id, 'APPROVED', undefined, at(7).toISOString(), at(8).toISOString()));

    const owner = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(owner!.startTime.getTime()).toBe(at(7).getTime());
    expect(owner!.endTime.getTime()).toBe(at(8).getTime());

    const peerBooking = await prisma.booking.findFirst({ where: { tenantId: T, principalId: PEER } });
    expect(peerBooking).toBeTruthy();
    expect(peerBooking!.startTime.getTime()).toBe(at(3).getTime());
    expect(peerBooking!.endTime.getTime()).toBe(at(6).getTime());

    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('APPROVED');
    expect(await prisma.notification.count({ where: { tenantId: T, userId: PEER } })).toBe(1);
  });

  it('approve requires a new owner time', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));
    await expect(asOwner(() => changes.decide(req.id, 'APPROVED')))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('owner cannot re-pick a time overlapping what they just granted', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));

    await expect(asOwner(() => changes.decide(req.id, 'APPROVED', undefined, at(3).toISOString(), at(4).toISOString())))
      .rejects.toBeInstanceOf(BadRequestException);

    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('PENDING');
    const current = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(current!.startTime.getTime()).toBe(at(2).getTime()); // untouched
  });

  it('reject books the requester automatically at the fallback range', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));
    await asOwner(() => changes.decide(req.id, 'REJECTED', 'keeping my slot'));

    const owner = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(owner!.startTime.getTime()).toBe(at(2).getTime()); // untouched

    // Wanted at(3)-at(6) minus the granted at(3)-at(4) leaves at(4)-at(6).
    const peerBooking = await prisma.booking.findFirst({ where: { tenantId: T, principalId: PEER } });
    expect(peerBooking).toBeTruthy();
    expect(peerBooking!.startTime.getTime()).toBe(at(4).getTime());
    expect(peerBooking!.endTime.getTime()).toBe(at(6).getTime());

    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('REJECTED');
    expect(after!.decisionNote).toBe('keeping my slot');
  });

  it('only the author can decide', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));
    await expect(asPeer(() => changes.decide(req.id, 'APPROVED', undefined, at(7).toISOString(), at(8).toISOString())))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the owner is told to edit directly instead of requesting', async () => {
    const b = await makeBooking();
    await expect(asOwner(() => changes.create(b.id, { ...carveOut, draft: wantedDraft })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('one open request per requester per booking', async () => {
    const b = await makeBooking();
    await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));
    await expect(asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft })))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a carve-out that touches neither edge of the wanted range', async () => {
    const b = await makeBooking();
    await expect(asPeer(() => changes.create(b.id, {
      requestedStartTime: at(2).toISOString(), requestedEndTime: at(4).toISOString(),
      draft: { title: 'x', startTime: at(1).toISOString(), endTime: at(6).toISOString() },
    }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a carve-out outside the existing booking\'s own range', async () => {
    const b = await makeBooking(); // at(2)-at(4)
    await expect(asPeer(() => changes.create(b.id, {
      requestedStartTime: at(3).toISOString(), requestedEndTime: at(5).toISOString(),
      draft: { title: 'x', startTime: at(3).toISOString(), endTime: at(6).toISOString() },
    }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an approval whose new time conflicts elsewhere fails loudly and stays pending', async () => {
    const b = await makeBooking();
    const req = await asPeer(() => changes.create(b.id, { ...carveOut, draft: wantedDraft }));
    // A third booking has since landed on the time the owner is about to pick.
    await asPeer(() => bookings.create({
      title: 'Third meeting', resourceId: R,
      startTime: at(7).toISOString(), endTime: at(8).toISOString(),
    } as any));

    await expect(asOwner(() => changes.decide(req.id, 'APPROVED', undefined, at(7).toISOString(), at(8).toISOString())))
      .rejects.toThrow();
    const after = await prisma.bookingChangeRequest.findUnique({ where: { id: req.id } });
    expect(after!.status).toBe('PENDING'); // not marked decided with nothing applied
    const owner = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(owner!.startTime.getTime()).toBe(at(2).getTime()); // untouched
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

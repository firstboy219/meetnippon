import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyResolverService } from '../booking/policy/policy-resolver.service';
import { PolicyRules } from '../booking/policy/policy.types';
import { addLocalDays, localDateKey, startOfDayInTz } from '../common/tz.util';
import { tenantTimezone } from '../common/tenant-tz';

export interface ResourceFilter {
  type?: 'ROOM' | 'DESK';
  category?: string;
  floorId?: string;
  q?: string;
}

/**
 * The parts of a resolved policy a booker is allowed to see.
 *
 * `approverIds` is deliberately dropped — who signs off is an internal routing
 * detail, not something every employee needs the user ids for.
 */
export interface PublicPolicy {
  requiresApproval: boolean;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  businessHours: PolicyRules['businessHours'];
  maxBookingsPerUserPerDay: number;
  allowExternalParticipants: boolean;
  allowRecurring: boolean;
  checkInRequired: boolean;
}

function toPublic(r: PolicyRules): PublicPolicy {
  const { approverIds, autoReleaseMinutes, ...rest } = r;
  return rest;
}

/**
 * User-facing, read-only resource discovery (BRD 7.2). Admin CRUD is Phase 4.
 * All reads are tenant-scoped by the Prisma extension.
 */
@Injectable()
export class ResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PolicyResolverService,
  ) {}

  /**
   * Resources with their effective booking policy attached.
   *
   * The portal must not infer rules from names — it used to decide "needs
   * approval" by testing whether the category contained "vip", so switching
   * approval off in the admin console changed nothing on the booking page.
   */
  async list(filter: ResourceFilter) {
    const resources = await this.listRaw(filter);
    const policies = await this.resolver.resolveMany(
      resources.map((r) => ({ id: r.id, category: r.category })),
    );
    return resources.map((r) => ({
      ...r,
      policy: toPublic(policies.get(r.id)!),
    }));
  }

  private listRaw(filter: ResourceFilter) {
    return this.prisma.scoped.resource.findMany({
      where: {
        status: 'ACTIVE',
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.floorId ? { floorId: filter.floorId } : {}),
        ...(filter.q
          ? { name: { contains: filter.q, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        floor: {
          select: {
            name: true,
            building: { select: { name: true } },
          },
        },
      },
    });
  }

  async getOne(id: string) {
    const resource = await this.prisma.scoped.resource.findUnique({
      where: { id },
      include: {
        floor: { select: { name: true, building: { select: { name: true } } } },
      },
    });
    if (!resource) throw new NotFoundException('Resource not found.');
    const rules = await this.resolver.resolveForResource({
      id: resource.id,
      category: resource.category,
    });
    return { ...resource, policy: toPublic(rules) };
  }

  /** Floors that actually have a plan image — the only ones Denah can draw. */
  async floorsWithPlans() {
    const floors = await this.prisma.scoped.floor.findMany({
      orderBy: { name: 'asc' },
      include: {
        building: { select: { id: true, name: true } },
        floorPlan: { select: { imageUrl: true } },
        _count: { select: { resources: true } },
      },
    });
    return floors
      .filter((f) => f.floorPlan?.imageUrl)
      .map((f) => ({
        id: f.id,
        name: f.name,
        building: f.building,
        rooms: f._count.resources,
      }));
  }

  /**
   * A floor plan with each pinned room's state right now.
   *
   * The pin colour is the whole point of this view, so availability is resolved
   * here rather than leaving the client to fetch a schedule per room.
   */
  async floorPlanView(floorId: string, day?: string) {
    const floor = await this.prisma.scoped.floor.findUnique({
      where: { id: floorId },
      include: {
        building: { select: { name: true } },
        floorPlan: { select: { imageUrl: true, pins: true } },
      },
    });
    if (!floor) throw new NotFoundException('Floor not found.');

    const tz = await tenantTimezone(this.prisma);
    const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T12:00:00.000Z`)
      : new Date();
    const dayStart = startOfDayInTz(base, tz);
    const dayEnd = addLocalDays(dayStart, 1, tz);
    const now = new Date();

    const resources = await this.listRaw({ floorId });
    const policies = await this.resolver.resolveMany(
      resources.map((r) => ({ id: r.id, category: r.category })),
    );
    const bookings = await this.prisma.scoped.booking.findMany({
      where: {
        resourceId: { in: resources.map((r) => r.id) },
        status: { in: ['PENDING', 'APPROVED', 'WAITLIST'] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true, title: true, startTime: true, endTime: true, status: true, resourceId: true,
        principal: { select: { fullName: true } },
      },
    });

    const byRoom = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const l = byRoom.get(b.resourceId!) ?? [];
      l.push(b);
      byRoom.set(b.resourceId!, l);
    }

    const pins = (floor.floorPlan?.pins as unknown as { resourceId: string; x: number; y: number }[]) ?? [];

    return {
      floor: { id: floor.id, name: floor.name, building: floor.building },
      imageUrl: floor.floorPlan?.imageUrl ?? null,
      timezone: tz,
      day: localDateKey(dayStart, tz),
      isToday: localDateKey(now, tz) === localDateKey(dayStart, tz),
      rooms: resources.map((r) => {
        const list = byRoom.get(r.id) ?? [];
        const current = list.find((b) => b.startTime <= now && b.endTime > now) ?? null;
        const next = list.find((b) => b.startTime > now) ?? null;
        const pin = pins.find((p) => p.resourceId === r.id) ?? null;
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          capacity: r.capacity,
          category: r.category,
          facilities: r.facilities,
          status: r.status,
          pin,
          // 'booked' only means right now; a room busy later today is still
          // free to walk into, and the map should say so.
          state: r.status !== 'ACTIVE' ? 'maintenance'
            : current ? 'booked'
            : list.length ? 'pending'
            : 'available',
          current,
          next,
          bookings: list,
          policy: toPublic(policies.get(r.id)!),
        };
      }),
    };
  }

  /**
   * Every room's day in one shot, for the schedule timeline.
   *
   * One query for the resources and one for the bookings, rather than a
   * per-room round trip — this is the view users leave open, so it has to stay
   * cheap as the room list grows.
   */
  async dayGrid(day?: string, type?: 'ROOM' | 'DESK') {
    const tz = await tenantTimezone(this.prisma);
    const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T12:00:00.000Z`)
      : new Date();
    const dayStart = startOfDayInTz(base, tz);
    const dayEnd = addLocalDays(dayStart, 1, tz);

    const resources = await this.listRaw({ ...(type ? { type } : {}) });
    const bookings = await this.prisma.scoped.booking.findMany({
      where: {
        resourceId: { in: resources.map((r) => r.id) },
        status: { in: ['PENDING', 'APPROVED', 'WAITLIST'] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true, title: true, startTime: true, endTime: true, status: true,
        resourceId: true, principalId: true, bookerId: true,
        principal: { select: { fullName: true, department: true } },
      },
    });

    const byResource = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const list = byResource.get(b.resourceId!) ?? [];
      list.push(b);
      byResource.set(b.resourceId!, list);
    }

    return {
      day: localDateKey(dayStart, tz),
      timezone: tz,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      rooms: resources.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        category: r.category,
        floor: (r as any).floor ?? null,
        bookings: byResource.get(r.id) ?? [],
      })),
    };
  }

  /**
   * A room's day at a glance — what the QR sticker on the door leads to.
   *
   * Requires a signed-in member of the tenant: it names who booked each slot,
   * which is colleague information, not something a passing visitor should get
   * by pointing a phone at a door.
   *
   * `day` is a calendar date on the **tenant's** clock, so "today" means the
   * office's today rather than the server's.
   */
  async schedule(id: string, day?: string) {
    const resource = await this.getOne(id);
    const tz = await tenantTimezone(this.prisma);

    const base = day && /^\d{4}-\d{2}-\d{2}$/.test(day)
      ? new Date(`${day}T12:00:00.000Z`)
      : new Date();
    const dayStart = startOfDayInTz(base, tz);
    const dayEnd = addLocalDays(dayStart, 1, tz);

    const bookings = await this.prisma.scoped.booking.findMany({
      where: {
        resourceId: id,
        status: { in: ['PENDING', 'APPROVED', 'WAITLIST'] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true, title: true, startTime: true, endTime: true, status: true,
        principal: { select: { fullName: true, department: true } },
      },
    });

    const now = new Date();
    const current = bookings.find((b) => b.startTime <= now && b.endTime > now) ?? null;
    const next = bookings.find((b) => b.startTime > now) ?? null;

    return {
      resource,
      timezone: tz,
      day: localDateKey(dayStart, tz),
      // Only meaningful for today; a past or future date has no "right now".
      isToday: localDateKey(now, tz) === localDateKey(dayStart, tz),
      busyNow: Boolean(current),
      current,
      next,
      bookings,
    };
  }
}

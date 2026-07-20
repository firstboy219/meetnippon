import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PolicyResolverService } from '../booking/policy/policy-resolver.service';
import { PolicyRules } from '../booking/policy/policy.types';

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
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PolicyRules, mergeRules } from './policy.types';

export interface ResolvedResource {
  id: string;
  category: string | null;
}

/**
 * Resolves the effective booking rules for a resource by merging the three
 * policy scopes (TENANT <- CATEGORY <- ROOM). All reads are tenant-scoped by
 * the Prisma extension, so a tenant can never resolve another tenant's policy.
 */
@Injectable()
export class PolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveForResource(resource: ResolvedResource): Promise<PolicyRules> {
    const policies = await this.prisma.scoped.bookingPolicy.findMany({
      where: {
        OR: [
          { scope: 'TENANT' },
          ...(resource.category
            ? [{ scope: 'CATEGORY' as const, category: resource.category }]
            : []),
          { scope: 'ROOM' as const, resourceId: resource.id },
        ],
      },
      // The @@unique on (tenantId, scope, category, resourceId) does NOT stop a
      // second TENANT-scope row: both its nullable columns are NULL, and
      // Postgres treats NULLs as distinct in a unique index. Duplicates do
      // exist in the wild, so pick one deterministically rather than letting
      // row order decide what a tenant's rules are from request to request.
      orderBy: { id: 'asc' },
    });

    const byScope = (s: string) => policies.find((p) => p.scope === s)?.rules as
      | Partial<PolicyRules>
      | undefined;

    return mergeRules(byScope('TENANT'), byScope('CATEGORY'), byScope('ROOM'));
  }

  /**
   * Same merge for a whole list, in one query.
   *
   * Resolving per resource would issue a query per row on every listing, which
   * is the hot path behind the booking page.
   */
  async resolveMany(
    resources: ResolvedResource[],
  ): Promise<Map<string, PolicyRules>> {
    const out = new Map<string, PolicyRules>();
    if (resources.length === 0) return out;

    const policies = await this.prisma.scoped.bookingPolicy.findMany({
      orderBy: { id: 'asc' },
    });
    const tenantRules = policies.find((p) => p.scope === 'TENANT')?.rules as
      | Partial<PolicyRules>
      | undefined;

    for (const r of resources) {
      const categoryRules = r.category
        ? (policies.find((p) => p.scope === 'CATEGORY' && p.category === r.category)
            ?.rules as Partial<PolicyRules> | undefined)
        : undefined;
      const roomRules = policies.find(
        (p) => p.scope === 'ROOM' && p.resourceId === r.id,
      )?.rules as Partial<PolicyRules> | undefined;
      out.set(r.id, mergeRules(tenantRules, categoryRules, roomRules));
    }
    return out;
  }
}

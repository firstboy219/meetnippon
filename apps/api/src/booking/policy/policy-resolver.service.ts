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
    });

    const byScope = (s: string) => policies.find((p) => p.scope === s)?.rules as
      | Partial<PolicyRules>
      | undefined;

    return mergeRules(byScope('TENANT'), byScope('CATEGORY'), byScope('ROOM'));
  }
}

import { PrismaClient } from '@prisma/client';
import { getTenantStore } from '../tenant/tenant-context';

/**
 * The current tenant's IANA zone, or 'UTC' outside tenant context (jobs, tests).
 * Every "today" boundary and business-hours check resolves through this.
 */
export async function tenantTimezone(prisma: PrismaClient): Promise<string> {
  const tenantId = getTenantStore()?.tenantId;
  if (!tenantId) return 'UTC';
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return tenant?.timezone || 'UTC';
}

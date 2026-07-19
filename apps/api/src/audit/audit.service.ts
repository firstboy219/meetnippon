import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantStore } from '../tenant/tenant-context';

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** override tenantId (system contexts); defaults to current tenant */
  tenantId?: string;
  actorId?: string;
}

/** Central audit-log writer (roadmap 2.4: all important writes audited). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const store = getTenantStore();
    const tenantId = entry.tenantId ?? store?.tenantId;
    if (!tenantId) return; // nothing to attribute
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: entry.actorId ?? store?.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? {}) as any,
      },
    });
  }
}

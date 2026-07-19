import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getTenantStore } from '../tenant/tenant-context';
import {
  TENANT_SCOPED_MODELS,
  READ_OPS,
  CREATE_OPS,
  SINGLE_WRITE_OPS,
} from './tenant-models';

/**
 * PrismaService with a tenant-isolation extension.
 *
 * Every query against a tenant-scoped model automatically:
 *  - reads: gets `tenantId` merged into its `where`
 *  - creates: gets `tenantId` stamped into its `data`
 *  - single writes (update/delete): are pre-checked to belong to the tenant
 *
 * If there is no tenant in context and the op is not explicitly unscoped,
 * the query is refused — fail closed, never leak across tenants (BRD 6.1).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns a tenant-scoped client. Cache one extended client; the extension
   * reads tenant context dynamically per call via AsyncLocalStorage.
   */
  private _scoped: ReturnType<PrismaService['buildScoped']> | null = null;

  get scoped() {
    if (!this._scoped) this._scoped = this.buildScoped();
    return this._scoped;
  }

  private buildScoped() {
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !TENANT_SCOPED_MODELS.has(model)) {
              return query(args);
            }

            const store = getTenantStore();
            if (store?.bypassTenantScope) {
              return query(args);
            }

            const tenantId = store?.tenantId ?? null;
            if (!tenantId) {
              throw new ForbiddenException(
                `Tenant context required for ${model}.${operation}`,
              );
            }

            const a: any = args ?? {};

            if (READ_OPS.has(operation)) {
              a.where = { ...(a.where ?? {}), tenantId };
              return query(a);
            }

            if (CREATE_OPS.has(operation)) {
              if (operation === 'createMany') {
                const rows = Array.isArray(a.data) ? a.data : [a.data];
                a.data = rows.map((r: any) => ({ ...r, tenantId }));
              } else {
                a.data = { ...(a.data ?? {}), tenantId };
              }
              return query(a);
            }

            if (SINGLE_WRITE_OPS.has(operation)) {
              // constrain the target row to the tenant
              a.where = { ...(a.where ?? {}), tenantId };
              if (operation === 'upsert') {
                a.create = { ...(a.create ?? {}), tenantId };
              }
              return query(a);
            }

            return query(a);
          },
        },
      },
    });
  }
}

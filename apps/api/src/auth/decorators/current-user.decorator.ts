import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getTenantStore } from '../../tenant/tenant-context';

export interface CurrentUserCtx {
  userId: string;
  tenantId: string;
  role: string;
}

/**
 * Pulls the authenticated principal from the request-scoped tenant context
 * (populated by TenantContextMiddleware from the verified access token).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, _ctx: ExecutionContext): CurrentUserCtx | null => {
    const store = getTenantStore();
    if (!store?.userId || !store?.tenantId) return null;
    return {
      userId: store.userId,
      tenantId: store.tenantId,
      role: store.role ?? 'EMPLOYEE',
    };
  },
);

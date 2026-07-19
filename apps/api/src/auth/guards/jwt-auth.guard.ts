import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { getTenantStore } from '../../tenant/tenant-context';

/**
 * Requires an authenticated principal. The token has already been verified by
 * TenantContextMiddleware; this guard just asserts the context is populated.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    const store = getTenantStore();
    if (!store?.userId || !store?.tenantId) {
      throw new UnauthorizedException('Authentication required.');
    }
    return true;
  }
}

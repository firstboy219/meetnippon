import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@meetnippon/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { getTenantStore } from '../../tenant/tenant-context';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    // Global guard runs before the controller's JwtAuthGuard, so distinguish
    // "not authenticated" (401) from "authenticated but wrong role" (403).
    const store = getTenantStore();
    if (!store?.userId) {
      throw new UnauthorizedException('Authentication required.');
    }
    const role = store.role as UserRole | undefined;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient role.');
    }
    return true;
  }
}

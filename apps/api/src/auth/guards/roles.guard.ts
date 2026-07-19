import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
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

    const role = getTenantStore()?.role as UserRole | undefined;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Insufficient role.');
    }
    return true;
  }
}

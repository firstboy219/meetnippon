import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { tenantStorage, TenantStore } from './tenant-context';

/**
 * Populates the AsyncLocalStorage tenant context for the lifetime of each request.
 * Best-effort: a valid access token sets {tenantId,userId,role}; otherwise the
 * context has tenantId=null and tenant-scoped queries will fail closed until a
 * route explicitly runs unscoped (auth/branding lookups).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const store: TenantStore = { tenantId: null };

    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const payload = this.jwt.verify(token, {
          secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        });
        store.tenantId = payload.tenantId ?? null;
        store.userId = payload.sub ?? null;
        store.role = payload.role ?? null;
      } catch {
        // invalid/expired token -> stays unauthenticated
      }
    }

    tenantStorage.run(store, () => next());
  }
}

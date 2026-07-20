import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload, LoginResult, Language } from '@meetnippon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantResolverService } from '../tenant/tenant-resolver.service';
import { runUnscoped, runWithTenant } from '../tenant/tenant-context';
import { verifyPassword } from './password.util';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly resolver: TenantResolverService,
  ) {}

  private async signTokens(payload: AccessTokenPayload) {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<number>('JWT_ACCESS_TTL') ?? 900,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, tenantId: payload.tenantId, typ: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<number>('JWT_REFRESH_TTL') ?? 1209600,
      },
    );
    return { accessToken, refreshToken };
  }

  /**
   * Resolve tenant (host first, then explicit slug), then authenticate the user
   * within that tenant. Cross-tenant login is impossible: the user lookup is
   * pinned to the resolved tenantId.
   */
  async login(dto: LoginDto, host?: string): Promise<LoginResult> {
    let tenant = await this.resolver.resolveFromHost(host);
    if (!tenant && dto.tenantSlug) {
      tenant = await this.resolver.resolveBySlug(dto.tenantSlug);
    }
    if (!tenant) {
      throw new BadRequestException('Could not determine your workspace.');
    }
    if (!tenant.isActive) {
      throw new UnauthorizedException('This workspace is not active.');
    }

    const user = await runUnscoped(() =>
      this.prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: tenant!.tenantId,
            email: dto.email.trim().toLowerCase(),
          },
        },
      }),
    );

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }
    const ok = await verifyPassword(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as AccessTokenPayload['role'],
      lang: user.languagePref as Language,
    };
    const tokens = await this.signTokens(payload);

    await runWithTenant(
      { tenantId: user.tenantId, userId: user.id, role: user.role },
      () =>
        this.audit.log({
          action: 'auth.login',
          entity: 'User',
          entityId: user.id,
        }),
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as AccessTokenPayload['role'],
        languagePref: user.languagePref as Language,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Build a signed session (access + refresh + user) for an already-authenticated
   * user. Shared by password login and SSO (JIT-provisioned) sign-in.
   */
  async issueSession(user: {
    id: string; tenantId: string; role: string; languagePref: string;
    email: string; fullName: string;
  }): Promise<LoginResult> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as AccessTokenPayload['role'],
      lang: user.languagePref as Language,
    };
    const tokens = await this.signTokens(payload);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as AccessTokenPayload['role'],
        languagePref: user.languagePref as Language,
        tenantId: user.tenantId,
      },
    };
  }

  async refresh(refreshToken: string) {
    let decoded: { sub?: string; tenantId?: string; typ?: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }
    if (decoded.typ !== 'refresh' || !decoded.sub || !decoded.tenantId) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const user = await runUnscoped(() =>
      this.prisma.user.findUnique({ where: { id: decoded.sub } }),
    );
    if (!user || !user.isActive || user.tenantId !== decoded.tenantId) {
      throw new UnauthorizedException('Session no longer valid.');
    }

    return this.signTokens({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role as AccessTokenPayload['role'],
      lang: user.languagePref as Language,
    });
  }

  async me(userId: string) {
    const user = await runUnscoped(() =>
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          languagePref: true,
          department: true,
          tenantId: true,
          // The portal renders every time on this clock; branding is not a
          // reliable carrier for it (shared-URL hosts resolve no tenant).
          tenant: { select: { timezone: true } },
        },
      }),
    );
    if (!user) throw new UnauthorizedException();
    const { tenant, ...rest } = user;
    return { ...rest, timezone: tenant?.timezone ?? 'UTC' };
  }
}

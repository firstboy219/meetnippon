import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { LoginResult } from '@meetnippon/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { FeatureFlagService } from '../flags/feature-flag.service';
import { TenantResolverService } from '../tenant/tenant-resolver.service';
import { runUnscoped, runWithTenant } from '../tenant/tenant-context';
import { extractEmailDomain } from '../common/domain.util';
import { SsoProvider } from './providers/provider.interface';
import { MockProvider } from './providers/mock.provider';
import { MicrosoftProvider } from './providers/microsoft.provider';
import { GoogleProvider } from './providers/google.provider';

const PROVIDERS = ['microsoft', 'google'] as const;
type ProviderKey = (typeof PROVIDERS)[number];

@Injectable()
export class SsoService {
  private readonly mock = new MockProvider();
  private readonly live: Record<ProviderKey, SsoProvider> = {
    microsoft: new MicrosoftProvider(),
    google: new GoogleProvider(),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly flags: FeatureFlagService,
    private readonly resolver: TenantResolverService,
  ) {}

  private assertProvider(p: string): ProviderKey {
    if (!(PROVIDERS as readonly string[]).includes(p)) {
      throw new BadRequestException('Unknown SSO provider.');
    }
    return p as ProviderKey;
  }

  private flagKey(p: ProviderKey) {
    return `sso_${p}`;
  }

  private redirectUri(provider: ProviderKey, config: Record<string, any>) {
    if (config.redirectUri) return config.redirectUri as string;
    const base = this.config.get<string>('PLATFORM_BASE_DOMAIN');
    return `https://${base}/api/auth/sso/${provider}/callback`;
  }

  /** Begin an SSO sign-in: returns the provider auth URL (or 'mock:consent'). */
  async start(providerRaw: string, tenantSlug?: string, host?: string) {
    const provider = this.assertProvider(providerRaw);

    let tenant = await this.resolver.resolveFromHost(host);
    if (!tenant && tenantSlug) tenant = await this.resolver.resolveBySlug(tenantSlug);
    if (!tenant) throw new BadRequestException('Could not determine your workspace.');

    const enabled = await this.flags.isEnabled(tenant.tenantId, this.flagKey(provider));
    if (!enabled) throw new BadRequestException(`${provider} SSO is not enabled for this workspace.`);

    const cfg = await this.flags.configFor(tenant.tenantId, this.flagKey(provider));
    const mode = cfg.mode === 'live' ? 'live' : 'mock';
    const state = await this.jwt.signAsync(
      { tenantId: tenant.tenantId, provider, typ: 'sso_state' },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: 600 },
    );

    const impl = mode === 'live' ? this.live[provider] : this.mock;
    const url = impl.buildAuthUrl({ state, redirectUri: this.redirectUri(provider, cfg), config: cfg });
    return { provider, mode, state, url };
  }

  /** Complete SSO: verify state, exchange code, JIT-provision, issue session. */
  async callback(providerRaw: string, code: string, state: string): Promise<LoginResult> {
    const provider = this.assertProvider(providerRaw);
    let claims: { tenantId?: string; provider?: string; typ?: string };
    try {
      claims = await this.jwt.verifyAsync(state, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('SSO state expired or invalid.');
    }
    if (claims.typ !== 'sso_state' || claims.provider !== provider || !claims.tenantId) {
      throw new UnauthorizedException('Invalid SSO state.');
    }
    const tenantId = claims.tenantId;

    const cfg = await this.flags.configFor(tenantId, this.flagKey(provider));
    const mode = cfg.mode === 'live' ? 'live' : 'mock';
    const impl = mode === 'live' ? this.live[provider] : this.mock;
    const identity = await impl.exchangeCode({
      code,
      redirectUri: this.redirectUri(provider, cfg),
      config: cfg,
    });

    const user = await this.findOrProvision(tenantId, identity.email, identity.fullName, cfg);

    await runWithTenant({ tenantId, userId: user.id, role: user.role }, () =>
      this.audit.log({ action: `sso.login.${provider}`, entity: 'User', entityId: user.id }),
    );

    return this.auth.issueSession(user);
  }

  private async findOrProvision(
    tenantId: string,
    email: string,
    fullName: string,
    cfg: Record<string, any>,
  ) {
    const existing = await runUnscoped(() =>
      this.prisma.user.findUnique({ where: { tenantId_email: { tenantId, email } } }),
    );
    if (existing) {
      if (!existing.isActive) throw new UnauthorizedException('This account has been deactivated.');
      return existing;
    }

    // Just-in-time provisioning (mock defaults on; live requires autoProvision).
    const autoProvision = cfg.autoProvision ?? (cfg.mode !== 'live');
    if (!autoProvision) {
      throw new UnauthorizedException('No account exists for this email in this workspace.');
    }

    // If the tenant has verified domains, the email must match one of them.
    const domains = await runUnscoped(() =>
      this.prisma.tenantDomain.findMany({ where: { tenantId, status: 'VERIFIED' } }),
    );
    if (domains.length && !cfg.allowAnyDomain) {
      const dom = extractEmailDomain(email);
      if (!dom || !domains.some((d) => d.domain === dom)) {
        throw new UnauthorizedException('Your email domain is not allowed for this workspace.');
      }
    }

    return runUnscoped(() =>
      this.prisma.user.create({
        data: { tenantId, email, fullName, role: 'EMPLOYEE', languagePref: 'EN', isActive: true },
      }),
    );
  }
}

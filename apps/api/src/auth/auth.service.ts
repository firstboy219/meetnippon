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
import { hashPassword, verifyPassword } from './password.util';
import { LoginDto } from './dto/login.dto';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { MenuVisibilityService } from '../menu/menu-visibility.service';

/** How long an activation link stays usable. */
const ACTIVATION_TTL_MS = 7 * 24 * 3600_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly resolver: TenantResolverService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
    private readonly menuVisibility: MenuVisibilityService,
  ) {}

  /**
   * Mint a one-time activation token for a user, store only its hash, and
   * return the raw token for the email link.
   *
   * Public so the bulk-import path can reuse it — an imported account has no
   * password, and this is the only way into it.
   */
  async issueActivationToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await runUnscoped(() =>
      this.prisma.user.update({
        where: { id: userId },
        data: {
          activationTokenHash: sha256(raw),
          activationExpiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
        },
      }),
    );
    return raw;
  }

  /** Compose and send the "set your password" email. Fire-and-forget. */
  async sendActivationEmail(user: { id: string; tenantId: string; email: string; fullName: string }) {
    const raw = await this.issueActivationToken(user.id);
    const base = (this.config.get<string>('APP_BASE_URL') || '').replace(/\/+$/, '');
    const link = `${base}/activate?token=${encodeURIComponent(raw)}`;
    const tenant = await runUnscoped(() =>
      this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { name: true, branding: { select: { displayName: true, primaryColor: true } } },
      }),
    );
    const brandName = tenant?.branding?.displayName || tenant?.name || 'MeetNippon';
    this.mail.send({
      tenantId: user.tenantId,
      to: user.email,
      subject: `Activate your ${brandName} account`,
      eyebrow: 'Account activation',
      heading: `Welcome, ${user.fullName.split(' ')[0]}`,
      intro: `An account has been created for you at ${brandName}. Set your password to get started — the link is valid for 7 days and can only be used once.`,
      details: [
        { label: 'Workspace', value: brandName },
        { label: 'Sign-in email', value: user.email },
      ],
      buttons: [{ label: 'Set my password', url: link, primary: true }],
      brand: { name: brandName, color: tenant?.branding?.primaryColor },
      footerNote: 'If you were not expecting this, you can ignore this email — the account cannot be used until a password is set.',
      text: [
        `Welcome to ${brandName}.`,
        '',
        `An account has been created for you (${user.email}).`,
        'Set your password using the link below. It expires in 7 days.',
        '',
        link,
      ].join('\n'),
    });
  }

  /**
   * Start activation from the login screen.
   *
   * Always resolves the same way whether or not the address exists: replying
   * "no such user" here would turn this into a directory of who works there.
   */
  async requestActivation(email: string, tenantSlug?: string, host?: string): Promise<void> {
    let tenant = await this.resolver.resolveFromHost(host);
    if (!tenant && tenantSlug) tenant = await this.resolver.resolveBySlug(tenantSlug);
    if (!tenant) return;

    const addr = email.trim().toLowerCase();
    const user = await runUnscoped(() =>
      this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant!.tenantId, email: addr } },
      }),
    );

    if (!user) {
      // Nobody by that address. If it is one of the workspace's own verified
      // domains the person is plainly staff, so park the attempt for an admin
      // to approve rather than refusing someone who genuinely works here.
      await this.parkRegistration(tenant.tenantId, addr);
      return;
    }
    // Only accounts that have never set a password can be activated this way;
    // otherwise this would be an unauthenticated password-reset for anyone.
    if (!user.isActive || user.passwordHash) return;
    await this.sendActivationEmail(user);
  }

  /**
   * Record a self-service sign-up attempt from a company domain.
   *
   * Deliberately creates nothing that can sign in — only a request an admin has
   * to act on, so the domain check alone never grants access.
   */
  private async parkRegistration(tenantId: string, email: string): Promise<void> {
    const domain = email.split('@')[1];
    if (!domain) return;
    const allowed = await runUnscoped(() =>
      this.prisma.tenantDomain.findFirst({
        where: { tenantId, domain, status: 'VERIFIED' },
      }),
    );
    if (!allowed) return;

    const existing = await runUnscoped(() =>
      this.prisma.registrationRequest.findUnique({
        where: { tenantId_email: { tenantId, email } },
      }),
    );
    // A rejected address should not be able to re-queue itself by retrying.
    if (existing) return;

    await runUnscoped(() =>
      this.prisma.registrationRequest.create({ data: { tenantId, email } as any }),
    );
    await runWithTenant({ tenantId, userId: 'system', role: 'ADMIN' }, () =>
      this.audit.log({ action: 'registration.requested', entity: 'RegistrationRequest', metadata: { email } }),
    );

    // Tell the admins there is something waiting.
    const admins = await runUnscoped(() =>
      this.prisma.user.findMany({
        where: { tenantId, role: 'ADMIN', isActive: true },
        select: { id: true, email: true },
      }),
    );
    for (const a of admins) {
      await this.notifications.notify(tenantId, a.id, {
        type: 'approval',
        title: `${email} is asking to join the workspace`,
        deepLink: '/users',
      });
    }
  }

  /** Redeem an activation token: set the first password and sign the user in. */
  async completeActivation(token: string, newPassword: string): Promise<LoginResult> {
    const hash = sha256(token);
    const user = await runUnscoped(() =>
      this.prisma.user.findFirst({ where: { activationTokenHash: hash } }),
    );
    const invalid = new BadRequestException('This activation link is invalid or has already been used.');
    if (!user || !user.activationTokenHash) throw invalid;
    // Constant-time compare, so a near-miss hash cannot be probed by timing.
    const a = Buffer.from(user.activationTokenHash);
    const b = Buffer.from(hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw invalid;
    if (!user.activationExpiresAt || user.activationExpiresAt < new Date()) {
      throw new BadRequestException('This activation link has expired. Ask your administrator to send a new one.');
    }
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated.');
    if (newPassword.length < 8) throw new BadRequestException('Use at least 8 characters.');

    const passwordHash = await hashPassword(newPassword);
    const updated = await runUnscoped(() =>
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // The password is the user's own from the start, so no forced change.
          mustChangePassword: false,
          activationTokenHash: null,
          activationExpiresAt: null,
        },
      }),
    );
    await runWithTenant(
      { tenantId: updated.tenantId, userId: updated.id, role: updated.role },
      () => this.audit.log({ action: 'auth.activation.complete', entity: 'User', entityId: updated.id }),
    );
    return this.issueSession(updated as any);
  }

  /**
   * Session lengths, admin-configurable per workspace.
   *
   * The env values remain the fallback for anything without a tenant row yet.
   * Reading them at signing time (rather than at boot) means a change in the
   * console takes effect on the next renewal, with no restart.
   */
  private async sessionTtls(tenantId?: string): Promise<{ accessSec: number; refreshSec: number }> {
    const envAccess = Number(this.config.get<string>('JWT_ACCESS_TTL') ?? 900);
    const envRefresh = Number(this.config.get<string>('JWT_REFRESH_TTL') ?? 1209600);
    if (!tenantId) return { accessSec: envAccess, refreshSec: envRefresh };
    const t = await runUnscoped(() =>
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { sessionDays: true, accessTtlMinutes: true },
      }),
    );
    return {
      accessSec: t?.accessTtlMinutes ? t.accessTtlMinutes * 60 : envAccess,
      refreshSec: t?.sessionDays ? t.sessionDays * 86400 : envRefresh,
    };
  }

  private async signTokens(payload: AccessTokenPayload) {
    const { accessSec, refreshSec } = await this.sessionTtls(payload.tenantId);
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessSec,
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: payload.sub, tenantId: payload.tenantId, typ: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshSec,
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
          // Gates the portal on a change-password screen at first sign-in.
          mustChangePassword: true,
          // The portal renders every time on this clock; branding is not a
          // reliable carrier for it (shared-URL hosts resolve no tenant).
          tenant: {
            select: {
              timezone: true,
              // What the admin console has switched on. The portal used to show
              // every module regardless, so turning one off changed nothing for
              // the people using it.
              featureFlags: { where: { enabled: true }, select: { key: true } },
            },
          },
        },
      }),
    );
    if (!user) throw new UnauthorizedException();
    const { tenant, ...rest } = user;
    // What the admin's Menu Access page has hidden from this person's role —
    // the sidebar (and a route-level redirect) act on this list.
    const hiddenMenus = await this.menuVisibility.hiddenFor(user.tenantId, user.role);
    return {
      ...rest,
      timezone: tenant?.timezone ?? 'UTC',
      features: (tenant?.featureFlags ?? []).map((f) => f.key),
      hiddenMenus,
    };
  }
}

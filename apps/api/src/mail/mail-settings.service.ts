import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTenantStore, runUnscoped } from '../tenant/tenant-context';
import { decryptSecret, encryptSecret } from '../common/secret-box';
import { UpdateMailSettingsDto } from './dto/mail-settings.dto';

/** What the admin console is allowed to see. Never includes the password. */
export interface MailSettingsView {
  host: string;
  port: number;
  username: string;
  fromName: string | null;
  fromEmail: string | null;
  enabled: boolean;
  /** Whether a password is stored — the value itself never leaves the server. */
  hasPassword: boolean;
  lastVerifiedAt: Date | null;
  lastError: string | null;
}

export interface ResolvedMailConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
}

@Injectable()
export class MailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<MailSettingsView | null> {
    const row = await this.prisma.scoped.tenantMailSetting.findFirst();
    return row ? this.toView(row) : null;
  }

  async update(dto: UpdateMailSettingsDto): Promise<MailSettingsView> {
    const tenantId = getTenantStore()?.tenantId as string;
    const existing = await this.prisma.scoped.tenantMailSetting.findFirst();

    // An omitted password means "keep what is stored" — the console cannot
    // read the current value back, so it has nothing to resubmit.
    let passwordEnc = existing?.passwordEnc ?? '';
    if (dto.password !== undefined) {
      passwordEnc = dto.password === '' ? '' : encryptSecret(dto.password);
    }
    if (!existing && !passwordEnc && dto.username) {
      throw new BadRequestException('A password is required for an authenticated server.');
    }

    const data = {
      host: dto.host.trim(),
      port: dto.port ?? 587,
      username: dto.username?.trim() ?? '',
      passwordEnc,
      fromName: dto.fromName?.trim() || null,
      fromEmail: dto.fromEmail?.trim().toLowerCase() || null,
      enabled: dto.enabled ?? true,
      // Any change invalidates a previous verdict; it has not been tried yet.
      lastVerifiedAt: null,
      lastError: null,
    };

    const row = existing
      ? await this.prisma.scoped.tenantMailSetting.update({ where: { id: existing.id }, data })
      : await this.prisma.scoped.tenantMailSetting.create({ data: { ...data, tenantId } as any });

    await this.audit.log({
      action: 'mail.settings.update',
      entity: 'TenantMailSetting',
      entityId: row.id,
      // Log what changed, never the credential itself.
      metadata: { host: data.host, port: data.port, username: data.username, enabled: data.enabled },
    });
    return this.toView(row);
  }

  async remove(): Promise<{ deleted: boolean }> {
    const existing = await this.prisma.scoped.tenantMailSetting.findFirst();
    if (!existing) return { deleted: false };
    await this.prisma.scoped.tenantMailSetting.delete({ where: { id: existing.id } });
    await this.audit.log({
      action: 'mail.settings.delete', entity: 'TenantMailSetting', entityId: existing.id,
    });
    return { deleted: true };
  }

  /** Record the outcome of a real connection attempt. */
  async recordVerification(tenantId: string, ok: boolean, detail: string): Promise<void> {
    await runUnscoped(async () => {
      const row = await this.prisma.tenantMailSetting.findUnique({ where: { tenantId } });
      if (!row) return;
      await this.prisma.tenantMailSetting.update({
        where: { id: row.id },
        data: {
          lastVerifiedAt: ok ? new Date() : row.lastVerifiedAt,
          lastError: ok ? null : detail.slice(0, 500),
        },
      });
    });
  }

  /**
   * The SMTP config for a tenant, or null to fall back to the platform default.
   * Runs unscoped because sends happen off the request path (jobs, callbacks).
   */
  async resolveFor(tenantId: string): Promise<ResolvedMailConfig | null> {
    const row = await runUnscoped(() =>
      this.prisma.tenantMailSetting.findUnique({ where: { tenantId } }),
    );
    if (!row || !row.enabled || !row.host) return null;

    const password = decryptSecret(row.passwordEnc);
    // A password that will not decrypt (key rotated, row tampered) must not
    // silently become an anonymous connection attempt.
    if (row.username && password === null) return null;

    const address = row.fromEmail || row.username;
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      password: password ?? '',
      from: row.fromName ? `${row.fromName} <${address}>` : address,
    };
  }

  private toView(row: {
    host: string; port: number; username: string; passwordEnc: string;
    fromName: string | null; fromEmail: string | null; enabled: boolean;
    lastVerifiedAt: Date | null; lastError: string | null;
  }): MailSettingsView {
    return {
      host: row.host,
      port: row.port,
      username: row.username,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      enabled: row.enabled,
      hasPassword: Boolean(row.passwordEnc),
      lastVerifiedAt: row.lastVerifiedAt,
      lastError: row.lastError,
    };
  }
}

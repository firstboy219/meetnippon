import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { getTenantStore } from '../tenant/tenant-context';
import { pageParams, toPage } from '../common/pagination';
import {
  BroadcastFilterDto, BroadcastRecipientsQueryDto, ResendActivationDto, SendAnnouncementDto,
} from './dto/broadcast.dto';

/** Bounds a single "everyone matching this filter" send — a typo'd filter
 *  should not be able to fan out to an unbounded number of emails. Well past
 *  the size of any tenant seen so far (nipsea, the largest, is ~1,800). */
const MAX_RECIPIENTS = 5000;

@Injectable()
export class BroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  private tenantId(): string {
    return getTenantStore()?.tenantId as string;
  }

  private whereFor(f: BroadcastFilterDto) {
    const term = f.q?.trim();
    return {
      ...(f.role ? { role: f.role as any } : {}),
      ...(f.isActive !== undefined ? { isActive: f.isActive === 'true' } : {}),
      ...(f.hasPassword !== undefined
        ? { passwordHash: f.hasPassword === 'true' ? { not: null } : null }
        : {}),
      ...(term
        ? {
          OR: [
            { fullName: { contains: term, mode: 'insensitive' as const } },
            { email: { contains: term, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
  }

  /** Paginated, for the recipient picker to browse/preview before sending —
   *  never what the actual send iterates over (see resolveTargets). */
  async recipients(q: BroadcastRecipientsQueryDto) {
    const { skip, take, page, pageSize } = pageParams(q);
    const where = this.whereFor(q);
    const [rows, total] = await Promise.all([
      this.prisma.scoped.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip,
        take,
        select: {
          id: true, email: true, fullName: true, role: true, department: true,
          isActive: true, passwordHash: true,
        },
      }),
      this.prisma.scoped.user.count({ where }),
    ]);
    // The hash itself never leaves the server — only whether one exists.
    const items = rows.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: passwordHash !== null }));
    return toPage(items, total, page, pageSize);
  }

  /**
   * Every user a send request actually targets — for ALL_MATCHING this
   * re-queries the full filter uncapped by the picker's page size, so
   * "everyone matching this filter" really means everyone, not just the
   * page that happened to be on screen.
   */
  private async resolveTargets(
    dto: { mode: 'ALL_MATCHING' | 'SELECTED'; filter?: BroadcastFilterDto; userIds?: string[] },
    forceHasPassword?: 'true' | 'false',
  ): Promise<{ id: string; email: string; fullName: string }[]> {
    if (dto.mode === 'SELECTED') {
      const ids = [...new Set((dto.userIds ?? []).filter(Boolean))];
      if (!ids.length) throw new BadRequestException('No recipients selected.');
      return this.prisma.scoped.user.findMany({
        where: {
          id: { in: ids },
          ...(forceHasPassword !== undefined
            ? { passwordHash: forceHasPassword === 'true' ? { not: null } : null }
            : {}),
        },
        select: { id: true, email: true, fullName: true },
      });
    }
    const filter: BroadcastFilterDto = {
      ...(dto.filter ?? {}),
      ...(forceHasPassword !== undefined ? { hasPassword: forceHasPassword } : {}),
    };
    return this.prisma.scoped.user.findMany({
      where: this.whereFor(filter),
      select: { id: true, email: true, fullName: true },
      take: MAX_RECIPIENTS,
    });
  }

  /**
   * Bulk-resend the "set your password" email.
   *
   * Only ever reaches accounts that genuinely have no password yet, no
   * matter what the caller filtered by — resending "activation" to someone
   * already signed in before would be confusing and is not what this button
   * is for (that is what admin-set password reset is for).
   */
  async resendActivation(dto: ResendActivationDto) {
    const tenantId = this.tenantId();
    const targets = await this.resolveTargets(dto, 'false');
    for (const u of targets) {
      await this.auth.sendActivationEmail({ id: u.id, tenantId, email: u.email, fullName: u.fullName });
    }
    await this.audit.log({
      action: 'broadcast.activation_resend',
      entity: 'User',
      metadata: { count: targets.length },
    });
    return { sent: targets.length };
  }

  /**
   * A free-form announcement. Sent as one email per recipient, not a single
   * message with everyone in `to:` — nobody on a company-wide blast should
   * see the rest of the recipient list.
   */
  async sendAnnouncement(dto: SendAnnouncementDto) {
    const tenantId = this.tenantId();
    const targets = (await this.resolveTargets(dto)).filter((u) => u.email);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: { select: { displayName: true, primaryColor: true } } },
    });
    const brandName = tenant?.branding?.displayName || tenant?.name || 'MeetNippon';
    const subject = dto.subject.trim();
    const message = dto.message.trim();

    for (const u of targets) {
      this.mail.send({
        tenantId,
        to: u.email,
        subject,
        eyebrow: 'Announcement',
        heading: subject,
        intro: message,
        brand: { name: brandName, color: tenant?.branding?.primaryColor },
        text: message,
      });
    }

    await this.audit.log({
      action: 'broadcast.announcement_sent',
      entity: 'User',
      metadata: { count: targets.length, subject },
    });
    return { sent: targets.length };
  }
}

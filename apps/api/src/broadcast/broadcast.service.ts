import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailInput, MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';
import { getTenantStore } from '../tenant/tenant-context';
import { pageParams, toPage } from '../common/pagination';
import { sanitizeBody, bodyToPlainText } from './sanitize-body.util';
import {
  BroadcastFilterDto, BroadcastRecipientsQueryDto, PreviewAnnouncementDto,
  ResendActivationDto, SendAnnouncementDto,
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

  /**
   * "Activated" means genuinely theirs: a password they chose, not one
   * someone else handed them. That is two different DB states, not one —
   * `passwordHash: null` (self-service or CSV-imported, never set one at
   * all) and `mustChangePassword: true` (an admin created the account or
   * reset it, so a password exists but is still the generic one the admin
   * set, and the person may never have signed in with it at all). Both need
   * the same nudge, so both count as "not activated" everywhere in this
   * feature — the picker's badge, and who actually gets emailed.
   */
  private notActivatedClause() {
    return { OR: [{ passwordHash: null }, { mustChangePassword: true }] };
  }

  private whereFor(f: BroadcastFilterDto) {
    const term = f.q?.trim();
    const clauses: Record<string, unknown>[] = [];
    if (f.role) clauses.push({ role: f.role as any });
    if (f.isActive !== undefined) clauses.push({ isActive: f.isActive === 'true' });
    if (f.hasPassword !== undefined) {
      clauses.push(
        f.hasPassword === 'true'
          ? { passwordHash: { not: null }, mustChangePassword: false }
          : this.notActivatedClause(),
      );
    }
    if (term) {
      clauses.push({
        OR: [
          { fullName: { contains: term, mode: 'insensitive' as const } },
          { email: { contains: term, mode: 'insensitive' as const } },
        ],
      });
    }
    // Every clause above may itself use OR, so they must nest under an
    // explicit AND — a plain object spread would let two top-level `OR`
    // keys silently clobber each other.
    return clauses.length ? { AND: clauses } : {};
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
          isActive: true, passwordHash: true, mustChangePassword: true,
        },
      }),
      this.prisma.scoped.user.count({ where }),
    ]);
    // The hash itself never leaves the server — only whether this account is
    // genuinely activated (see notActivatedClause for what that means).
    const items = rows.map(({ passwordHash, mustChangePassword, ...u }) => ({
      ...u, hasPassword: passwordHash !== null && !mustChangePassword,
    }));
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
          ...(forceHasPassword === 'true' ? { passwordHash: { not: null }, mustChangePassword: false } : {}),
          ...(forceHasPassword === 'false' ? this.notActivatedClause() : {}),
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
   * Only ever reaches accounts that are not genuinely activated yet — see
   * notActivatedClause() — no matter what the caller filtered by. Resending
   * to someone who already replaced their own password would be confusing
   * and is not what this button is for (that is what admin-set password
   * reset is for).
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

  /** The MailInput both sendAnnouncement and previewAnnouncement build —
   *  identical shape, so what an admin previews is exactly what goes out. */
  private async buildAnnouncementMail(
    tenantId: string, subject: string, messageHtml: string,
  ): Promise<{ input: Omit<MailInput, 'to'>; tenant: { name: string | null } | null }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, branding: { select: { displayName: true, primaryColor: true } } },
    });
    const brandName = tenant?.branding?.displayName || tenant?.name || 'MeetNippon';
    const safeSubject = subject.trim();
    const safeBody = sanitizeBody(messageHtml);
    return {
      tenant,
      input: {
        subject: safeSubject,
        eyebrow: 'Announcement',
        heading: safeSubject,
        bodyHtml: safeBody,
        brand: { name: brandName, color: tenant?.branding?.primaryColor },
        text: bodyToPlainText(safeBody),
      },
    };
  }

  /** Renders the exact email an announcement would send, without sending
   *  it, filing a report, or touching the recipient list at all. */
  async previewAnnouncement(dto: PreviewAnnouncementDto) {
    const { input } = await this.buildAnnouncementMail(this.tenantId(), dto.subject, dto.messageHtml);
    return { html: this.mail.renderHtml({ ...input, to: '' }) };
  }

  /**
   * A free-form announcement. Sent as one email per recipient, not a single
   * message with everyone in `to:` — nobody on a company-wide blast should
   * see the rest of the recipient list.
   */
  async sendAnnouncement(dto: SendAnnouncementDto) {
    const tenantId = this.tenantId();
    const targets = (await this.resolveTargets(dto)).filter((u) => u.email);
    const { input } = await this.buildAnnouncementMail(tenantId, dto.subject, dto.messageHtml);

    for (const u of targets) {
      this.mail.send({ ...input, tenantId, to: u.email });
    }

    await this.audit.log({
      action: 'broadcast.announcement_sent',
      entity: 'User',
      metadata: { count: targets.length, subject: input.subject },
    });
    return { sent: targets.length };
  }
}

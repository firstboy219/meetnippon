import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { getTenantStore, runUnscoped } from '../tenant/tenant-context';
import { SubmitFeedbackDto } from './dto/feedback.dto';

/**
 * Who receives what. Technical faults go to the team that builds the platform;
 * anything about rules, approvals or room policy is a business decision and
 * goes to GA. Overridable per deployment via env so a fork does not have to
 * edit code to change the recipients.
 */
const DEFAULT_TECH = 'ilham.putra@nipseapaint.com';
const DEFAULT_GA = 'hermawan.chandra@nipseapaint.com';

export type FeedbackCategory = 'technical' | 'policy' | 'suggestion';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Contacts shown on the About page and used for routing. */
  contacts() {
    return {
      builtBy: this.config.get<string>('SUPPORT_TEAM') || 'IT Enterprise BA Division',
      technical: this.config.get<string>('SUPPORT_TECH_EMAIL') || DEFAULT_TECH,
      policy: this.config.get<string>('SUPPORT_GA_EMAIL') || DEFAULT_GA,
    };
  }

  private recipientFor(category: FeedbackCategory): string {
    const c = this.contacts();
    // A suggestion is about the product, so it lands with the builders.
    return category === 'policy' ? c.policy : c.technical;
  }

  async submit(dto: SubmitFeedbackDto) {
    const store = getTenantStore();
    const tenantId = store?.tenantId as string;
    const userId = store?.userId as string;

    const message = dto.message.trim();
    if (!message) throw new BadRequestException('Please describe the issue.');

    const [user, tenant] = await Promise.all([
      this.prisma.scoped.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true, department: true },
      }),
      runUnscoped(() => this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, branding: { select: { displayName: true, primaryColor: true } } },
      })),
    ]);

    const to = this.recipientFor(dto.category);
    const brandName = tenant?.branding?.displayName || tenant?.name || 'MeetNippon';
    const label = dto.category === 'policy'
      ? 'Rules / approval'
      : dto.category === 'suggestion' ? 'Suggestion' : 'Technical issue';

    this.mail.send({
      tenantId,
      to,
      // Replying goes straight back to the person who reported it.
      replyTo: user?.email,
      subject: `[${brandName}] ${label}: ${dto.subject.trim()}`,
      eyebrow: 'User feedback',
      heading: dto.subject.trim(),
      intro: `${user?.fullName ?? 'A user'} submitted feedback from the ${brandName} portal.`,
      details: [
        { label: 'Category', value: label },
        { label: 'From', value: `${user?.fullName ?? '—'} <${user?.email ?? '—'}>` },
        ...(user?.department ? [{ label: 'Department', value: user.department }] : []),
        ...(dto.page ? [{ label: 'Page', value: dto.page }] : []),
        { label: 'Message', value: message },
      ],
      brand: { name: brandName, color: tenant?.branding?.primaryColor },
      footerNote: 'Reply to this email to reach the reporter directly.',
      text: [
        `Category: ${label}`,
        `From: ${user?.fullName ?? '—'} <${user?.email ?? '—'}>`,
        ...(dto.page ? [`Page: ${dto.page}`] : []),
        '',
        dto.subject.trim(),
        '',
        message,
      ].join('\n'),
    });

    await this.audit.log({
      action: 'feedback.submit',
      entity: 'User',
      entityId: userId,
      metadata: { category: dto.category, to },
    });

    // Queued, not delivered — the mail transport is fire-and-forget, so this
    // must not claim more than it knows.
    return { sent: this.mail.isEnabled(), to };
  }
}

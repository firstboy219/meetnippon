import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { getTenantStore } from '../tenant/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

/**
 * Mail health for the admin console.
 *
 * Sends are fire-and-forget, so a revoked password fails silently in the
 * background. This gives an admin a way to find that out on purpose.
 */
@Controller('admin/mail')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  async status() {
    const result = await this.mail.verify();
    return { configured: this.mail.isEnabled(), ...result };
  }

  /** Sends a real message to the calling admin's own address. */
  @Post('test')
  async test() {
    const userId = getTenantStore()?.userId as string;
    const user = await this.prisma.scoped.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true },
    });
    if (!user?.email) return { sent: false, detail: 'No address on your account.' };

    const sent = await this.mail.sendAndReport({
      to: user.email,
      subject: 'MeetNippon test email',
      text: [
        `Hi ${user.fullName},`,
        '',
        'This is a test message from your MeetNippon workspace.',
        'If you are reading it, outgoing email is working.',
      ].join('\n'),
    });
    return {
      sent,
      to: user.email,
      detail: sent ? 'Message accepted by the mail server.' : 'Send failed — see mail status.',
    };
  }
}

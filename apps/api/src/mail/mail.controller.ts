import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { getTenantStore } from '../tenant/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { MailSettingsService } from './mail-settings.service';
import { UpdateMailSettingsDto } from './dto/mail-settings.dto';

/**
 * Outbound email configuration for a workspace.
 *
 * The stored password is never returned by any route here — `hasPassword` is
 * the only thing said about it. Saving without a `password` field keeps the
 * existing one, which is what lets the console edit a host or port without
 * having to know the credential.
 */
@Controller('admin/mail')
@UseGuards(JwtAuthGuard)
@Roles('ADMIN')
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly settings: MailSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  private tenantId(): string {
    return getTenantStore()?.tenantId as string;
  }

  @Get('settings')
  async getSettings() {
    const saved = await this.settings.get();
    return {
      settings: saved,
      // Whether the platform would still deliver with nothing configured here.
      platformFallbackAvailable: this.mail.isEnabled(),
    };
  }

  @Put('settings')
  async saveSettings(@Body() dto: UpdateMailSettingsDto) {
    const view = await this.settings.update(dto);
    // Drop the cached transport so the very next send uses the new details.
    this.mail.invalidate(this.tenantId());
    return view;
  }

  @Delete('settings')
  async clearSettings() {
    const result = await this.settings.remove();
    this.mail.invalidate(this.tenantId());
    return result;
  }

  /** Opens a real connection and authenticates. */
  @Get('status')
  async status() {
    const result = await this.mail.verify(this.tenantId());
    return { configured: result.using !== 'none', ...result };
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
      tenantId: this.tenantId(),
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
      detail: sent
        ? 'Message accepted by the mail server.'
        : 'Send failed — check the connection status for the reason.',
    };
  }
}

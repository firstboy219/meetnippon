import { Global, Module, OnModuleInit } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailSettingsService } from './mail-settings.service';
import { MailController } from './mail.controller';

/** Global: nearly every module has some event worth emailing about. */
@Global()
@Module({
  controllers: [MailController],
  providers: [MailService, MailSettingsService],
  exports: [MailService, MailSettingsService],
})
export class MailModule implements OnModuleInit {
  constructor(
    private readonly mail: MailService,
    private readonly settings: MailSettingsService,
  ) {}

  /**
   * Hands the settings lookup to MailService here rather than injecting it
   * directly: MailService is constructed for the whole app, while the settings
   * service depends on Prisma and Audit. Wiring it after both exist keeps the
   * dependency one-directional.
   */
  onModuleInit(): void {
    this.mail.useSettingsProvider({
      resolveFor: (tenantId) => this.settings.resolveFor(tenantId),
      recordVerification: (tenantId, ok, detail) =>
        this.settings.recordVerification(tenantId, ok, detail),
    });
  }
}

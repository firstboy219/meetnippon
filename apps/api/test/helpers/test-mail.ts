import { ConfigService } from '@nestjs/config';
import { MailService, MailInput } from '../../src/mail/mail.service';

/**
 * A MailService that records instead of sending.
 *
 * Tests must never open an SMTP connection: it would be slow, flaky, and would
 * mail real people from a real account. Assertions read `sent`.
 */
export class TestMailService extends MailService {
  readonly sent: MailInput[] = [];

  constructor() {
    super(new ConfigService({}));
  }

  onModuleInit(): void {
    // deliberately no transport
  }

  send(input: MailInput): void {
    this.sent.push(input);
  }

  async sendAndReport(input: MailInput): Promise<boolean> {
    this.sent.push(input);
    return true;
  }

  isEnabled(): boolean {
    return true;
  }

  reset(): void {
    this.sent.length = 0;
  }

  /** Every address the recorded messages were addressed to. */
  recipients(): string[] {
    return this.sent.flatMap((m) => (Array.isArray(m.to) ? m.to : [m.to]));
  }
}

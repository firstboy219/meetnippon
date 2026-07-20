import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailInput {
  to: string | string[];
  subject: string;
  /** Plain-text body. An HTML wrapper is generated from it. */
  text: string;
  /** Optional call-to-action rendered as a button in the HTML part. */
  action?: { label: string; url: string };
  replyTo?: string;
}

/**
 * Outbound email.
 *
 * Delivery is **best-effort and never blocks the caller**: a booking must not
 * fail because a mail server was slow or down. Every send is fire-and-forget
 * with the outcome logged, so a silent misconfiguration still leaves a trail.
 *
 * Transport is plain SMTP, configured entirely from env. With no SMTP_HOST the
 * service switches itself off and logs what it *would* have sent — that keeps
 * tests and local runs from needing a mail server, and makes an unconfigured
 * production obvious in the logs instead of appearing to work.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from = 'MeetNippon <no-reply@localhost>';
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);

    if (!host) {
      this.logger.warn('SMTP_HOST is not set — email is disabled; sends will be logged only.');
      return;
    }

    this.from = this.config.get<string>('SMTP_FROM') || this.from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
      // A stuck connection must not pin a request thread for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.enabled = true;
    this.logger.log(`Email enabled via ${host}:${port} as ${this.from}`);
  }

  /**
   * Queue a message. Returns immediately; failures are logged, never thrown.
   * Callers are notification side-effects, not the operation itself.
   */
  send(input: MailInput): void {
    void this.sendAndReport(input);
  }

  /** Same as send() but awaitable — used by tests and by the admin probe. */
  async sendAndReport(input: MailInput): Promise<boolean> {
    const to = Array.isArray(input.to) ? input.to.filter(Boolean) : [input.to];
    if (to.length === 0) return false;

    if (!this.enabled || !this.transporter) {
      this.logger.log(`[mail:disabled] would send "${input.subject}" to ${to.join(', ')}`);
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: to.join(', '),
        subject: input.subject,
        text: this.plain(input),
        html: this.html(input),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      });
      this.logger.log(`[mail:sent] "${input.subject}" -> ${to.length} recipient(s)`);
      return true;
    } catch (err: any) {
      this.logger.error(`[mail:failed] "${input.subject}" -> ${to.join(', ')}: ${err?.message}`);
      return false;
    }
  }

  /** Whether a transport is configured. Says nothing about whether it works. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Actually connect and authenticate.
   *
   * `isEnabled()` only means "a host was configured" — a revoked password still
   * looks enabled while every send fails in the background. This is what the
   * admin console should ask before claiming email works.
   */
  async verify(): Promise<{ ok: boolean; detail: string }> {
    if (!this.enabled || !this.transporter) {
      return { ok: false, detail: 'SMTP is not configured (SMTP_HOST is empty).' };
    }
    try {
      await this.transporter.verify();
      return { ok: true, detail: `Authenticated with ${this.config.get('SMTP_HOST')}.` };
    } catch (err: any) {
      return { ok: false, detail: err?.message ?? 'Verification failed.' };
    }
  }

  private plain(input: MailInput): string {
    return input.action
      ? `${input.text}\n\n${input.action.label}: ${input.action.url}\n`
      : `${input.text}\n`;
  }

  private html(input: MailInput): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const body = esc(input.text).replace(/\n/g, '<br>');
    const button = input.action
      ? `<p style="margin:24px 0 8px"><a href="${esc(input.action.url)}" style="background:#0E6E55;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;display:inline-block">${esc(input.action.label)}</a></p>`
      : '';
    return `<!doctype html><html><body style="margin:0;background:#FAF9F6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#20242B">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E7E5DF;border-radius:14px;padding:28px">
<div style="font-size:15px;line-height:1.65">${body}</div>
${button}
<hr style="border:none;border-top:1px solid #E7E5DF;margin:24px 0 12px">
<div style="font-size:11.5px;color:#6B7178">Sent by MeetNippon. You are receiving this because you are a member of this workspace.</div>
</div></body></html>`;
  }
}

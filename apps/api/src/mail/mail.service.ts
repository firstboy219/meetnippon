import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/** One labelled row in the details card, e.g. When / Where / Link. */
export interface MailDetail {
  label: string;
  value: string;
  /** When set, the value renders as a link (used for the meeting URL). */
  href?: string;
}

/** A call-to-action button. `primary` gets the filled brand colour. */
export interface MailButton {
  label: string;
  url: string;
  primary?: boolean;
}

/** Tenant look for the email header — falls back to the MeetNippon palette. */
export interface MailBrand {
  name?: string;
  /** Header background; text colour is derived for contrast. */
  color?: string;
  /** Absolute logo URL. Many clients block remote images, so never rely on it. */
  logoUrl?: string;
}

export interface MailInput {
  to: string | string[];
  subject: string;
  /** Plain-text body / fallback. An HTML wrapper is generated from it. */
  text: string;
  /** Optional call-to-action rendered as a button in the HTML part. */
  action?: { label: string; url: string };
  replyTo?: string;
  /**
   * Which tenant's SMTP settings to use. Omitted falls back to the platform
   * env defaults, which is what unscoped/system mail wants.
   */
  tenantId?: string;

  // ---- Optional structured content for the designed HTML email. When these
  // are present the template renders a branded card with a details table and
  // CTA buttons; when absent it falls back to `text` inside the same shell, so
  // every existing caller keeps working unchanged.
  /** Big title inside the card. */
  heading?: string;
  /** Short line under a coloured header bar, e.g. "New invitation". */
  eyebrow?: string;
  /** Intro paragraph above the details. */
  intro?: string;
  /** Labelled rows: When, Where, Link, Organiser… */
  details?: MailDetail[];
  /** CTA buttons; the first `primary` one is the filled brand button. */
  buttons?: MailButton[];
  /** Tenant branding for the header. */
  brand?: MailBrand;
  /** Small closing line above the footer. */
  footerNote?: string;
  /** File attachments — e.g. an .ics calendar invite. */
  attachments?: { filename: string; content: string; contentType?: string }[];
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
  private readonly tenantTransports = new Map<
    string,
    { transporter: Transporter; from: string; label: string }
  >();

  /**
   * Injected lazily to avoid a circular dependency: MailSettingsService needs
   * Prisma and Audit, both of which sit above the global MailModule.
   */
  private settings: {
    resolveFor: (tenantId: string) => Promise<{
      host: string; port: number; username: string; password: string; from: string;
    } | null>;
    recordVerification: (tenantId: string, ok: boolean, detail: string) => Promise<void>;
  } | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Wired once at startup by MailModule. */
  useSettingsProvider(provider: NonNullable<MailService['settings']>): void {
    this.settings = provider;
  }

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
    // 465 is implicit TLS; 587 upgrades via STARTTLS. A stuck connection must
    // not pin a request thread for minutes.
    this.transporter = this.build(host, port, user ?? '', pass ?? '');
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
    // Normalise then filter: a bare '' arrives as a one-element array and would
    // otherwise reach the transport as a send with no recipient.
    const to = (Array.isArray(input.to) ? input.to : [input.to])
      .map((a) => (a ?? '').trim())
      .filter(Boolean);
    if (to.length === 0) return false;

    const t = await this.transportFor(input.tenantId);
    if (!t) {
      this.logger.log(`[mail:disabled] would send "${input.subject}" to ${to.join(', ')}`);
      return false;
    }
    try {
      await t.transporter.sendMail({
        from: t.from,
        to: to.join(', '),
        subject: input.subject,
        text: this.plain(input),
        html: this.html(input),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      });
      this.logger.log(`[mail:sent] "${input.subject}" -> ${to.length} recipient(s) via ${t.label}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[mail:failed] "${input.subject}" -> ${to.join(', ')}: ${err?.message}`);
      if (input.tenantId) {
        await this.settings?.recordVerification(input.tenantId, false, err?.message ?? 'send failed');
      }
      return false;
    }
  }

  /**
   * Transport for a tenant, or the platform default.
   *
   * Tenant transports are cached because building one opens a connection pool;
   * `invalidate()` is called whenever settings are saved so a corrected
   * password takes effect immediately instead of after a restart.
   */
  private async transportFor(
    tenantId?: string,
  ): Promise<{ transporter: Transporter; from: string; label: string } | null> {
    if (tenantId && this.settings) {
      const cached = this.tenantTransports.get(tenantId);
      if (cached) return cached;

      const cfg = await this.settings.resolveFor(tenantId);
      if (cfg) {
        const built = {
          transporter: this.build(cfg.host, cfg.port, cfg.username, cfg.password),
          from: cfg.from,
          label: `${cfg.host} (tenant)`,
        };
        this.tenantTransports.set(tenantId, built);
        return built;
      }
      // No tenant config — fall through to the platform default.
    }
    if (!this.enabled || !this.transporter) return null;
    return { transporter: this.transporter, from: this.from, label: 'platform default' };
  }

  /** Drop a cached transport so the next send picks up new settings. */
  invalidate(tenantId: string): void {
    const existing = this.tenantTransports.get(tenantId);
    if (existing) {
      existing.transporter.close?.();
      this.tenantTransports.delete(tenantId);
    }
  }

  private build(host: string, port: number, user: string, pass: string): Transporter {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
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
  async verify(tenantId?: string): Promise<{ ok: boolean; detail: string; using: string }> {
    const t = await this.transportFor(tenantId);
    if (!t) {
      return {
        ok: false,
        using: 'none',
        detail: 'No SMTP server is configured for this workspace.',
      };
    }
    try {
      await t.transporter.verify();
      const result = { ok: true, using: t.label, detail: `Connected and authenticated (${t.label}).` };
      if (tenantId) await this.settings?.recordVerification(tenantId, true, '');
      return result;
    } catch (err: any) {
      const detail = err?.message ?? 'Verification failed.';
      if (tenantId) await this.settings?.recordVerification(tenantId, false, detail);
      return { ok: false, using: t.label, detail };
    }
  }

  private plain(input: MailInput): string {
    // `text` stays the authoritative plain body; the CTA links are appended so
    // a text-only client still gets the meeting link.
    const btns = input.buttons ?? (input.action ? [input.action] : []);
    const tail = btns.map((b) => `${b.label}: ${b.url}`).join('\n');
    return tail ? `${input.text}\n\n${tail}\n` : `${input.text}\n`;
  }

  /** Ink colour that reads on `hex` — dark text on a pale brand, else white. */
  private onColor(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return '#FFFFFF';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    // BT.601 luma; the same threshold the portal uses for --on-brand.
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#20242B' : '#FFFFFF';
  }

  private html(input: MailInput): string {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const brandName = input.brand?.name || 'MeetNippon';
    const brandColor = /^#?[0-9a-f]{6}$/i.test(input.brand?.color ?? '') ? input.brand!.color! : '#0E6E55';
    const onBrand = this.onColor(brandColor);
    const structured = Boolean(input.heading || input.details?.length);

    const header = `<tr><td style="background:${esc(brandColor)};padding:22px 30px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="color:${onBrand};font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:.2px">${esc(brandName)}</td>
${input.eyebrow ? `<td align="right" style="color:${onBrand};opacity:.9;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">${esc(input.eyebrow)}</td>` : ''}
</tr></table></td></tr>`;

    let content: string;
    if (structured) {
      const rows = (input.details ?? []).map((d, i) => {
        // A divider above every row except the first — a clean separator line
        // between fields, no stray half-line at the top.
        const div = i === 0 ? '' : 'border-top:1px solid #EDEAE3;';
        const val = d.href
          ? `<a href="${esc(d.href)}" style="color:#0E6E55;text-decoration:none;word-break:break-all">${esc(d.value)}</a>`
          : esc(d.value);
        return `<tr>
<td style="padding:11px 16px;${div}color:#6B7178;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;white-space:nowrap">${esc(d.label)}</td>
<td style="padding:11px 16px;${div}color:#20242B;font-size:14px;line-height:1.5">${val}</td>
</tr>`;
      }).join('');
      const detailsTable = rows
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;background:#FBFAF7;border:1px solid #EDEAE3;border-radius:12px;border-collapse:separate">
<tr><td colspan="2" style="height:4px"></td></tr>${rows}</table>`
        : '';
      content = `<h1 style="margin:0 0 8px;font-size:21px;font-weight:700;color:#20242B;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${esc(input.heading ?? '')}</h1>
${input.intro ? `<p style="margin:0 0 18px;color:#4A4F57;font-size:14px;line-height:1.65">${esc(input.intro)}</p>` : ''}
${detailsTable}`;
    } else {
      content = `<div style="font-size:15px;line-height:1.65;color:#20242B">${esc(input.text).replace(/\n/g, '<br>')}</div>`;
    }

    const btns = input.buttons ?? (input.action ? [{ ...input.action, primary: true }] : []);
    const buttonsHtml = btns.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr>${btns.map((b) => {
        const style = b.primary
          ? `background:${esc(brandColor)};color:${onBrand};border:1px solid ${esc(brandColor)}`
          : 'background:#ffffff;color:#20242B;border:1px solid #D9D6CE';
        return `<td style="padding-right:10px"><a href="${esc(b.url)}" style="${style};text-decoration:none;padding:11px 22px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">${esc(b.label)}</a></td>`;
      }).join('')}</tr></table>`
      : '';

    const footNote = input.footerNote
      ? `<p style="margin:18px 0 0;color:#6B7178;font-size:12.5px;line-height:1.6">${esc(input.footerNote)}</p>`
      : '';

    return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F1EFE9;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1EFE9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E7E5DF;border-radius:16px;overflow:hidden">
${header}
<tr><td style="padding:28px 30px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
${content}
${buttonsHtml}
${footNote}
</td></tr>
<tr><td style="padding:16px 30px 24px;border-top:1px solid #EDEAE3">
<p style="margin:0;color:#9AA0A6;font-size:11.5px;line-height:1.6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">You are receiving this because you are a member of <strong style="color:#6B7178">${esc(brandName)}</strong> on MeetNippon.</p>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%"><tr><td style="padding:14px 8px;text-align:center;color:#B3B3AD;font-size:11px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">Powered by MeetNippon</td></tr></table>
</td></tr></table>
</body></html>`;
  }
}

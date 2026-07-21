/**
 * MailService behaviour. No database, and no SMTP connection is ever opened:
 * every case here either runs with mail disabled, or asserts on the rendered
 * message rather than on delivery.
 */
import { ConfigService } from '@nestjs/config';
import { MailService } from '../src/mail/mail.service';
import { formatRange } from '../src/common/tz.util';

const build = (env: Record<string, string> = {}) => {
  const svc = new MailService(new ConfigService(env));
  svc.onModuleInit();
  return svc;
};

describe('mail configuration', () => {
  it('stays disabled when no SMTP host is configured', async () => {
    const svc = build();
    expect(svc.isEnabled()).toBe(false);
    // A disabled service must report failure rather than pretend it sent.
    await expect(svc.sendAndReport({ to: 'a@b.co', subject: 's', text: 't' })).resolves.toBe(false);
  });

  it('enables itself once a host is present', () => {
    const svc = build({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' });
    expect(svc.isEnabled()).toBe(true);
  });

  it('never sends to an empty recipient list', async () => {
    // Deliberately disabled: this must refuse *before* reaching a transport, so
    // an enabled service would only prove that a DNS lookup failed.
    const svc = build();
    await expect(svc.sendAndReport({ to: [], subject: 's', text: 't' })).resolves.toBe(false);
    await expect(svc.sendAndReport({ to: '', subject: 's', text: 't' })).resolves.toBe(false);
    await expect(svc.sendAndReport({ to: '   ', subject: 's', text: 't' })).resolves.toBe(false);
    await expect(svc.sendAndReport({ to: ['', '  '], subject: 's', text: 't' })).resolves.toBe(false);
  });
});

describe('message rendering', () => {
  const svc = build();
  const render = (input: any) => (svc as any).html(input) as string;

  it('escapes values that came from user input', () => {
    const html = render({
      to: 'a@b.co',
      subject: 'x',
      text: 'Meeting <script>alert(1)</script> & friends',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; friends');
  });

  it('escapes the action URL too', () => {
    const html = render({
      to: 'a@b.co', subject: 'x', text: 'hi',
      action: { label: 'Open "it"', url: 'https://x.test/a?b=1&c=2' },
    });
    expect(html).toContain('b=1&amp;c=2');
    expect(html).toContain('Open &quot;it&quot;');
  });

  it('turns newlines into line breaks', () => {
    expect(render({ to: 'a@b.co', subject: 'x', text: 'one\ntwo' })).toContain('one<br>two');
  });
});

describe('times in email bodies', () => {
  it('renders a range on the tenant clock, not UTC', () => {
    // 02:00Z is 09:00 in Jakarta
    const start = new Date('2026-07-27T02:00:00.000Z');
    const end = new Date('2026-07-27T03:00:00.000Z');
    const s = formatRange(start, end, 'Asia/Jakarta');
    expect(s).toContain('09:00');
    expect(s).toContain('10:00');
    expect(s).toContain('Mon');
    expect(s).toContain('WIB');
  });

  it('falls back to UTC for an unknown zone instead of throwing', () => {
    const s = formatRange(
      new Date('2026-07-27T02:00:00.000Z'),
      new Date('2026-07-27T03:00:00.000Z'),
      'Not/AZone',
    );
    expect(s).toContain('02:00');
  });
});

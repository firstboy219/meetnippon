/**
 * Fail-fast environment validation. Runs at ConfigModule init; a missing or
 * malformed required var stops the process before it can serve traffic.
 */
const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PLATFORM_BASE_DOMAIN',
] as const;

export interface AppEnv {
  NODE_ENV: string;
  API_PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_TTL: number;
  PLATFORM_BASE_DOMAIN: string;
  PUBLIC_EMAIL_DOMAINS: string[];
  // Mail is optional: with no SMTP_HOST the MailService disables itself and
  // logs what it would have sent. These must be listed here because this
  // function's return value *is* the config — anything omitted reads back
  // undefined no matter what is in the environment.
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
  /** Absolute base for links in emails, e.g. https://meetnippon.cosger.online */
  APP_BASE_URL: string;
}

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const missing = REQUIRED.filter((k) => !raw[k] || String(raw[k]).trim() === '');
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };

  return {
    NODE_ENV: String(raw.NODE_ENV ?? 'development'),
    API_PORT: num(raw.API_PORT, 8081),
    DATABASE_URL: String(raw.DATABASE_URL),
    REDIS_URL: String(raw.REDIS_URL ?? 'redis://redis:6379'),
    JWT_ACCESS_SECRET: String(raw.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET: String(raw.JWT_REFRESH_SECRET),
    JWT_ACCESS_TTL: num(raw.JWT_ACCESS_TTL, 900),
    JWT_REFRESH_TTL: num(raw.JWT_REFRESH_TTL, 1209600),
    PLATFORM_BASE_DOMAIN: String(raw.PLATFORM_BASE_DOMAIN),
    PUBLIC_EMAIL_DOMAINS: String(raw.PUBLIC_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    SMTP_HOST: String(raw.SMTP_HOST ?? ''),
    SMTP_PORT: String(raw.SMTP_PORT ?? '587'),
    SMTP_USER: String(raw.SMTP_USER ?? ''),
    SMTP_PASS: String(raw.SMTP_PASS ?? ''),
    SMTP_FROM: String(raw.SMTP_FROM ?? ''),
    APP_BASE_URL: String(
      raw.APP_BASE_URL ?? `https://${String(raw.PLATFORM_BASE_DOMAIN ?? 'localhost')}`,
    ),
  };
}

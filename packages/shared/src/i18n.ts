// Foundation i18n catalog. EN is the default/source of truth; ID mirrors it.
// Web apps consume the full catalog; the API uses `t()` for server-side
// messages (auth errors, notifications) via Accept-Language.

import type { Language } from './types';

export const LANGUAGES: Language[] = ['EN', 'ID'];
export const DEFAULT_LANGUAGE: Language = 'EN';

export type MessageKey = keyof typeof messages.EN;

export const messages = {
  EN: {
    'auth.invalid_credentials': 'Invalid email or password.',
    'auth.tenant_not_resolved': 'Could not determine your workspace.',
    'auth.tenant_inactive': 'This workspace is not active.',
    'auth.user_inactive': 'This account has been deactivated.',
    'auth.email_taken': 'An account with this email already exists.',
    'auth.public_email_blocked': 'Public email domains are not allowed.',
    'auth.token_invalid': 'Session expired. Please sign in again.',
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.saved': 'Saved.',
  },
  ID: {
    'auth.invalid_credentials': 'Email atau kata sandi salah.',
    'auth.tenant_not_resolved': 'Tidak dapat menentukan workspace Anda.',
    'auth.tenant_inactive': 'Workspace ini tidak aktif.',
    'auth.user_inactive': 'Akun ini telah dinonaktifkan.',
    'auth.email_taken': 'Akun dengan email ini sudah terdaftar.',
    'auth.public_email_blocked': 'Domain email publik tidak diizinkan.',
    'auth.token_invalid': 'Sesi berakhir. Silakan masuk kembali.',
    'common.ok': 'OK',
    'common.cancel': 'Batal',
    'common.saved': 'Tersimpan.',
  },
} as const;

/** Normalize an Accept-Language header (or arbitrary string) to a supported Language. */
export function resolveLanguage(input?: string | null): Language {
  if (!input) return DEFAULT_LANGUAGE;
  const lower = input.toLowerCase();
  if (lower.startsWith('id')) return 'ID';
  if (lower.startsWith('en')) return 'EN';
  return DEFAULT_LANGUAGE;
}

export function t(key: MessageKey, lang: Language = DEFAULT_LANGUAGE): string {
  return messages[lang][key] ?? messages.EN[key] ?? key;
}

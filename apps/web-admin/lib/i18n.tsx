'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Lang } from './types';

const DICT: Record<string, { en: string; id: string }> = {
  'nav.dashboard': { en: 'Overview', id: 'Ringkasan' },
  'nav.analytics': { en: 'Analytics', id: 'Analitik' },
  'nav.resources': { en: 'Resources', id: 'Ruang & Desk' },
  'nav.users': { en: 'Users', id: 'Pengguna' },
  'nav.policies': { en: 'Booking Policies', id: 'Kebijakan Booking' },
  'nav.branding': { en: 'Branding', id: 'Branding' },
  'nav.integrations': { en: 'Integrations', id: 'Integrasi' },
  'nav.billing': { en: 'Billing', id: 'Tagihan' },
  'nav.bookings': { en: 'Bookings', id: 'Booking' },
  'nav.audit': { en: 'Audit Log', id: 'Log Audit' },
  'common.signout': { en: 'Sign out', id: 'Keluar' },
  'common.cancel': { en: 'Cancel', id: 'Batal' },
  'common.save': { en: 'Save', id: 'Simpan' },
  'common.create': { en: 'Create', id: 'Buat' },
  'common.edit': { en: 'Edit', id: 'Ubah' },
  'common.delete': { en: 'Delete', id: 'Hapus' },
  'common.loading': { en: 'Loading…', id: 'Memuat…' },
  'login.title': { en: 'Admin sign in', id: 'Masuk Admin' },
  'login.sub': { en: 'Administrator access only.', id: 'Khusus akses administrator.' },
};

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string; }
const C = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => { const s = localStorage.getItem('mn_admin_lang') as Lang | null; if (s) setLangState(s); }, []);
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('mn_admin_lang', l); };
  const t = (k: string) => DICT[k]?.[lang] ?? k;
  return <C.Provider value={{ lang, setLang, t }}>{children}</C.Provider>;
}
export const useI18n = () => useContext(C);

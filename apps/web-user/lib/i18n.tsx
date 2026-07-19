'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Lang } from './types';

type Dict = Record<string, { en: string; id: string }>;

// Foundation dictionary; EN is the source. Extend per view.
const DICT: Dict = {
  'nav.dashboard': { en: 'Dashboard', id: 'Dashboard' },
  'nav.book': { en: 'Book Room/Desk', id: 'Book Room/Desk' },
  'nav.bookings': { en: 'My Bookings', id: 'Booking Saya' },
  'nav.approval': { en: 'Approval', id: 'Approval' },
  'common.signout': { en: 'Sign out', id: 'Keluar' },
  'common.cancel': { en: 'Cancel', id: 'Batal' },
  'common.loading': { en: 'Loading…', id: 'Memuat…' },
  'common.book_now': { en: 'Book now', id: 'Book sekarang' },
  'common.request_booking': { en: 'Request booking', id: 'Ajukan booking' },
  'common.unavailable': { en: 'Unavailable', id: 'Tidak tersedia' },
  'login.title': { en: 'Sign in', id: 'Masuk' },
  'login.sub': { en: 'Use your workspace account to continue.', id: 'Gunakan akun workspace Anda untuk melanjutkan.' },
  'login.email': { en: 'Email', id: 'Email' },
  'login.password': { en: 'Password', id: 'Kata sandi' },
  'login.workspace': { en: 'Workspace', id: 'Workspace' },
  'login.submit': { en: 'Sign in', id: 'Masuk' },
  'login.tagline': { en: 'Meeting rooms & desks, booked in seconds.', id: 'Ruang meeting & desk, dipesan dalam hitungan detik.' },
  'dash.greeting': { en: 'Welcome back', id: 'Selamat datang kembali' },
  'dash.today': { en: 'Bookings today', id: 'Booking hari ini' },
  'dash.week': { en: 'Bookings this week', id: 'Booking minggu ini' },
  'dash.pending': { en: 'Awaiting approval', id: 'Menunggu approval' },
  'dash.rooms': { en: 'Rooms available', id: 'Ruang tersedia' },
  'dash.upcoming': { en: 'Upcoming bookings', id: 'Booking mendatang' },
  'dash.quickbook': { en: '+ Quick book', id: '+ Book cepat' },
  'book.search': { en: 'Search rooms, floor, or facilities…', id: 'Cari ruang, lantai, atau fasilitas…' },
  'book.all': { en: 'All', id: 'Semua' },
  'book.room': { en: 'Meeting Room', id: 'Meeting Room' },
  'book.desk': { en: 'Desk', id: 'Desk' },
  'book.needs_approval': { en: 'Needs approval', id: 'Perlu approval' },
  'book.available': { en: 'Available', id: 'Tersedia' },
  'modal.new_booking': { en: 'New booking', id: 'Booking baru' },
  'modal.title': { en: 'Title', id: 'Judul' },
  'modal.date': { en: 'Date', id: 'Tanggal' },
  'modal.start': { en: 'Start', id: 'Mulai' },
  'modal.end': { en: 'End', id: 'Selesai' },
  'modal.confirm': { en: 'Confirm booking', id: 'Konfirmasi booking' },
  'bookings.title': { en: 'My Bookings', id: 'Booking Saya' },
  'bookings.when': { en: 'When', id: 'Waktu' },
  'bookings.what': { en: 'Title', id: 'Judul' },
  'bookings.where': { en: 'Resource', id: 'Ruang' },
  'bookings.status': { en: 'Status', id: 'Status' },
  'bookings.action': { en: 'Action', id: 'Aksi' },
  'bookings.empty': { en: 'No bookings yet.', id: 'Belum ada booking.' },
  'appr.title': { en: 'Approval inbox', id: 'Kotak approval' },
  'appr.empty': { en: 'Nothing awaiting your decision.', id: 'Tidak ada yang menunggu keputusan Anda.' },
  'appr.approve': { en: 'Approve', id: 'Setujui' },
  'appr.reject': { en: 'Reject', id: 'Tolak' },
};

interface I18nCtx { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string; }
const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => {
    const saved = (localStorage.getItem('mn_lang') as Lang | null) ?? null;
    if (saved) setLangState(saved);
  }, []);
  const setLang = (l: Lang) => { setLangState(l); localStorage.setItem('mn_lang', l); };
  const t = (key: string) => DICT[key]?.[lang] ?? key;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

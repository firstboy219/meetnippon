import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/lib/toast';
import { AuthProvider } from '@/lib/auth';

/*
 * Self-hosted at build time. `display: swap` shows the fallback immediately
 * rather than leaving invisible text while a webfont loads, and only the latin
 * subset is fetched — Google's stylesheet references 37 files across every
 * unicode range.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MeetNippon — Room & Desk Booking',
  description: 'Book meeting rooms and desks in seconds.',
};

/** The portal is used on phones at doorways; let it use the full screen. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0E6E55',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

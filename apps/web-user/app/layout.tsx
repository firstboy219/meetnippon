import './globals.css';
import type { Metadata } from 'next';
import { I18nProvider } from '@/lib/i18n';
import { ToastProvider } from '@/lib/toast';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'MeetNippon — Room & Desk Booking',
  description: 'Book meeting rooms and desks in seconds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Booking, OnboardingState } from '@/lib/types';
import { fmtTime, fmtDate, todayLocal, localDateKey, getTenantTz } from '@/lib/format';
import WorkLocationChip from '@/components/WorkLocationChip';
import GettingStarted from '@/components/GettingStarted';

const STATUS_SWATCH: Record<string, string> = {
  APPROVED: 'available', PENDING: 'pending', WAITLIST: 'pending',
  REJECTED: 'booked', CANCELLED: 'booked', COMPLETED: 'available',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [hideGuide, setHideGuide] = useState(false);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    api.get<Booking[]>('/bookings').then(setBookings).catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadOnboarding = useCallback(() => {
    api.get<OnboardingState>('/me/profile/onboarding')
      .then(setOnboarding)
      .catch(() => setOnboarding(null)); // guidance is best-effort
  }, []);
  useEffect(() => {
    loadOnboarding();
    // The tour marks itself done on the server; refresh so the checklist ticks.
    const h = () => loadOnboarding();
    window.addEventListener('mn:onboarding', h);
    return () => window.removeEventListener('mn:onboarding', h);
  }, [loadOnboarding]);

  const stats = useMemo(() => {
    const tz = getTenantTz();
    const today = todayLocal(tz);
    const now = Date.now();
    const weekEnd = now + 7 * 86400000;
    const active = bookings.filter((b) => ['APPROVED', 'PENDING', 'WAITLIST'].includes(b.status));
    return {
      today: active.filter((b) => localDateKey(b.startTime, tz) === today).length,
      week: active.filter((b) => { const s = +new Date(b.startTime); return s >= now && s <= weekEnd; }).length,
      pending: bookings.filter((b) => b.status === 'PENDING').length,
    };
  }, [bookings]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => ['APPROVED', 'PENDING', 'WAITLIST'].includes(b.status) && +new Date(b.startTime) >= now)
      .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
      .slice(0, 5);
  }, [bookings]);

  return (
    <div>
      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : null}
      <div className="hero-band">
        <div>
          <h1>{t('dash.greeting')}, {user?.fullName?.split(' ')[0]}</h1>
          <p>{upcoming.length} {upcoming.length === 1 ? t('dash.upcoming_one') : t('dash.upcoming_many')}.</p>
          <WorkLocationChip />
        </div>
        <button className="btn hero-cta" onClick={() => router.push('/book')}>{t('dash.quickbook')}</button>
      </div>

      {/* Guidance for someone who has never booked anything. It retires itself
          once they do, so there is nothing to remember to turn off. */}
      {onboarding?.isNewUser && !hideGuide ? (
        <GettingStarted
          state={onboarding}
          onTour={() => window.dispatchEvent(new Event('mn:tour'))}
          onSkip={() => setHideGuide(true)}
        />
      ) : null}

      <div className="stat-row">
        <div className="card stat"><div className="num">{stats.today}</div><div className="lbl">{t('dash.today')}</div></div>
        <div className="card stat"><div className="num">{stats.week}</div><div className="lbl">{t('dash.week')}</div></div>
        <div className="card stat"><div className="num">{stats.pending}</div><div className="lbl">{t('dash.pending')}</div></div>
        <div className="card stat"><div className="num">{bookings.length}</div><div className="lbl">{t('dash.total')}</div></div>
      </div>

      <div className="card">
        <div className="section-head">
          <h3>{t('dash.upcoming')}</h3>
          <button type="button" className="link" onClick={() => router.push('/bookings')}>{t('nav.bookings')}</button>
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">{t('bookings.empty')}</div>
        ) : upcoming.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ width: 76, textAlign: 'center', fontFamily: 'Space Grotesk', fontWeight: 600, fontSize: 13, color: 'var(--teal-dark)' }}>
              {fmtTime(b.startTime)}<span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-soft)', fontWeight: 400, fontFamily: 'Inter' }}>{fmtDate(b.startTime)}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{b.resource?.name ?? (b.type === 'ONLINE' ? t('common.online') : '—')}</div>
            </div>
            <span className={`swatch ${STATUS_SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

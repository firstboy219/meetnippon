'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import type { Booking } from '@/lib/types';

/**
 * Read-only view of a booking, for clicking someone else's meeting on the
 * schedule/calendar — previously that click either did nothing or jumped
 * straight into a blank new-booking form with no indication of what was
 * already there (tester feedback #6).
 */
export default function BookingDetailModal({
  bookingId, fallbackTitle, fallbackOwner, fallbackStart, fallbackEnd,
  onClose, onRequestTime,
}: {
  bookingId: string;
  fallbackTitle: string;
  fallbackOwner?: string | null;
  fallbackStart: string;
  fallbackEnd: string;
  onClose: () => void;
  /** Omit to hide the "Request this time" action (e.g. once the meeting has ended). */
  onRequestTime?: () => void;
}) {
  const { t } = useI18n();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get<Booking>(`/bookings/${bookingId}`)
      .then((b) => { if (!cancelled) setBooking(b); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{booking?.title ?? fallbackTitle}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">
          {fmtDateTime(booking?.startTime ?? fallbackStart)} – {fmtDateTime(booking?.endTime ?? fallbackEnd)}
        </div>

        {loading ? (
          <div className="empty">{t('common.loading')}</div>
        ) : (
          <div className="creq-times" style={{ marginTop: 12 }}>
            {fallbackOwner ? (
              <div><span className="creq-label">{t('bd.organiser')}</span>{fallbackOwner}</div>
            ) : null}
            {booking?.resource?.name ? (
              <div><span className="creq-label">{t('bd.room')}</span>{booking.resource.name}</div>
            ) : null}
            {booking?.description ? (
              <div><span className="creq-label">{t('bd.notes')}</span>{booking.description}</div>
            ) : null}
            {booking?.meetingLink ? (
              <div>
                <span className="creq-label">{t('bd.link')}</span>
                <a href={booking.meetingLink} target="_blank" rel="noreferrer">{booking.meetingLink}</a>
              </div>
            ) : null}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {onRequestTime ? (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onRequestTime}>
              {t('sched.request_time')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" style={onRequestTime ? undefined : { flex: 1 }} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

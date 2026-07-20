'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Booking } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

const SWATCH: Record<string, string> = {
  APPROVED: 'available', COMPLETED: 'available', PENDING: 'pending',
  WAITLIST: 'pending', REJECTED: 'booked', CANCELLED: 'booked',
};
const CANCELLABLE = ['PENDING', 'APPROVED', 'WAITLIST'];

export default function BookingsPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    setLoading(true);
    // Only what is still ahead — everything finished lives in Riwayat/History,
    // which keeps this list bounded and every row actionable.
    api.get<Booking[]>('/bookings?scope=upcoming')
      .then(setBookings).catch(() => setErr(true)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function cancel(id: string) {
    setBusy(true);
    try {
      await api.post(`/bookings/${id}/cancel`, {});
      push(t('bookings.toast_cancelled'), 'success');
      setConfirmId(null);
      load();
    } catch (e: any) {
      push(e?.message || t('bookings.toast_cancel_fail'), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="empty">{t('common.loading')}</div>;
  if (err) {
    return (
      <div className="err-box err-row">
        <span>{t('common.load_error')}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-head">
        <h3>{t('bookings.title')}</h3>
        <Link href="/history" className="link">{t('bookings.see_history')}</Link>
      </div>
      {bookings.length === 0 ? (
        <div className="empty">{t('bookings.empty')}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('bookings.when')}</th>
              <th>{t('bookings.what')}</th>
              <th>{t('bookings.where')}</th>
              <th>{t('bookings.status')}</th>
              <th>{t('bookings.action')}</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td>{fmtDateTime(b.startTime)}</td>
                <td style={{ fontWeight: 600 }}>{b.title}</td>
                <td>{b.resource?.name ?? (b.type === 'ONLINE' ? 'Online' : '—')}</td>
                <td><span className={`swatch ${SWATCH[b.status] ?? 'pending'}`}><span className="dot" />{b.status}</span></td>
                <td>
                  {CANCELLABLE.includes(b.status) ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(b.id)}>{t('common.cancel')}</button>
                  ) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {confirmId ? (
        <ConfirmCancel busy={busy} onClose={() => setConfirmId(null)} onConfirm={() => cancel(confirmId)} />
      ) : null}
    </div>
  );
}

function ConfirmCancel({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{t('bookings.confirm_title')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <p className="modal-sub">{t('bookings.confirm_body')}</p>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('bookings.confirm_no')}</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
            {busy ? <span className="spinner" /> : t('bookings.confirm_yes')}
          </button>
        </div>
      </div>
    </div>
  );
}

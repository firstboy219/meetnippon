'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import type { Resource, Booking } from '@/lib/types';
import { todayUtc } from '@/lib/format';

type Filter = 'ALL' | 'ROOM' | 'DESK';

export default function BookPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Resource | null>(null);

  useEffect(() => { api.get<Resource[]>('/resources').then(setResources).catch(() => {}); }, []);

  const shown = useMemo(() => resources.filter((r) => {
    if (filter !== 'ALL' && r.type !== filter) return false;
    if (q && !`${r.name} ${r.category ?? ''} ${r.floor?.name ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [resources, filter, q]);

  const pills: [Filter, string][] = [['ALL', t('book.all')], ['ROOM', t('book.room')], ['DESK', t('book.desk')]];

  return (
    <div>
      <div className="toolbar">
        <input className="search" placeholder={t('book.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {pills.map(([f, label]) => (
          <div key={f} className={`filter-pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{label}</div>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">No resources found.</div>
      ) : (
        <div className="grid grid-3">
          {shown.map((r) => {
            const loc = [r.floor?.building?.name, r.floor?.name].filter(Boolean).join(', ');
            const needsApproval = (r.category ?? '').toLowerCase().includes('vip');
            return (
              <div key={r.id} className="card room-card">
                <div className="room-thumb">{r.name}</div>
                <div className="room-meta">
                  <div>
                    <div className="card-title">{r.name}</div>
                    <div className="card-sub">{loc || (r.type === 'DESK' ? 'Hot desk' : 'Room')} · {r.capacity} {r.type === 'DESK' ? 'seat' : 'ppl'}</div>
                  </div>
                  <span className={`swatch ${needsApproval ? 'pending' : 'available'}`}>
                    <span className="dot" />{needsApproval ? t('book.needs_approval') : t('book.available')}
                  </span>
                </div>
                {r.facilities?.length ? (
                  <div className="room-facil">{r.facilities.slice(0, 4).map((f) => <span key={f} className="facil-tag">{f}</span>)}</div>
                ) : null}
                <button className={`btn ${needsApproval ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setActive(r)}>
                  {needsApproval ? t('common.request_booking') : t('common.book_now')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {active ? <BookingModal resource={active} onClose={() => setActive(null)} onBooked={(msg) => { push(msg, 'success'); setActive(null); }} /> : null}
    </div>
  );
}

function BookingModal({ resource, onClose, onBooked }: { resource: Resource; onClose: () => void; onBooked: (msg: string) => void }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayUtc());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [busy, setBusy] = useState(false);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<Booking>('/bookings', {
        title,
        resourceId: resource.id,
        startTime: `${date}T${start}:00.000Z`,
        endTime: `${date}T${end}:00.000Z`,
      });
      onBooked(res.status === 'PENDING' ? 'Booking submitted for approval.' : 'Booking confirmed.');
    } catch (e: any) {
      push(e?.message || 'Could not create booking.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={confirm}>
        <div className="modal-head">
          <h3>{t('modal.new_booking')}</h3>
          <button type="button" className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-sub">{resource.name}{resource.floor?.name ? ` · ${resource.floor.name}` : ''}</div>
        <div className="f-group">
          <label className="f-label">{t('modal.title')}</label>
          <input className="f-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Team sync" />
        </div>
        <div className="f-group">
          <label className="f-label">{t('modal.date')}</label>
          <input className="f-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="f-row2">
          <div className="f-group">
            <label className="f-label">{t('modal.start')}</label>
            <input className="f-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="f-group">
            <label className="f-label">{t('modal.end')}</label>
            <input className="f-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="f-hint" style={{ marginBottom: 14 }}>Times are in workspace time (UTC).</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : t('modal.confirm')}</button>
        </div>
      </form>
    </div>
  );
}

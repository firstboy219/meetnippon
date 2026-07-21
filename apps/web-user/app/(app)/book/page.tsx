'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import type { Resource, Booking, Participant } from '@/lib/types';
import { todayLocal, zonedToUtcIso, getTenantTz, tzLabel } from '@/lib/format';
import Participants from '@/components/Participants';
import { toWire } from '@/lib/participants';
import { LoadingRegion, SkeletonCards } from '@/components/Skeleton';

type Filter = 'ALL' | 'ROOM' | 'DESK';

export default function BookPage() {
  const { t } = useI18n();
  const { push } = useToast();
  const router = useRouter();
  const [resources, setResources] = useState<Resource[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<Resource | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(() => {
    setErr(false);
    api.get<Resource[]>('/resources').then(setResources).catch(() => setErr(true));
  }, []);
  useEffect(() => { load(); }, [load]);

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
          <button type="button" key={f} className={`filter-pill ${filter === f ? 'active' : ''}`}
            aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>

      {err ? (
        <div className="err-box err-row">
          <span>{t('common.load_error')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>{t('common.retry')}</button>
        </div>
      ) : resources.length === 0 ? (
        <LoadingRegion label={t('common.loading')}><SkeletonCards count={6} /></LoadingRegion>
      ) : shown.length === 0 ? (
        <div className="empty">
          {t('book.none')}
          {q ? (
            <div className="empty-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setFilter('ALL'); }}>
                {t('book.clear_filters')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-3">
          {shown.map((r) => {
            const loc = [r.floor?.building?.name, r.floor?.name].filter(Boolean).join(', ');
            // Straight from the policy engine. Guessing this from the category
            // name meant switching approval off in admin changed nothing here.
            const needsApproval = r.policy?.requiresApproval ?? false;
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

      {active ? (
        <BookingModal resource={active} onClose={() => setActive(null)}
          onBooked={(msg, dayKey) => {
            push(msg, 'success');
            setActive(null);
            // Land on the calendar showing the day just booked, so the result
            // of the action is visible instead of only announced in a toast.
            router.push(`/calendar?d=${dayKey}`);
          }} />
      ) : null}
    </div>
  );
}

function BookingModal({ resource, onClose, onBooked }: {
  resource: Resource; onClose: () => void; onBooked: (msg: string, dayKey: string) => void;
}) {
  const { t } = useI18n();
  const { push } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [participants, setParticipants] = useState<Participant[]>([]);
  // The invite step is a real decision, so it gets its own screen rather than
  // a checkbox buried under the fold.
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Back out of the confirmation first, so a stray Esc cannot discard a
      // filled-in form.
      if (step === 'confirm') setStep('form');
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (participants.length > 0) { setStep('confirm'); return; }
    void submit();
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await api.post<Booking>('/bookings', {
        title,
        resourceId: resource.id,
        startTime: zonedToUtcIso(date, start, getTenantTz()),
        endTime: zonedToUtcIso(date, end, getTenantTz()),
        // toWire strips display-only fields; the API rejects unknown properties.
        ...(participants.length ? { participants: toWire(participants), notify } : {}),
      });
      const base = res.status === 'PENDING' ? t('book.toast_pending') : t('book.toast_confirmed');
      const n = participants.length && notify ? participants.length : 0;
      onBooked(n > 0 ? `${base} ${t('book.toast_notified').replace('{n}', String(n))}` : base, date);
    } catch (e: any) {
      push(e?.message || t('book.toast_fail'), 'error');
      setStep('form');
    } finally {
      setBusy(false);
    }
  }

  const policy = resource.policy;
  // A 00:00–23:59 window is the "no restriction" default; showing it would be
  // noise rather than guidance.
  const hours =
    policy?.businessHours && !(policy.businessHours.start === '00:00' && policy.businessHours.end === '23:59')
      ? policy.businessHours
      : null;
  const internal = participants.filter((p) => !p.external);
  const external = participants.filter((p) => p.external);

  if (step === 'confirm') {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>{t('invite.title')}</h3>
            <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
          </div>
          <p className="modal-sub">{t('invite.sub').replace('{n}', String(participants.length))}</p>

          <ul className="invite-list">
            {participants.map((p) => (
              <li key={p.email}>
                <span>{p.name || p.email}</span>
                {p.external ? <em>{t('part.external')}</em> : null}
              </li>
            ))}
          </ul>

          <label className="check-row">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span>{t('invite.send')}</span>
          </label>

          {notify && internal.length > 0 ? (
            <div className="info-box">{t('invite.inapp').replace('{n}', String(internal.length))}</div>
          ) : null}
          {notify && participants.length > 0 ? (
            <div className="info-box">{t('invite.email').replace('{n}', String(participants.length))}</div>
          ) : null}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setStep('form')}>{t('common.back')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? <span className="spinner" /> : t('invite.confirm')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={next}>
        <div className="modal-head">
          <h3>{t('modal.new_booking')}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-sub">{resource.name}{resource.floor?.name ? ` · ${resource.floor.name}` : ''}</div>
        <div className="f-group">
          <label className="f-label">{t('modal.title')}</label>
          <input className="f-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={t('modal.title_ph')} />
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
        <div className="f-hint" style={{ marginBottom: 14 }}>
          {t('modal.tz_hint')} ({tzLabel(getTenantTz())})
          {hours ? ` · ${t('modal.hours_hint')} ${hours.start}–${hours.end}` : ''}
        </div>

        <Participants value={participants} onChange={setParticipants} selfEmail={user?.email}
          allowExternal={policy?.allowExternalParticipants ?? true} />

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : participants.length ? t('modal.review') : t('modal.confirm')}
          </button>
        </div>
      </form>
    </div>
  );
}

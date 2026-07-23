'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Resource } from '@/lib/types';
import MeetingComposer from '@/components/MeetingComposer';
import { LoadingRegion, SkeletonCards } from '@/components/Skeleton';

type Filter = 'ALL' | 'ROOM' | 'DESK';

export default function BookPage() {
  const { t } = useI18n();
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
            // Restricted rooms stay visible — people should see they exist —
            // but the way in is closed unless the admin put you on the list.
            const blocked = r.policy ? r.policy.canBook === false : false;
            return (
              <div key={r.id} className="card room-card">
                <div className="room-thumb">{r.name}</div>
                <div className="room-meta">
                  <div>
                    <div className="card-title">{r.name}</div>
                    <div className="card-sub">{loc || (r.type === 'DESK' ? 'Hot desk' : 'Room')} · {r.capacity} {r.type === 'DESK' ? 'seat' : 'ppl'}</div>
                  </div>
                  <span className={`swatch ${blocked ? 'maintenance' : needsApproval ? 'pending' : 'available'}`}>
                    <span className="dot" />{blocked ? t('book.restricted') : needsApproval ? t('book.needs_approval') : t('book.available')}
                  </span>
                </div>
                {r.facilities?.length ? (
                  <div className="room-facil">{r.facilities.slice(0, 4).map((f) => <span key={f} className="facil-tag">{f}</span>)}</div>
                ) : null}
                {blocked ? (
                  <button className="btn btn-ghost" disabled title={t('book.restricted_hint')}>
                    {t('book.restricted')}
                  </button>
                ) : (
                  <button className={`btn ${needsApproval ? 'btn-ghost' : 'btn-primary'}`} onClick={() => setActive(r)}>
                    {needsApproval ? t('common.request_booking') : t('common.book_now')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {active ? (
        <MeetingComposer
          resourceId={active.id}
          resourceName={active.name}
          resourceFloor={active.floor?.name ?? null}
          onClose={() => setActive(null)}
          onBooked={({ dayKey }) => {
            setActive(null);
            // Land on the calendar showing the day just booked, so the result
            // of the action is visible instead of only announced in a toast.
            router.push(`/calendar?d=${dayKey}`);
          }} />
      ) : null}
    </div>
  );
}

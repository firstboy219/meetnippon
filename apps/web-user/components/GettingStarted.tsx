'use client';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import type { OnboardingState } from '@/lib/types';

/**
 * Persistent in-app guidance for someone who has not booked anything yet.
 *
 * The one-time tour is easy to skip and impossible to find again at the moment
 * it would help, so the real guidance lives here: a short checklist tied to
 * actual state, each row a link to the place that completes it. It disappears
 * on its own once the person has made a booking — no dismissal to manage.
 */
export default function GettingStarted({ state, onTour, onSkip }: {
  state: OnboardingState;
  onTour: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();

  const items: { key: string; done: boolean; label: string; action: () => void; cta: string }[] = [
    {
      key: 'tour', done: state.steps.tour, label: t('gs.tour'),
      action: onTour, cta: t('gs.tour_cta'),
    },
    {
      key: 'firstBooking', done: state.steps.firstBooking, label: t('gs.book'),
      action: () => router.push('/book'), cta: t('gs.book_cta'),
    },
    {
      key: 'workLocation', done: state.steps.workLocation, label: t('gs.where'),
      action: () => router.push('/dashboard'), cta: t('gs.where_cta'),
    },
    {
      key: 'profilePhoto', done: state.steps.profilePhoto, label: t('gs.photo'),
      action: () => router.push('/profile'), cta: t('gs.photo_cta'),
    },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="card gs-card">
      <div className="gs-head">
        <div>
          <h3 className="gs-title">{t('gs.title')}</h3>
          <p className="gs-sub">{t('gs.sub')}</p>
        </div>
        <div className="gs-progress" aria-label={`${doneCount}/${items.length}`}>
          <strong>{doneCount}</strong>/{items.length}
        </div>
      </div>

      <ol className="gs-list">
        {items.map((it) => (
          <li key={it.key} className={`gs-item ${it.done ? 'done' : ''}`}>
            <span className="gs-check" aria-hidden="true">{it.done ? '✓' : ''}</span>
            <span className="gs-label">{it.label}</span>
            {it.done ? (
              <span className="gs-done-tag">{t('gs.done')}</span>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={it.action}>{it.cta}</button>
            )}
          </li>
        ))}
      </ol>

      <button type="button" className="gs-dismiss" onClick={onSkip}>{t('gs.dismiss')}</button>
    </div>
  );
}

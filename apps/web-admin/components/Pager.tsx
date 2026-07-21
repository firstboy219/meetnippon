'use client';
import { useI18n } from '@/lib/i18n';

/**
 * Page control for admin tables.
 *
 * Always states the total, because the point of adding paging here was that the
 * old lists were silently truncated — "1–25 of 1,432" is the part that tells an
 * admin there is more than what they can see.
 */
export default function Pager({ page, pages, total, pageSize, busy, onPage }: {
  page: number; pages: number; total: number; pageSize: number;
  busy?: boolean; onPage: (next: number) => void;
}) {
  const { t } = useI18n();
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pager">
      <div className="pager-count">
        {first}–{last} {t('page.of')} {total.toLocaleString()}
      </div>
      <div className="pager-controls">
        <button type="button" className="btn btn-ghost btn-sm"
          disabled={busy || page <= 1} onClick={() => onPage(1)} aria-label={t('page.first')}>«</button>
        <button type="button" className="btn btn-ghost btn-sm"
          disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t('page.prev')}</button>
        <span className="pager-pos">{t('page.page')} {page} / {pages}</span>
        <button type="button" className="btn btn-ghost btn-sm"
          disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>{t('page.next')}</button>
        <button type="button" className="btn btn-ghost btn-sm"
          disabled={busy || page >= pages} onClick={() => onPage(pages)} aria-label={t('page.last')}>»</button>
      </div>
    </div>
  );
}

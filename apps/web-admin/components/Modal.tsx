'use client';
import React, { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * When `formId` is supplied the footer renders a real submit button bound to the
 * page's <form id={formId}>, so native `required` validation runs before save.
 */
export function Modal({ title, sub, onClose, children, footer, small, formId, submitLabel, busy }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; small?: boolean;
  formId?: string; submitLabel?: string; busy?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className={`modal ${small ? 'modal-sm' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="close" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        {sub ? <div className="modal-sub">{sub}</div> : null}
        {children}
        {formId ? (
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : (submitLabel ?? t('common.save'))}
            </button>
          </div>
        ) : footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Small bilingual confirmation dialog for destructive actions. */
export function ConfirmModal({ title, body, confirmLabel, busy, onClose, onConfirm }: {
  title: string; body: string; confirmLabel?: string; busy?: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={title} sub={body} onClose={onClose} small
      footer={<>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
          {busy ? <span className="spinner" /> : (confirmLabel ?? t('common.confirm'))}
        </button>
      </>}>
      {null}
    </Modal>
  );
}

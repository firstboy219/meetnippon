'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useI18n } from './i18n';
import { api, getLastApiError } from './api';

type Kind = 'success' | 'error' | 'info';
type ReportState = 'idle' | 'sending' | 'sent' | 'failed';

/** What actually gets sent if the reporter clicks "Report" — captured once,
 *  at push() time, not re-read later when it may no longer be accurate. */
interface ErrorDetail {
  message: string;
  route: string;
  userAgent: string;
  status?: number;
  endpoint?: string;
  method?: string;
  stack?: string;
}

interface Toast {
  id: number; kind: Kind; text: string;
  detail?: ErrorDetail; reportState?: ReportState;
}

const Ctx = createContext<{ push: (t: string, k?: Kind) => void }>({ push: () => {} });

/**
 * How stale the last API failure is allowed to be before a fresh error
 * toast still attaches it. A catch block runs synchronously right after its
 * throw, so a genuinely related error is always well under this — anything
 * older is a coincidence and would just mislabel an unrelated failure.
 */
const ATTACH_WINDOW_MS = 1500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    let detail: ErrorDetail | undefined;
    if (kind === 'error') {
      const last = getLastApiError();
      const fresh = last && Date.now() - last.at < ATTACH_WINDOW_MS;
      detail = {
        message: text,
        route: pathname || '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ...(fresh ? { status: last!.status, endpoint: last!.endpoint, method: last!.method, stack: last!.stack } : {}),
      };
    }
    setToasts((ts) => [...ts, { id, kind, text, detail }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 10000 : 3200);
  }, [dismiss, pathname]);

  const reportError = useCallback(async (id: number, detail?: ErrorDetail) => {
    if (!detail) return;
    setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, reportState: 'sending' } : x)));
    try {
      await api.post('/error-reports', { app: 'web-admin', ...detail });
      setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, reportState: 'sent' } : x)));
    } catch {
      setToasts((ts) => ts.map((x) => (x.id === id ? { ...x, reportState: 'failed' } : x)));
    }
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((item) => (
          item.kind === 'error' ? (
            <div key={item.id} className="toast error toast-rich">
              <div className="toast-head">
                <span className="toast-icon">!</span>
                <span className="toast-title">{t('toast.error_title')}</span>
                <button type="button" className="toast-close" onClick={() => dismiss(item.id)} aria-label={t('common.close')}>×</button>
              </div>
              <div className="toast-body">{item.text}</div>
              <div className="toast-actions">
                {item.reportState === 'sent' ? (
                  <span className="toast-reported">✓ {t('toast.reported')}</span>
                ) : (
                  <button type="button" className="toast-report-btn"
                    disabled={item.reportState === 'sending'}
                    onClick={() => reportError(item.id, item.detail)}>
                    {item.reportState === 'sending' ? t('toast.reporting')
                      : item.reportState === 'failed' ? t('toast.report_retry')
                        : t('toast.report')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key={item.id} className={`toast ${item.kind}`} onClick={() => dismiss(item.id)} title="Dismiss">
              <span>{item.kind === 'success' ? '✓' : 'ℹ'}</span>{item.text}
            </div>
          )
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

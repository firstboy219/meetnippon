'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; text: string; }
const Ctx = createContext<{ push: (t: string, k?: Kind) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((text: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => dismiss(id), 3200);
  }, [dismiss]);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} title="Dismiss">
            <span>{t.kind === 'success' ? '✓' : t.kind === 'error' ? '!' : 'ℹ'}</span>{t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

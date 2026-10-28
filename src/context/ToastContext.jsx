import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ToastContext = createContext(null);
const EXIT_MS = 350;

const TONES = {
  success: ['bg-emerald-500', 'M20 6L9 17l-5-5'],
  error: ['bg-rose-500', 'M12 8v5M12 16.5v.5'],
  info: ['bg-brand-500', 'M12 11v6M12 7.5v.5'],
};

// iOS-style banners: drop in just under the header, slide back up when done
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    (message, tone) => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 5000 : 3000);
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4 sm:top-[calc(5.5rem+env(safe-area-inset-top))]"
          aria-live="polite"
        >
          {toasts.map((t) => {
            const [dot, path] = TONES[t.tone];
            return (
              <button
                type="button"
                key={t.id}
                role={t.tone === 'error' ? 'alert' : 'status'}
                onClick={() => dismiss(t.id)}
                className={`${t.leaving ? 'toast-out' : 'toast-in'} glass pointer-events-auto flex max-w-sm items-center gap-3 rounded-[22px] !bg-[rgb(var(--card)/0.78)] py-2.5 pl-2.5 pr-4 text-left text-[14px] font-medium text-ink`}
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white ${dot}`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={path} />
                  </svg>
                </span>
                {t.message}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

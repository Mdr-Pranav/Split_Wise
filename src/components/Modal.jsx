import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EXIT_MS = 180;

// Glass dialog rendered into <body> (the header's backdrop-filter would
// otherwise trap position: fixed). Animates in and out, closes on Esc or a
// backdrop click, and hands focus back to whatever opened it. Tall dialogs
// scroll inside the overlay (my-auto centres short ones without clipping tall ones).
export default function Modal({ open, onClose, labelledBy, className = 'max-w-md', children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef(null);
  const overlayRef = useRef(null);
  const returnFocusRef = useRef(null);
  // Latest onClose without re-running the open effect (which moves focus) on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        returnFocusRef.current?.focus?.({ preventScroll: true });
      }, EXIT_MS);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    // No page scroll lock (toggling overflow resizes the page). Instead the
    // overlay swallows wheel/touch scrolling unless the dialog itself overflows.
    const overlay = overlayRef.current;
    const swallow = (e) => {
      if (overlay.scrollHeight <= overlay.clientHeight) e.preventDefault();
    };
    overlay?.addEventListener('wheel', swallow, { passive: false });
    overlay?.addEventListener('touchmove', swallow, { passive: false });
    const panel = panelRef.current;
    (panel?.querySelector('input, select, textarea') || panel?.querySelector('button, [href]'))?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('wheel', swallow);
      overlay?.removeEventListener('touchmove', swallow);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-4 pt-20 sm:pt-4">
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm ${closing ? 'modal-backdrop-out' : 'modal-backdrop-in'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full rounded-[28px] p-6 glass sm:my-auto sm:p-7 ${className} ${closing ? 'modal-out' : 'modal-in'}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-surface-elevated hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

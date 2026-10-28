import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const EXIT_MS = 300;
// How far a sheet must be dragged down before letting go closes it
const DISMISS_PX = 110;

// iOS-style dialog rendered into <body> (the header's backdrop-filter would
// otherwise trap position: fixed). Phones get a bottom sheet with a grabber
// that can be dragged down to dismiss; wider screens get a centred card.
// Closes on Esc or a backdrop tap and hands focus back to what opened it.
export default function Modal({ open, onClose, labelledBy, className = 'max-w-md', children }) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const panelRef = useRef(null);
  const overlayRef = useRef(null);
  const returnFocusRef = useRef(null);
  const dragStart = useRef(null);
  // Latest onClose without re-running the open effect (which moves focus) on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      setMounted(true);
      setClosing(false);
      setDrag(0);
    } else if (mounted) {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
        setDrag(0);
        returnFocusRef.current?.focus?.({ preventScroll: true });
      }, EXIT_MS);
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    // No page scroll lock (toggling overflow resizes the page). The overlay
    // swallows wheel/touch scrolling unless the dialog itself can scroll.
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    const swallow = (e) => {
      const panelScrolls = panel?.contains(e.target) && panel.scrollHeight > panel.clientHeight;
      if (!panelScrolls && overlay.scrollHeight <= overlay.clientHeight) e.preventDefault();
    };
    overlay?.addEventListener('wheel', swallow, { passive: false });
    overlay?.addEventListener('touchmove', swallow, { passive: false });
    // Phones: don't pop the keyboard up over a sheet that just opened
    if (window.matchMedia('(min-width: 640px)').matches) {
      (panel?.querySelector('input, select, textarea') || panel?.querySelector('button, [href]'))?.focus({ preventScroll: true });
    } else {
      panel?.focus({ preventScroll: true });
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('wheel', swallow);
      overlay?.removeEventListener('touchmove', swallow);
    };
  }, [mounted]);

  // Grabber drag (phones)
  const onPointerDown = (e) => {
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (dragStart.current == null) return;
    setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (drag > DISMISS_PX) onCloseRef.current();
    else setDrag(0);
  };

  if (!mounted) return null;
  const dragging = dragStart.current != null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:overflow-y-auto sm:overscroll-contain sm:p-4"
    >
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-[3px] ${closing ? 'modal-backdrop-out' : 'modal-backdrop-in'}`}
        style={drag ? { opacity: Math.max(0.2, 1 - drag / 400) } : undefined}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`glass relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[30px] !bg-[rgb(var(--card)/0.82)] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 outline-none sm:my-auto sm:max-h-none sm:overflow-visible sm:rounded-[30px] sm:!bg-[rgb(var(--card)/0.72)] sm:p-7 ${className} ${
          closing ? 'modal-out' : 'modal-in'
        }`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: dragging ? 'none' : 'transform 0.4s var(--ease-ios)' } : undefined}
      >
        {/* Grabber: drag down to dismiss (phones) */}
        <div
          className="-mx-5 mb-1 flex cursor-grab touch-none justify-center pb-2 pt-1 sm:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span className="h-[5px] w-9 rounded-full bg-[rgb(var(--line)/0.3)]" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[rgb(var(--line)/0.08)] text-slate-500 transition-[transform,background-color] duration-300 hover:bg-[rgb(var(--line)/0.14)] hover:text-ink active:scale-90 sm:right-5 sm:top-5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

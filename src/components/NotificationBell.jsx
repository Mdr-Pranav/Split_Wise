import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import BucketIcon from './BucketIcon';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { timeAgo } from '../lib/dates';
import { notifyPaymentsChanged, useInbox } from '../context/InboxContext';
import { useToast } from '../context/ToastContext';

// Header bell: payments people say they made to the user (nothing clears
// until the user confirms it here) and reminders from people they owe.
export default function NotificationBell() {
  const { items, nudges } = useInbox();
  const navigate = useNavigate();
  const toast = useToast();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  // Panel hangs under the header pill, right-aligned with it. It's portalled
  // to <body> because the header's backdrop-filter would trap a fixed child.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const nav = buttonRef.current?.closest('nav')?.getBoundingClientRect();
      if (nav) setPos({ top: nav.bottom + 10, right: window.innerWidth - nav.right });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const respond = async (item, accept) => {
    setBusy(item.batch_id);
    try {
      await api.respondPayment(item.batch_id, accept);
      toast.success(accept ? `Confirmed ${formatMoney(Number(item.total), item.currency)} from ${item.from_name}` : 'Payment declined');
      notifyPaymentsChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (n) => {
    setBusy(n.id);
    try {
      await api.dismissNudge(n.id);
      notifyPaymentsChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  // Opens the group with Settle up pre-filled for paying this person
  const settle = (n) => {
    setOpen(false);
    navigate(`/groups/${n.group_id}?settle=${n.from_user}`);
  };

  const count = items.length + nudges.length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={count ? `${count} notification${count === 1 ? '' : 's'}` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors sm:h-10 sm:w-10 ${
          open ? 'bg-surface-elevated text-ink' : 'text-slate-600 hover:bg-surface-elevated hover:text-ink'
        }`}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" strokeWidth={2} />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-[rgb(var(--card))] sm:right-1 sm:top-1">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            style={{ top: pos.top, right: pos.right }}
            className="modal-in glass fixed z-50 flex max-h-[min(70vh,560px)] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px]"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <div>
                <h2 className="text-[16px] font-semibold text-ink">Notifications</h2>
                <p className="text-[12px] text-slate-500">Payments to confirm and friendly reminders.</p>
              </div>
              {count > 0 && <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[12px] font-semibold text-rose-600">{count}</span>}
            </div>

            {count === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <Icon name="check" className="h-6 w-6" strokeWidth={2.2} />
                </div>
                <p className="text-[15px] font-medium text-ink">You're all caught up</p>
                <p className="mt-1 text-[13px] text-slate-500">When someone says they paid you or nudges you, it shows up here.</p>
              </div>
            ) : (
              <div className="overflow-y-auto overscroll-contain">
              {items.length > 0 && <SectionLabel>Payments to confirm</SectionLabel>}
              <ul className="divide-y divide-surface-border">
                {items.map((item) => (
                  <li key={item.batch_id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Avatar id={item.from_user} name={item.from_name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug text-slate-600">
                          <span className="font-semibold text-ink">{item.from_name}</span> says they paid you
                        </p>
                        <p className="text-[22px] font-semibold tracking-[-0.02em] text-ink">{formatMoney(Number(item.total), item.currency)}</p>
                        <p className="truncate text-[12px] text-slate-500">
                          <Link to={`/groups/${item.group_id}`} className="font-medium hover:text-ink">{item.group_name}</Link> · {timeAgo(item.created_at)}
                          {item.note && ` · ${item.note}`}
                        </p>
                      </div>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {item.buckets.map((b) => (
                        <li key={b.bucket} className="inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/70 py-0.5 pl-0.5 pr-2.5 text-[12px] font-medium text-ink">
                          <BucketIcon name={b.bucket} size="sm" className="!h-6 !w-6 !rounded-full" />
                          {b.bucket} · {formatMoney(Number(b.amount), item.currency)}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy === item.batch_id} onClick={() => respond(item, false)} className="btn-secondary flex-1 !py-2">
                        Decline
                      </button>
                      <button type="button" disabled={busy === item.batch_id} onClick={() => respond(item, true)} className="btn-primary flex-1 !py-2">
                        <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Confirm
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {nudges.length > 0 && <SectionLabel>Reminders</SectionLabel>}
              <ul className="divide-y divide-surface-border">
                {nudges.map((n) => (
                  <li key={n.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <span className="relative flex-shrink-0">
                        <Avatar id={n.from_user} name={n.from_name} />
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-[rgb(var(--card))]">
                          <Icon name="bell" className="h-3 w-3" strokeWidth={2.6} />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] leading-snug text-slate-600">
                          <span className="font-semibold text-ink">{n.from_name}</span> nudged you about{' '}
                          <span className="font-semibold text-ink">{formatMoney(Number(n.amount), n.currency)}</span>
                        </p>
                        <p className="truncate text-[12px] text-slate-500">
                          {n.group_name} · {n.buckets.map((b) => b.bucket).join(', ')} · {timeAgo(n.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy === n.id} onClick={() => dismiss(n)} className="btn-secondary flex-1 !py-2">
                        Dismiss
                      </button>
                      <button type="button" onClick={() => settle(n)} className="btn-primary flex-1 !py-2">
                        <Icon name="swap" className="h-4 w-4" /> Settle up
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function SectionLabel({ children }) {
  return <p className="bg-surface-elevated/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</p>;
}

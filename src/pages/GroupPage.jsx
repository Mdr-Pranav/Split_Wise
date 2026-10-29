import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { notifyPaymentsChanged, usePaymentsChanged } from '../context/InboxContext';
import { notifyGroupsChanged } from '../context/GroupsContext';
import { rememberLooks } from '../lib/avatars';
import { api } from '../lib/api';
import { bucketDebts, debtsByPair, formatMoney, fromCents, pendingKey, pendingPayments, toCents } from '../lib/money';
import { bucketStyle, bucketsForGroup } from '../lib/buckets';
import { monthLabel, shortDate } from '../lib/dates';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import BucketIcon from '../components/BucketIcon';
import Skeleton from '../components/Skeleton';
import Segmented from '../components/Segmented';
import ConfirmModal from '../components/ConfirmModal';
import ExpenseModal from '../components/ExpenseModal';
import SettleModal from '../components/SettleModal';
import GroupSettings from '../components/GroupSettings';
import GroupDashboard from '../components/GroupDashboard';
import Switch from '../components/Switch';
import { GlowCard } from '../components/Glow';

function DateBadge({ ymd }) {
  const [, m, d] = ymd.split('-').map(Number);
  const mon = new Date(2000, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
  return (
    <div className="flex w-10 flex-shrink-0 flex-col items-center leading-none">
      <span className="text-[11px] font-medium uppercase text-slate-500">{mon}</span>
      <span className="mt-0.5 text-[18px] font-semibold text-ink">{d}</span>
    </div>
  );
}

function ExpenseRow({ expense, me, nameOf, currency, onClick }) {
  const amount = Number(expense.amount);
  const myShare = Number(expense.expense_splits.find((s) => s.user_id === me)?.amount || 0);
  const paidByMe = expense.paid_by === me;
  const lent = paidByMe ? amount - myShare : 0;
  let mine;
  if (paidByMe && lent > 0.004) mine = <span className="text-emerald-600">you lent {formatMoney(lent, currency)}</span>;
  else if (!paidByMe && myShare > 0) mine = <span className="text-rose-600">you owe {formatMoney(myShare, currency)}</span>;
  else mine = <span className="text-slate-400">not involved</span>;

  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-surface-elevated/70 sm:gap-4 sm:px-3">
      <DateBadge ymd={expense.expense_date} />
      <BucketIcon name={expense.bucket} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">
          {expense.bucket}
          {expense.note && <span className="font-normal text-slate-500"> · {expense.note}</span>}
        </span>
        <span className="block truncate text-[13px] text-slate-500">
          {paidByMe ? 'You' : nameOf(expense.paid_by)} paid {formatMoney(amount, currency)}
        </span>
      </span>
      <span className="text-right text-[13px] font-medium leading-tight sm:text-[14px]">{mine}</span>
    </button>
  );
}

const PAYMENT_BADGE = {
  confirmed: ['bg-emerald-500', 'check'],
  pending: ['bg-amber-500', 'clock'],
  rejected: ['bg-slate-400', 'x'],
};

function SettlementRow({ s, me, nameOf, currency, onClick }) {
  const from = s.from_user === me ? 'You' : nameOf(s.from_user);
  const to = s.to_user === me ? 'you' : nameOf(s.to_user);
  const [badgeBg, badgeIcon] = PAYMENT_BADGE[s.status];
  // In a "settle everything" batch the net receiver confirms every row
  const confirmer = s.confirm_by ?? s.to_user;
  const status =
    s.status === 'pending'
      ? confirmer === me
        ? 'Waiting for you to confirm'
        : `Waiting for ${nameOf(confirmer)} to confirm`
      : s.status === 'rejected'
        ? `Declined by ${confirmer === me ? 'you' : nameOf(confirmer)}`
        : null;
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors hover:bg-surface-elevated/70 sm:gap-4 sm:px-3 ${s.status === 'rejected' ? 'opacity-60' : ''}`}>
      <DateBadge ymd={s.settled_on} />
      <span className="relative flex-shrink-0">
        <BucketIcon name={s.bucket} />
        <span className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-[rgb(var(--card))] ${badgeBg}`}>
          <Icon name={badgeIcon} className="h-3 w-3" strokeWidth={3} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">
          <span className="font-medium">{from}</span> paid <span className="font-medium">{to}</span>
        </span>
        <span className="block truncate text-[13px] text-slate-500">
          {status ? <span className={s.status === 'pending' ? 'font-medium text-amber-600' : ''}>{status}</span> : s.bucket}
          {status && ` · ${s.bucket}`}
          {s.note && ` · ${s.note}`}
        </span>
      </span>
      <span
        className={`text-[14px] font-semibold ${
          s.status === 'confirmed' ? 'text-emerald-600' : s.status === 'pending' ? 'text-amber-600' : 'text-slate-500 line-through'
        }`}
      >
        {formatMoney(Number(s.amount), currency)}
      </span>
    </button>
  );
}

// A finished smart settle in the activity feed: one entry for the whole thing
function SmartRow({ plan, me, nameOf, currency }) {
  const ts = plan.smart_transfers || [];
  const date = (plan.finished_at || plan.created_at).slice(0, 10);
  return (
    <div className="flex w-full items-start gap-3 rounded-2xl px-2 py-3 sm:gap-4 sm:px-3">
      <DateBadge ymd={date} />
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
        <Icon name="sparkle" className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-ink">Smart settle · everyone cleared</span>
        <span className="block text-[13px] text-slate-500">
          {ts.map((t) => `${t.from_user === me ? 'You' : nameOf(t.from_user)} → ${t.to_user === me ? 'you' : nameOf(t.to_user)} ${formatMoney(Number(t.amount), currency)}`).join(' · ')}
        </span>
      </span>
    </div>
  );
}

// One person's debt to another, broken into buckets that clear separately
// `nudge` (only when the viewer is owed): { state: 'ready' | 'sent' | 'wait', days }
function DebtCard({ pair, me, nameOf, currency, pending, canSettle, onClear, onClearAll, nudge, onNudge }) {
  const tone = pair.debtor === me ? 'text-rose-600' : pair.creditor === me ? 'text-emerald-600' : 'text-ink';
  const creditor = pair.creditor === me ? 'you' : nameOf(pair.creditor);
  const rows = pair.buckets.map((b) => {
    const waiting = pending.get(pendingKey(pair.debtor, pair.creditor, b.bucket)) || 0;
    return { ...b, waiting, payable: b.cents - waiting };
  });
  const payableBuckets = rows.filter((r) => r.payable > 0);
  return (
    <li className="rounded-2xl bg-[rgb(var(--line)/0.05)] p-3">
      <div className="flex items-center gap-2.5 px-1 pb-2">
        <div className="flex -space-x-2">
          <Avatar id={pair.debtor} name={nameOf(pair.debtor)} size="sm" />
          <Avatar id={pair.creditor} name={nameOf(pair.creditor)} size="sm" />
        </div>
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-slate-600">
          <span className="font-medium text-ink">{pair.debtor === me ? 'You' : nameOf(pair.debtor)}</span> owe{pair.debtor === me ? '' : 's'}{' '}
          <span className="font-medium text-ink">{creditor}</span>
        </p>
        {/* No nudging someone whose payment is already waiting for the viewer to confirm */}
        {nudge && payableBuckets.length > 0 && (
          <button
            type="button"
            onClick={onNudge}
            disabled={nudge.state !== 'ready'}
            title={
              nudge.state === 'sent'
                ? 'Nudged in the last day. You can nudge again tomorrow.'
                : nudge.state === 'wait'
                  ? `This debt is too new. Nudges unlock in ${nudge.days} day${nudge.days === 1 ? '' : 's'}.`
                  : `Send ${nameOf(pair.debtor)} a reminder in their bell`
            }
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-amber-600 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500 hover:text-white disabled:pointer-events-none disabled:text-slate-400 disabled:ring-line/10"
          >
            <Icon name="bell" className="h-3.5 w-3.5" />
            {nudge.state === 'sent' ? 'Nudged' : nudge.state === 'wait' ? `${nudge.days}d` : 'Nudge'}
          </button>
        )}
        <span className={`text-[16px] font-semibold tabular-nums ${tone}`}>{formatMoney(fromCents(pair.cents), currency)}</span>
      </div>
      <ul className="divide-y divide-surface-border rounded-xl bg-surface-card ring-1 ring-line/[0.06]">
        {rows.map((b) => (
          <li key={b.bucket} className="flex items-center gap-2.5 px-2.5 py-2">
            <BucketIcon name={b.bucket} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">{b.bucket}</span>
              {b.waiting > 0 && b.payable > 0 && (
                <span className="block truncate text-[12px] font-medium text-amber-600" title={`Waiting for ${creditor} to confirm`}>
                  {formatMoney(fromCents(b.waiting), currency)} sent, unconfirmed
                </span>
              )}
            </span>
            <span className="text-[14px] tabular-nums text-ink">{formatMoney(fromCents(b.cents), currency)}</span>
            {canSettle &&
              (b.payable > 0 ? (
                <button type="button" onClick={() => onClear(b.bucket)} className="rounded-full px-2.5 py-1 text-[13px] font-medium text-brand-600 ring-1 ring-brand-500/30 transition-colors hover:bg-brand-500 hover:text-white">
                  Clear
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[12px] font-medium text-amber-600">
                  <Icon name="clock" className="h-3.5 w-3.5" /> Pending
                </span>
              ))}
          </li>
        ))}
      </ul>
      {canSettle && payableBuckets.length > 1 && (
        <button type="button" onClick={() => onClearAll(payableBuckets)} className="btn-secondary mt-2 w-full !py-2 !text-[13px]">
          Clear all {payableBuckets.length} buckets · {formatMoney(fromCents(payableBuckets.reduce((a, r) => a + r.payable, 0)), currency)}
        </button>
      )}
    </li>
  );
}

// Right-hand panel: what the viewer owes / is owed, every debt in the group,
// or spending per bucket (tapping a bucket filters the activity feed)
function BalancesPanel({ view, onView, pairs, expenses, me, nameOf, currency, pending, isOwner, onClear, onClearAll, onPickBucket, nudgeFor, onNudge, onSettleAll, paused }) {
  const mine = pairs.filter((p) => p.debtor === me || p.creditor === me);
  // People the viewer owes AND who owe the viewer: offer to net it all out
  const twoWay = useMemo(() => {
    const byPerson = new Map();
    for (const p of mine) {
      const other = p.debtor === me ? p.creditor : p.debtor;
      const row = byPerson.get(other) || { other, owe: 0, owed: 0 };
      // Only what's still payable (not already waiting for confirmation)
      const payable = p.buckets.reduce((a, b) => a + Math.max(0, b.cents - (pending.get(pendingKey(p.debtor, p.creditor, b.bucket)) || 0)), 0);
      if (p.debtor === me) row.owe += payable;
      else row.owed += payable;
      byPerson.set(other, row);
    }
    return [...byPerson.values()].filter((r) => r.owe > 0 && r.owed > 0);
  }, [mine, me, pending]);
  const owe = mine.filter((p) => p.debtor === me).reduce((a, p) => a + p.cents, 0);
  const owed = mine.filter((p) => p.creditor === me).reduce((a, p) => a + p.cents, 0);

  const spending = useMemo(() => {
    const map = new Map();
    for (const e of expenses) {
      const row = map.get(e.bucket) || { bucket: e.bucket, cents: 0, mine: 0, count: 0 };
      row.cents += toCents(e.amount);
      row.mine += toCents(e.expense_splits.find((sp) => sp.user_id === me)?.amount || 0);
      row.count += 1;
      map.set(e.bucket, row);
    }
    return [...map.values()].sort((a, b) => b.cents - a.cents);
  }, [expenses, me]);
  const spentTotal = spending.reduce((a, r) => a + r.cents, 0);

  const list = (rows) => (
    <ul className="space-y-3">
      {rows.map((pair) => (
        <DebtCard
          key={`${pair.debtor}>${pair.creditor}`}
          pair={pair}
          me={me}
          nameOf={nameOf}
          currency={currency}
          pending={pending}
          canSettle={isOwner || pair.debtor === me || pair.creditor === me}
          onClear={(bucket) => onClear(pair, bucket)}
          onClearAll={(rows2) => onClearAll(pair, rows2)}
          nudge={pair.creditor === me ? nudgeFor(pair.debtor) : null}
          onNudge={() => onNudge(pair.debtor)}
        />
      ))}
    </ul>
  );

  const empty = (text) => (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
        <Icon name="check" className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <p className="text-[14px] text-slate-600">{text}</p>
    </div>
  );

  return (
    <section className="card flex h-full flex-col overflow-hidden !p-0">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="text-[16px] font-semibold text-ink">Balances</h2>
        <Segmented
          label="Balance view"
          value={view}
          onChange={onView}
          options={[
            { value: 'you', label: 'You' },
            { value: 'everyone', label: 'Everyone' },
            { value: 'buckets', label: 'Buckets' },
          ]}
        />
      </div>
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">
        <div key={view} className="tab-in">
        {view === 'you' && (
          <>
            <GlowCard className="mb-3 !rounded-2xl">
              <div className="grid grid-cols-2 divide-x divide-white/15 py-3.5">
                {[
                  ['You owe', owe],
                  ["You're owed", owed],
                ].map(([label, cents]) => (
                  <div key={label} className="px-4 text-center">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/70">{label}</p>
                    <p className="text-glow mt-1 truncate text-[22px] font-semibold tracking-[-0.02em] tabular-nums">{formatMoney(fromCents(cents), currency)}</p>
                  </div>
                ))}
              </div>
            </GlowCard>
            {twoWay.length > 0 && !paused && (
              <ul className="mb-3 space-y-2">
                {twoWay.map((r) => {
                  const net = r.owe - r.owed;
                  return (
                    <li key={r.other} className="flex items-center gap-2.5 rounded-2xl bg-brand-500/[0.07] px-3 py-2.5 ring-1 ring-brand-500/20">
                      <Avatar id={r.other} name={nameOf(r.other)} size="sm" className="!ring-0" />
                      <span className="min-w-0 flex-1 text-[13px] leading-snug text-slate-600">
                        <span className="block truncate font-semibold text-ink">Net with {nameOf(r.other)}</span>
                        {net > 0
                          ? `you pay ${formatMoney(fromCents(net), currency)}`
                          : net < 0
                            ? `${nameOf(r.other)} pays you ${formatMoney(fromCents(-net), currency)}`
                            : 'you’re even'}
                        {' · clears every bucket'}
                      </span>
                      <button type="button" onClick={() => onSettleAll(r.other)} className="btn-primary h-8 flex-shrink-0 !px-3 !text-[12px]">
                        Settle everything
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {mine.length ? list(mine) : empty("You're square with everyone here.")}
          </>
        )}
        {view === 'everyone' && (pairs.length ? list(pairs) : empty("Everyone's square. Nothing to settle."))}
        {view === 'buckets' &&
          (spending.length ? (
            <>
              <p className="mb-2 text-[13px] text-slate-500">
                {formatMoney(fromCents(spentTotal), currency)} spent across {spending.length} bucket{spending.length === 1 ? '' : 's'}. Tap one to see its activity.
              </p>
              <ul className="-mx-2 space-y-0.5">
                {spending.map((r) => (
                  <li key={r.bucket}>
                    <button type="button" onClick={() => onPickBucket(r.bucket)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors hover:bg-surface-elevated/70">
                      <BucketIcon name={r.bucket} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2 text-[14px]">
                          <span className="truncate font-medium text-ink">{r.bucket}</span>
                          <span className="font-semibold tabular-nums text-ink">{formatMoney(fromCents(r.cents), currency)}</span>
                        </span>
                        <span className={`mt-1.5 block h-1.5 overflow-hidden rounded-full ${bucketStyle(r.bucket).tint}`}>
                          <span className="block h-full rounded-full bg-current" style={{ width: `${Math.max(4, (r.cents / spending[0].cents) * 100)}%` }} />
                        </span>
                        <span className="mt-1 flex justify-between gap-2 text-[12px] text-slate-500">
                          <span>
                            {r.count} expense{r.count === 1 ? '' : 's'} · {Math.round((r.cents / spentTotal) * 100)}%
                          </span>
                          <span>your share {formatMoney(fromCents(r.mine), currency)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-10 text-center text-[14px] text-slate-600">No spending yet.</p>
          ))}
        </div>
      </div>
    </section>
  );
}

// Fixed-height card: title and toolbar stay put, the body scrolls inside it
function Section({ title, count, children, action, toolbar, className = '' }) {
  return (
    <section className={`card flex flex-col overflow-hidden !p-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="text-[16px] font-semibold text-ink">
          {title}
          {count != null && <span className="ml-1.5 text-[13px] font-medium text-slate-400">{count}</span>}
        </h2>
        {action}
      </div>
      {toolbar}
      <div className="scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">{children}</div>
    </section>
  );
}

export default function GroupPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const me = user.id;
  const toast = useToast();
  const navigate = useNavigate();

  const [group, setGroup] = useState(undefined);
  const [people, setPeople] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [invites, setInvites] = useState([]);
  const [requests, setRequests] = useState([]);
  const [nudgeInfo, setNudgeInfo] = useState([]);
  const [plans, setPlans] = useState([]);
  const [params, setParams] = useSearchParams();
  // dashboard | activity | balances (phone-only split of the overview) | settings
  const [tab, setTab] = useState(['activity', 'settings'].includes(params.get('tab')) ? params.get('tab') : 'dashboard');
  const [filter, setFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [balanceView, setBalanceView] = useState('you');

  const [expenseModal, setExpenseModal] = useState({ open: false, expense: null });
  const [settleModal, setSettleModal] = useState({ open: false, preset: null });
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    try {
      const g = await api.group(id);
      if (!g) return setGroup(null);
      const owner = g.owner_id === me;
      const [b, e, s, inv, req, nudges, sp] = await Promise.all([
        api.balances(id),
        api.expenses(id),
        api.settlements(id),
        owner ? api.invites(id) : [],
        owner ? api.pendingRequests() : [],
        api.nudgeInfo(id),
        api.smartPlans(id),
      ]);
      setNudgeInfo(nudges);
      setPlans(sp);
      rememberLooks([
        [g.id, g.avatar_emoji, g.avatar_color],
        ...b.map((p) => [p.user_id, p.avatar_emoji, p.avatar_color]),
        ...req.map((r) => [r.user_id, r.profiles?.avatar_emoji, r.profiles?.avatar_color]),
      ]);
      setGroup(g);
      setPeople(b);
      setExpenses(e);
      setSettlements(s);
      setInvites(inv);
      setRequests(req.filter((r) => r.group_id === id));
    } catch (err) {
      toast.error(err.message);
      setGroup(null);
    }
  }, [id, me, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone confirmed or declined from the bell
  usePaymentsChanged(load);

  // Arriving from a reminder in the bell: open Settle to pay that person
  const settleWith = params.get('settle');
  useEffect(() => {
    if (!settleWith || !group) return;
    setTab('balances');
    setSettleModal({ open: true, preset: { from: me, to: settleWith } });
    setParams({}, { replace: true });
  }, [settleWith, group, me, setParams]);

  const nameOf = useCallback((uid) => people.find((p) => p.user_id === uid)?.display_name || 'Someone', [people]);

  const debts = useMemo(() => bucketDebts(expenses, settlements), [expenses, settlements]);
  // Person-to-person debts, the ones involving the viewer first
  const pairs = useMemo(
    () => debtsByPair(debts).sort((a, b) => [a.debtor, a.creditor].includes(me) * -1 - [b.debtor, b.creditor].includes(me) * -1),
    [debts, me]
  );
  const pending = useMemo(() => pendingPayments(settlements), [settlements]);
  const buckets = useMemo(() => bucketsForGroup(expenses), [expenses]);
  const usedBuckets = useMemo(() => [...new Set(expenses.map((e) => e.bucket))], [expenses]);

  // Expenses, payments and finished smart settles together, newest first
  const allActivity = useMemo(
    () =>
      [
        ...expenses.map((e) => ({ kind: 'expense', date: e.expense_date, at: e.created_at, item: e })),
        ...settlements.filter((st) => !st.plan_id).map((st) => ({ kind: 'settlement', date: st.settled_on, at: st.created_at, item: st })),
        ...plans
          .filter((pl) => pl.status === 'done')
          .map((pl) => ({ kind: 'smart', date: (pl.finished_at || pl.created_at).slice(0, 10), at: pl.finished_at || pl.created_at, item: pl })),
      ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)),
    [expenses, settlements, plans]
  );

  // The same feed bucketed by month, after the bucket / search / "only mine" filters
  const activity = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (it) => {
      const x = it.item;
      const fields =
        it.kind === 'expense'
          ? [x.bucket, x.note, nameOf(x.paid_by), String(x.amount)]
          : it.kind === 'smart'
            ? ['smart settle', ...x.smart_transfers.flatMap((t) => [nameOf(t.from_user), nameOf(t.to_user), String(t.amount)])]
            : [x.bucket, x.note, nameOf(x.from_user), nameOf(x.to_user), String(x.amount)];
      return fields.some((f) => f && f.toLowerCase().includes(q));
    };
    const involvesMe = (it) =>
      it.kind === 'expense'
        ? it.item.paid_by === me || it.item.expense_splits.some((sp) => sp.user_id === me)
        : it.kind === 'smart'
          ? it.item.smart_plan_members.some((m) => m.user_id === me)
          : [it.item.from_user, it.item.to_user].includes(me);
    const items = allActivity.filter(
      (it) => (!filter || (it.kind !== 'smart' && it.item.bucket === filter)) && (!q || matches(it)) && (!mineOnly || involvesMe(it))
    );
    const months = [];
    for (const it of items) {
      const key = it.date.slice(0, 7);
      if (months.at(-1)?.key !== key) months.push({ key, label: monthLabel(it.date), items: [], spent: 0 });
      months.at(-1).items.push(it);
      if (it.kind === 'expense') months.at(-1).spent += Number(it.item.amount);
    }
    return months;
  }, [allActivity, filter, query, mineOnly, me, nameOf]);

  const activityCount = allActivity.length;
  const openPlan = plans.find((pl) => pl.status === 'approving' || pl.status === 'paying') || null;
  const hasPendingPayments = settlements.some((st) => st.status === 'pending');
  const clearFilters = () => {
    setFilter(null);
    setQuery('');
    setMineOnly(false);
  };

  if (group === undefined) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <Skeleton className="h-[52px] rounded-[22px]" />
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <Skeleton className="panel-h rounded-3xl" />
          <Skeleton className="hidden rounded-3xl lg:block" />
        </div>
      </div>
    );
  }

  if (group === null) {
    return (
      <div className="card mx-auto max-w-md py-12 text-center">
        <h1 className="text-[22px] font-semibold text-ink">Group not found</h1>
        <p className="mt-2 text-slate-600">It may have been deleted, or you're not a member.</p>
        <Link to="/" className="btn-primary mt-6">Back home</Link>
      </div>
    );
  }

  const meRow = people.find((p) => p.user_id === me);
  if (!meRow?.is_member) {
    return (
      <div className="card mx-auto max-w-md py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
          <Icon name="clock" className="h-7 w-7" />
        </div>
        <h1 className="text-[22px] font-semibold text-ink">Waiting to join {group.name}</h1>
        <p className="mt-2 text-slate-600">The owner has your request. You'll see the group here once they approve it.</p>
        <Link to="/" className="btn-secondary mt-6">Back home</Link>
      </div>
    );
  }

  const isOwner = group.owner_id === me;
  const cur = group.currency;
  const members = people.filter((p) => p.is_member);
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);

  const done = (message) => {
    setExpenseModal((m) => ({ ...m, open: false }));
    setSettleModal((m) => ({ ...m, open: false }));
    toast.success(message);
    notifyPaymentsChanged();
  };

  const run = (fn, message, after) => async () => {
    try {
      await fn();
      toast.success(message);
      notifyGroupsChanged();
      after ? after() : notifyPaymentsChanged();
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  };

  // Whether the viewer can nudge someone who owes them right now
  const nudgeFor = (debtor) => {
    const info = nudgeInfo.find((n) => n.debtor === debtor);
    if (info?.last_nudged && Date.now() - new Date(info.last_nudged).getTime() < 86400000) return { state: 'sent' };
    if (info?.debt_since) {
      const [y, m, d] = info.debt_since.split('-').map(Number);
      const age = Math.floor((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000);
      const after = group.nudge_after_days ?? 3;
      if (age < after) return { state: 'wait', days: after - age };
    }
    return { state: 'ready' };
  };

  // What tapping a payment in the activity feed offers depends on its state
  const openPayment = (p) => {
    const summary = `${nameOf(p.from_user)} → ${nameOf(p.to_user)}, ${formatMoney(Number(p.amount), cur)} for ${p.bucket}`;
    if (p.status === 'pending' && (p.confirm_by ?? p.to_user) === me) {
      // Part of a "settle everything" batch: the whole batch is confirmed together
      const combined = Boolean(p.confirm_by) && settlements.some((x) => x.batch_id === p.batch_id && x.status === 'pending' && x.from_user === me);
      const other = p.from_user === me ? p.to_user : p.from_user;
      return setConfirm({
        title: combined ? `Settle everything with ${nameOf(other)}?` : `Did ${nameOf(p.from_user)} pay you?`,
        body: combined
          ? `${nameOf(other)} settled every bucket between you, net. Confirm once you’ve received the difference; every bucket clears.`
          : `${summary}. Confirming clears it from what they owe you.`,
        label: 'Confirm',
        action: run(() => api.respondPayment(p.batch_id, true), 'Payment confirmed'),
        secondaryLabel: 'Decline',
        onSecondary: run(() => api.respondPayment(p.batch_id, false), 'Payment declined'),
      });
    }
    if (p.status === 'pending' && [p.from_user, p.created_by].includes(me)) {
      return setConfirm({
        title: 'Withdraw this payment?',
        body: `${summary}. It hasn't been confirmed yet, so nothing has been cleared.`,
        label: 'Withdraw',
        danger: true,
        action: run(() => api.deleteSettlement(p.id), 'Payment withdrawn'),
      });
    }
    if (p.status === 'confirmed' && (p.to_user === me || isOwner)) {
      return setConfirm({
        title: 'Undo this payment?',
        body: `${summary} on ${shortDate(p.settled_on)}. That amount will be owed again.`,
        label: 'Undo payment',
        danger: true,
        action: run(() => api.deleteSettlement(p.id), 'Payment undone'),
      });
    }
    if (p.status === 'rejected' && (isOwner || [p.from_user, p.to_user, p.created_by].includes(me))) {
      return setConfirm({
        title: 'Remove this declined payment?',
        body: `${summary}. It was declined, so it never counted.`,
        label: 'Remove',
        action: run(() => api.deleteSettlement(p.id), 'Removed'),
      });
    }
    toast.info(p.status === 'pending' ? `Waiting for ${nameOf(p.confirm_by ?? p.to_user)} to confirm` : `Only ${nameOf(p.to_user)} or the owner can change this`);
  };
  const activityRow = (it) =>
    it.kind === 'expense' ? (
      <ExpenseRow key={it.item.id} expense={it.item} me={me} nameOf={nameOf} currency={cur} onClick={() => setExpenseModal({ open: true, expense: it.item })} />
    ) : it.kind === 'smart' ? (
      <SmartRow key={it.item.id} plan={it.item} me={me} nameOf={nameOf} currency={cur} />
    ) : (
      <SettlementRow key={it.item.id} s={it.item} me={me} nameOf={nameOf} currency={cur} onClick={() => openPayment(it.item)} />
    );
  const nudge = async (debtor) => {
    try {
      await api.sendNudge(group.id, debtor);
      toast.success(`Nudged ${nameOf(debtor)}`);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };
  const overview = tab === 'activity' || tab === 'balances';
  const tabCls = (name) => (tab === name ? '' : 'hidden lg:block');
  // A small count bubble for join requests keeps the tab short on phones
  const settingsLabel = (
    <span className="inline-flex items-center gap-1.5">
      Settings
      {isOwner && requests.length > 0 && (
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-semibold leading-none text-white" aria-label={`${requests.length} waiting to join`}>
          {requests.length}
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="glass flex items-center gap-2 rounded-[22px] p-1.5 sm:gap-3 sm:p-2">
        <Segmented
          label="Group sections"
          size="sm"
          className="flex min-w-0 flex-1 lg:hidden"
          value={tab}
          onChange={setTab}
          options={[
            {
              value: 'dashboard',
              label: (
                <span className="inline-flex items-center justify-center" title="Dashboard">
                  <Icon name="home" className="h-4 w-4" />
                  <span className="sr-only">Dashboard</span>
                </span>
              ),
            },
            { value: 'activity', label: 'Activity' },
            { value: 'balances', label: 'Balances' },
            { value: 'settings', label: settingsLabel },
          ]}
        />
        <Segmented
          label="Group sections"
          className="hidden lg:inline-flex"
          value={tab === 'balances' ? 'activity' : tab}
          onChange={setTab}
          options={[
            { value: 'dashboard', label: 'Dashboard' },
            { value: 'activity', label: 'Activity' },
            { value: 'settings', label: settingsLabel },
          ]}
        />
        <button
          type="button"
          onClick={() => setTab('settings')}
          title={`${members.length} members`}
          className="hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] text-slate-500 transition-colors hover:bg-surface-elevated hover:text-ink lg:flex"
        >
          <span className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.user_id} id={m.user_id} name={m.display_name} size="sm" />
            ))}
          </span>
          {members.length > 4 ? `+${members.length - 4}` : `${members.length} members`}
        </button>
        <span className="hidden text-[13px] text-slate-400 lg:inline">{formatMoney(total, cur)} spent</span>
        <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setSettleModal({ open: true, preset: null })}
            disabled={members.length < 2}
            className="btn-secondary h-9 !px-2.5 sm:!px-3.5"
            aria-label="Settle"
            title="Settle"
          >
            <Icon name="swap" className="h-4 w-4" />
            <span className="hidden sm:inline">Settle</span>
          </button>
          <button
            type="button"
            onClick={() => setExpenseModal({ open: true, expense: null })}
            className="btn-primary h-9 !px-2.5 sm:!px-3.5"
            aria-label="Add expense"
            title="Add expense"
          >
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            <span className="hidden sm:inline">Add expense</span>
          </button>
        </div>
      </div>


      {openPlan && (
        <button
          type="button"
          onClick={() => setSettleModal({ open: true, preset: { mode: 'smart' } })}
          className="glass flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left shadow-[0_14px_36px_-18px_rgb(var(--brand-500)/0.6)] ring-1 ring-brand-500/30 transition-transform duration-200 active:scale-[0.99]"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
            <Icon name="sparkle" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-ink">Smart settle in progress</span>
            <span className="block truncate text-[12px] text-slate-500">
              {openPlan.status === 'approving'
                ? `${openPlan.smart_plan_members.filter((m) => m.approved_at).length} of ${openPlan.smart_plan_members.length} approved${
                    openPlan.smart_plan_members.some((m) => m.user_id === me && !m.approved_at) ? ' · waiting for you' : ''
                  }`
                : `${openPlan.smart_transfers.filter((t) => t.confirmed_at).length} of ${openPlan.smart_transfers.length} payments confirmed${
                    openPlan.smart_transfers.some((t) => !t.confirmed_at && (t.from_user === me ? !t.paid_at : t.to_user === me)) ? ' · your turn' : ''
                  }`}
              {' · other payments are paused'}
            </span>
          </span>
          <span className="btn-primary h-8 flex-shrink-0 !px-3 !text-[12px]">Open</span>
        </button>
      )}

      {tab === 'dashboard' && (
        <div className="tab-in">
          <GroupDashboard
            group={group}
            members={members}
            expenses={expenses}
            settlements={settlements}
            pairs={pairs}
            me={me}
            nameOf={nameOf}
            recent={allActivity.slice(0, 5)}
            renderActivity={activityRow}
            onAddExpense={() => setExpenseModal({ open: true, expense: null })}
            onSettle={() => setSettleModal({ open: true, preset: null })}
            onPay={(to) => setSettleModal({ open: true, preset: { from: me, to } })}
            onOpenPayment={openPayment}
            nudgeFor={nudgeFor}
            onNudge={nudge}
            onPickBucket={(b) => {
              setFilter(b);
              setTab('activity');
            }}
            onTab={(t, view) => {
              if (view) setBalanceView(view);
              setTab(t);
            }}
          />
        </div>
      )}

      {tab === 'settings' && (
        <div className="tab-in">
        <GroupSettings
          group={group}
          members={members}
          people={people}
          expenses={expenses}
          settlements={settlements}
          me={me}
          isOwner={isOwner}
          invites={invites}
          requests={requests}
          onChange={load}
          confirm={setConfirm}
          run={run}
          onLeft={() => navigate('/')}
        />
        </div>
      )}

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 ${overview ? '' : 'hidden'}`}>
        <div key={`a-${overview ? 'o' : tab}-${tab === 'activity'}`} className={`panel-h tab-in min-w-0 ${tabCls('activity')}`}>
          <Section
            title="Activity"
            count={activityCount || null}
            className="h-full"
            action={
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
                Only mine
                <Switch checked={mineOnly} onChange={setMineOnly} label="Only show activity involving me" />
              </label>
            }
            toolbar={
              <div className="flex-shrink-0 space-y-2 px-4 pb-3 sm:px-5">
                <div className="relative">
                  <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    aria-label="Search activity"
                    placeholder="Search notes, people, amounts…"
                    className="input-field !py-2 pl-9 text-[14px]"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {usedBuckets.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                    {[null, ...usedBuckets].map((b) => (
                      <button
                        key={b ?? 'all'}
                        type="button"
                        onClick={() => setFilter(b)}
                        aria-pressed={filter === b}
                        className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full py-0.5 pr-2.5 text-[12px] font-medium transition-colors ${
                          filter === b ? 'bg-brand-500 text-white' : 'bg-surface-elevated/70 text-slate-600 hover:text-ink'
                        } ${b ? 'pl-0.5' : 'pl-2.5'}`}
                      >
                        {b && <BucketIcon name={b} size="sm" className="!h-6 !w-6 !rounded-full bg-white/90 dark:bg-white/10" />}
                        {b ?? 'All'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            }
          >
            {activity.length === 0 && (filter || query || mineOnly) ? (
              <div className="py-10 text-center">
                <p className="text-[15px] text-slate-600">Nothing matches.</p>
                <button type="button" onClick={clearFilters} className="mt-2 text-[14px] font-medium text-brand-600 hover:text-brand-700">
                  Clear filters
                </button>
              </div>
            ) : activity.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[15px] text-slate-600">
                  {members.length < 2 ? 'Invite people from Settings, then add your first expense.' : 'No expenses yet. Add the first one.'}
                </p>
                <button type="button" onClick={() => setExpenseModal({ open: true, expense: null })} className="btn-primary mt-4">
                  <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> Add expense
                </button>
              </div>
            ) : (
              <div className="-mx-2 space-y-3 sm:-mx-3">
                {activity.map((month) => (
                  <div key={month.key}>
                    <p className="sticky top-0 z-10 flex items-center justify-between bg-[rgb(var(--card)/0.85)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 backdrop-blur sm:px-3">
                      {month.label}
                      <span className="normal-case tracking-normal">{formatMoney(month.spent, cur)} spent</span>
                    </p>
                    {month.items.map(activityRow)}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div key={`b-${overview ? 'o' : tab}-${tab === 'balances'}`} className={`panel-h tab-in min-w-0 ${tabCls('balances')}`}>
          <BalancesPanel
            view={balanceView}
            onView={setBalanceView}
            pairs={pairs}
            expenses={expenses}
            me={me}
            nameOf={nameOf}
            currency={cur}
            pending={pending}
            isOwner={isOwner}
            onClear={(pair, bucket) => setSettleModal({ open: true, preset: { from: pair.debtor, to: pair.creditor, bucket } })}
            onClearAll={(pair, rows) => {
              const receiver = pair.creditor === me;
              const sum = formatMoney(fromCents(rows.reduce((a, r) => a + r.payable, 0)), cur);
              setConfirm({
                title: `Clear everything ${pair.debtor === me ? 'you owe' : `${nameOf(pair.debtor)} owes`} ${receiver ? 'you' : nameOf(pair.creditor)}?`,
                body: receiver
                  ? `You're confirming you received ${sum} for ${rows.map((r) => r.bucket).join(', ')}. It clears right away.`
                  : `Sends ${nameOf(pair.creditor)} a ${sum} payment for ${rows.map((r) => r.bucket).join(', ')} to confirm. It clears once they accept.`,
                label: receiver ? 'Clear all' : 'Send to confirm',
                action: run(
                  () => api.clearBuckets({ groupId: group.id, from: pair.debtor, to: pair.creditor }),
                  receiver ? 'All buckets cleared' : `Sent to ${nameOf(pair.creditor)} to confirm`
                ),
              });
            }}
            paused={Boolean(openPlan)}
            onSettleAll={(other) => setSettleModal({ open: true, preset: { from: me, to: other, bucket: '__net' } })}
            onPickBucket={(b) => {
              setFilter(b);
              setTab('activity');
            }}
            nudgeFor={nudgeFor}
            onNudge={nudge}
          />
        </div>
      </div>

      <ExpenseModal
        open={expenseModal.open}
        expense={expenseModal.expense}
        onClose={() => setExpenseModal((m) => ({ ...m, open: false }))}
        group={group}
        people={people}
        me={me}
        buckets={buckets}
        onSaved={done}
      />
      <SettleModal
        open={settleModal.open}
        preset={settleModal.preset}
        onClose={() => setSettleModal((m) => ({ ...m, open: false }))}
        group={group}
        people={people}
        me={me}
        isOwner={isOwner}
        debts={debts}
        pending={pending}
        plan={openPlan}
        hasPending={hasPendingPayments}
        onSaved={done}
      />
      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        secondaryLabel={confirm?.secondaryLabel}
        onSecondary={confirm?.onSecondary}
        onConfirm={() => confirm.action()}
      />
    </div>
  );
}


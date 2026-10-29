import { useMemo, useState } from 'react';
import { formatMoney, fromCents, toCents } from '../lib/money';
import { bucketStyle } from '../lib/buckets';
import Icon from './Icon';
import Avatar from './Avatar';
import BucketIcon from './BucketIcon';
import { GlowCard } from './Glow';

const MONTHS = 6;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shortMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};
const longMonth = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// On desktop every card shares the screen, so long lists scroll inside the card
function Card({ title, action, children, className = '', scroll = true }) {
  return (
    <section className={`card flex min-h-0 min-w-0 flex-col !p-4 ${className}`}>
      <div className="mb-2 flex flex-shrink-0 items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {scroll ? (
        <div className="scroll-fade -mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 lg:max-h-none max-lg:max-h-72">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

function SeeAll({ onClick, children = 'See all' }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-brand-600 hover:text-brand-700">
      {children} <Icon name="chevron" className="h-3.5 w-3.5" />
    </button>
  );
}

function Stat({ label, value, sub, subTone = 'text-slate-500' }) {
  return (
    <div className="card flex min-w-0 flex-col justify-center !px-3.5 !py-3">
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[18px] font-semibold tracking-[-0.02em] tabular-nums text-ink">{value}</p>
      {sub && <p className={`truncate text-[11px] ${subTone}`}>{sub}</p>}
    </div>
  );
}

// Spend per month for the last six months; hovering a bar reads it out in the header
function MonthlyChart({ months, currency }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...months.map((m) => m.cents), 1);
  const shown = months[hover ?? months.length - 1];
  return (
    <Card title="Monthly spending" scroll={false}>
      <p className="flex items-baseline gap-2">
        <span className="text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-ink">{formatMoney(fromCents(shown.cents), currency)}</span>
        <span className="truncate text-[12px] text-slate-500">{longMonth(shown.key)}</span>
      </p>
      <div className="mt-2 flex h-24 items-end gap-2 border-b border-[rgb(var(--line)/0.1)] sm:gap-3 lg:h-auto lg:min-h-[48px] lg:flex-1" onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => {
          const active = (hover ?? months.length - 1) === i;
          return (
            <button
              key={m.key}
              type="button"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${longMonth(m.key)}: ${formatMoney(fromCents(m.cents), currency)}, ${m.count} expense${m.count === 1 ? '' : 's'}`}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                className={`block w-full max-w-[44px] rounded-t-[4px] transition-colors duration-200 ${active ? 'bg-brand-500' : 'bg-brand-500/30'}`}
                style={{ height: m.cents ? `${Math.max(3, (m.cents / max) * 100)}%` : '2px' }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-shrink-0 gap-2 sm:gap-3">
        {months.map((m, i) => (
          <span key={m.key} className={`flex-1 text-center text-[11px] ${(hover ?? months.length - 1) === i ? 'font-semibold text-ink' : 'text-slate-500'}`}>
            {shortMonth(m.key)}
          </span>
        ))}
      </div>
    </Card>
  );
}

// Where the group stands on the overview: headline numbers, trends and what needs doing
export default function GroupDashboard({
  group,
  members,
  expenses,
  settlements,
  pairs,
  me,
  nameOf,
  recent,
  renderActivity,
  onAddExpense,
  onSettle,
  onPay,
  onOpenPayment,
  nudgeFor,
  onNudge,
  onPickBucket,
  onTab,
}) {
  const cur = group.currency;

  const owe = pairs.filter((p) => p.debtor === me).reduce((a, p) => a + p.cents, 0);
  const owed = pairs.filter((p) => p.creditor === me).reduce((a, p) => a + p.cents, 0);
  const net = owed - owe;

  const stats = useMemo(() => {
    let total = 0;
    let share = 0;
    let paid = 0;
    for (const e of expenses) {
      const c = toCents(e.amount);
      total += c;
      if (e.paid_by === me) paid += c;
      share += toCents(e.expense_splits.find((sp) => sp.user_id === me)?.amount || 0);
    }
    return { total, share, paid };
  }, [expenses, me]);

  const months = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = MONTHS - 1; i >= 0; i--) out.push({ key: monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)), cents: 0, count: 0 });
    for (const e of expenses) {
      const m = out.find((x) => x.key === e.expense_date.slice(0, 7));
      if (m) {
        m.cents += toCents(e.amount);
        m.count += 1;
      }
    }
    return out;
  }, [expenses]);
  const thisMonth = months.at(-1).cents;
  const lastMonth = months.at(-2).cents;
  const change = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const topBuckets = useMemo(() => {
    const map = new Map();
    for (const e of expenses) map.set(e.bucket, (map.get(e.bucket) || 0) + toCents(e.amount));
    return [...map.entries()].map(([bucket, cents]) => ({ bucket, cents })).sort((a, b) => b.cents - a.cents);
  }, [expenses]);

  // Each member's net position: positive is owed to them, negative is what they owe
  const standings = useMemo(() => {
    const nets = new Map(members.map((m) => [m.user_id, 0]));
    for (const p of pairs) {
      nets.set(p.creditor, (nets.get(p.creditor) || 0) + p.cents);
      nets.set(p.debtor, (nets.get(p.debtor) || 0) - p.cents);
    }
    return [...nets.entries()].map(([id, cents]) => ({ id, cents })).sort((a, b) => b.cents - a.cents);
  }, [members, pairs]);
  const maxStanding = Math.max(...standings.map((s) => Math.abs(s.cents)), 1);

  // Payments waiting on the viewer, then who they owe and who owes them
  const toConfirm = settlements.filter((s) => s.status === 'pending' && (s.confirm_by ?? s.to_user) === me);
  const iOwe = pairs.filter((p) => p.debtor === me);
  const oweMe = pairs.filter((p) => p.creditor === me);
  const nothingToDo = !toConfirm.length && !iOwe.length && !oweMe.length;

  const negative = net < 0;
  const row = 'flex items-center gap-2.5 rounded-2xl px-2.5 py-2';
  return (
    // Desktop: fills the screen under the toolbar like the Activity panels, no page scroll
    <div className="flex flex-col gap-3 lg:h-[max(520px,calc(100dvh-14rem))]">
      <div className="grid flex-shrink-0 gap-3 lg:grid-cols-3">
        <GlowCard tone={negative ? 'danger' : undefined} bodyClassName="flex h-full flex-col justify-center px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-white/70">Your balance · {net > 0 ? "you're owed" : net < 0 ? 'you owe' : 'all square'}</p>
              <p className={`${negative ? 'text-glow-danger' : 'text-glow'} truncate text-[26px] font-semibold leading-tight tracking-[-0.03em] tabular-nums`}>
                {net === 0 ? formatMoney(0, cur) : `${net > 0 ? '+' : '−'}${formatMoney(fromCents(Math.abs(net)), cur)}`}
              </p>
            </div>
            <div className="flex flex-shrink-0 gap-1.5">
              <button type="button" onClick={onAddExpense} className="btn-glow !px-3 !py-1.5 !text-[12px]" title="Add expense">
                <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> Add
              </button>
              {members.length > 1 && (
                <button type="button" onClick={onSettle} className="btn-glow-ghost !px-3 !py-1.5 !text-[12px]" title="Settle">
                  <Icon name="swap" className="h-3.5 w-3.5" /> Settle
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 flex gap-3 text-[12px] text-white/75">
            <span className="truncate">
              Owed <span className="font-semibold tabular-nums text-white">{formatMoney(fromCents(owed), cur)}</span>
            </span>
            <span className="truncate">
              Owe <span className="font-semibold tabular-nums text-white">{formatMoney(fromCents(owe), cur)}</span>
            </span>
          </p>
        </GlowCard>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-2">
          <Stat label="Group spend" value={formatMoney(fromCents(stats.total), cur)} sub={`${expenses.length} expense${expenses.length === 1 ? '' : 's'} · ${members.length} member${members.length === 1 ? '' : 's'}`} />
          <Stat
            label="This month"
            value={formatMoney(fromCents(thisMonth), cur)}
            sub={change == null ? (thisMonth ? 'Nothing last month' : 'No spending yet') : `${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${Math.abs(change)}% vs last month`}
          />
          <Stat label="Your share" value={formatMoney(fromCents(stats.share), cur)} sub={stats.total ? `${Math.round((stats.share / stats.total) * 100)}% of group spend` : 'Of all expenses'} />
          <Stat label="You paid" value={formatMoney(fromCents(stats.paid), cur)} sub={stats.paid > stats.share ? 'More than your share' : stats.paid < stats.share ? 'Less than your share' : 'Exactly your share'} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3 lg:grid-rows-2">
        <MonthlyChart months={months} currency={cur} />

        <Card title="Top buckets" action={topBuckets.length > 0 && <SeeAll onClick={() => onTab('balances', 'buckets')} />}>
          {topBuckets.length ? (
            <ul className="-mx-2">
              {topBuckets.map((r) => (
                <li key={r.bucket}>
                  <button
                    type="button"
                    onClick={() => onPickBucket(r.bucket)}
                    title={`${r.bucket}: ${formatMoney(fromCents(r.cents), cur)} · ${Math.round((r.cents / stats.total) * 100)}% of spend`}
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated/70"
                  >
                    <BucketIcon name={r.bucket} size="sm" className="!h-7 !w-7" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate font-medium text-ink">{r.bucket}</span>
                        <span className="font-semibold tabular-nums text-ink">{formatMoney(fromCents(r.cents), cur)}</span>
                      </span>
                      <span className={`mt-1 block h-1 overflow-hidden rounded-full ${bucketStyle(r.bucket).tint}`}>
                        <span className="block h-full rounded-full bg-current" style={{ width: `${Math.max(4, (r.cents / topBuckets[0].cents) * 100)}%` }} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-[13px] text-slate-500">No spending yet.</p>
          )}
        </Card>

        <Card title="Who's up, who's down" action={<SeeAll onClick={() => onTab('balances', 'everyone')}>Balances</SeeAll>}>
          <ul className="space-y-2">
            {standings.map((s) => {
              const width = `${(Math.abs(s.cents) / maxStanding) * 50}%`;
              return (
                <li key={s.id} className="flex items-center gap-2.5" title={`${nameOf(s.id)}: ${s.cents > 0 ? 'is owed' : s.cents < 0 ? 'owes' : 'square'} ${formatMoney(fromCents(Math.abs(s.cents)), cur)}`}>
                  <Avatar id={s.id} name={nameOf(s.id)} size="sm" className="!ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium text-ink">{s.id === me ? 'You' : nameOf(s.id)}</span>
                      <span className={`font-semibold tabular-nums ${s.cents > 0 ? 'text-emerald-600' : s.cents < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {s.cents === 0 ? 'square' : `${s.cents > 0 ? '+' : '−'}${formatMoney(fromCents(Math.abs(s.cents)), cur)}`}
                      </span>
                    </span>
                    {/* Diverging bar: owed grows right of centre, owing grows left */}
                    <span className="relative mt-1 block h-1 rounded-full bg-[rgb(var(--line)/0.06)]">
                      <span className="absolute inset-y-[-2px] left-1/2 w-px bg-[rgb(var(--line)/0.25)]" />
                      {s.cents !== 0 && (
                        <span className={`absolute inset-y-0 rounded-full ${s.cents > 0 ? 'left-1/2 bg-emerald-500' : 'right-1/2 bg-rose-500'}`} style={{ width }} />
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Needs your attention">
          {nothingToDo ? (
            <div className="flex items-center gap-2.5 py-2">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <p className="text-[13px] text-slate-600">Nothing to do. You're square here.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {toConfirm.map((s) => (
                <li key={s.id} className={`${row} bg-amber-500/[0.07] ring-1 ring-amber-500/20`}>
                  <Icon name="clock" className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
                    <span className="font-semibold text-ink">{nameOf(s.from_user)}</span> paid {formatMoney(Number(s.amount), cur)}
                  </span>
                  <button type="button" onClick={() => onOpenPayment(s)} className="btn-primary h-7 flex-shrink-0 !px-2.5 !text-[12px]">
                    Review
                  </button>
                </li>
              ))}
              {iOwe.map((p) => (
                <li key={`o-${p.creditor}`} className={`${row} bg-[rgb(var(--line)/0.05)]`}>
                  <Avatar id={p.creditor} name={nameOf(p.creditor)} size="sm" className="!ring-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
                    You owe <span className="font-semibold text-ink">{nameOf(p.creditor)}</span> <span className="font-medium text-rose-600">{formatMoney(fromCents(p.cents), cur)}</span>
                  </span>
                  <button type="button" onClick={() => onPay(p.creditor)} className="btn-secondary h-7 flex-shrink-0 !px-2.5 !text-[12px]">
                    Pay
                  </button>
                </li>
              ))}
              {oweMe.map((p) => {
                const nudge = nudgeFor(p.debtor);
                return (
                  <li key={`d-${p.debtor}`} className={`${row} bg-[rgb(var(--line)/0.05)]`}>
                    <Avatar id={p.debtor} name={nameOf(p.debtor)} size="sm" className="!ring-0" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
                      <span className="font-semibold text-ink">{nameOf(p.debtor)}</span> owes you <span className="font-medium text-emerald-600">{formatMoney(fromCents(p.cents), cur)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onNudge(p.debtor)}
                      disabled={nudge.state !== 'ready'}
                      title={nudge.state === 'sent' ? 'Nudged in the last day' : nudge.state === 'wait' ? `Nudges unlock in ${nudge.days} day${nudge.days === 1 ? '' : 's'}` : `Remind ${nameOf(p.debtor)}`}
                      className="inline-flex h-7 flex-shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-amber-600 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500 hover:text-white disabled:pointer-events-none disabled:text-slate-400 disabled:ring-line/10"
                    >
                      <Icon name="bell" className="h-3.5 w-3.5" />
                      {nudge.state === 'sent' ? 'Nudged' : nudge.state === 'wait' ? `${nudge.days}d` : 'Nudge'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" className="lg:col-span-2" action={recent.length > 0 && <SeeAll onClick={() => onTab('activity')} />}>
          {recent.length ? (
            <div className="-mx-2 [&>button]:!py-2">{recent.map(renderActivity)}</div>
          ) : (
            <div className="flex items-center justify-between gap-3 py-2">
              <p className="text-[13px] text-slate-600">No activity yet.</p>
              <button type="button" onClick={onAddExpense} className="btn-primary h-8 !px-3 !text-[12px]">
                <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> Add expense
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { FieldBox, PillSelect } from './Field';
import Icon from './Icon';
import BucketIcon from './BucketIcon';
import { ErrorNote } from './AuthShell';
import { api } from '../lib/api';
import { currencySymbol, formatMoney, fromCents, splitEqual, splitPercent, toCents } from '../lib/money';
import { today } from '../lib/dates';
import { canonicalBucket } from '../lib/buckets';

const SPLIT_TYPES = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'By amount' },
  { value: 'percent', label: 'By percent' },
];

// Blank form, or one filled in from an existing expense
function initialState(expense, members, me) {
  if (!expense) {
    return {
      bucket: '',
      note: '',
      amount: '',
      date: today(),
      paidBy: me,
      splitType: 'equal',
      selected: new Set(members.map((m) => m.user_id)),
      exact: {},
      percent: {},
    };
  }
  const shares = Object.fromEntries(expense.expense_splits.map((s) => [s.user_id, Number(s.amount)]));
  const total = Number(expense.amount);
  return {
    bucket: expense.bucket,
    note: expense.note || '',
    amount: String(total),
    date: expense.expense_date,
    paidBy: expense.paid_by,
    splitType: expense.split_type,
    selected: new Set(Object.keys(shares)),
    exact: Object.fromEntries(Object.entries(shares).map(([id, a]) => [id, String(a)])),
    percent: Object.fromEntries(Object.entries(shares).map(([id, a]) => [id, String(Math.round((a / total) * 10000) / 100)])),
  };
}

// Bucket field that collapses to one row; tap to show the chips. Opens by
// itself when nothing is picked yet and closes after a pick.
function BucketPicker({ buckets, value, onChange }) {
  const [open, setOpen] = useState(!value);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const isCustomValue = value && !buckets.some((b) => b.name === value);

  useEffect(() => {
    if (!value) setOpen(true);
  }, [value]);

  const pick = (name) => {
    onChange(name);
    setOpen(false);
  };

  const commit = () => {
    if (draft.trim()) pick(canonicalBucket(draft, buckets));
    setAdding(false);
    setDraft('');
  };

  const chip = (active) =>
    `inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium transition-[background-color,transform] duration-200 active:scale-95 ${
      active ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--line)/0.07)] text-ink hover:bg-[rgb(var(--line)/0.12)]'
    }`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative flex w-full items-center gap-2 rounded-2xl bg-surface-card py-1.5 pl-1.5 pr-3 text-left ring-1 ring-[rgb(var(--line)/0.1)] transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        {value ? (
          <BucketIcon name={value} size="sm" className="!h-9 !w-9 !rounded-xl" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--line)/0.08)] text-slate-400">
            <Icon name="tag" className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Bucket</span>
          <span className={`block truncate text-[15px] font-semibold ${value ? 'text-ink' : 'text-slate-400'}`}>{value || 'Pick a bucket'}</span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-ios ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-ios ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div role="radiogroup" aria-label="Bucket" className="flex flex-wrap gap-1.5 px-0.5 pb-0.5 pt-2">
            {[...buckets, ...(isCustomValue ? [{ name: value }] : [])].map((b) => (
              <button
                key={b.name}
                type="button"
                role="radio"
                aria-checked={value === b.name}
                tabIndex={open ? 0 : -1}
                onClick={() => pick(b.name)}
                className={chip(value === b.name)}
              >
                <BucketIcon name={b.name} size="sm" className="!h-6 !w-6 !rounded-full" />
                {b.name}
              </button>
            ))}
            {adding ? (
              <input
                autoFocus
                aria-label="New bucket name"
                className="input-field !w-40 !rounded-full !px-3 !py-1 text-[13px]"
                value={draft}
                maxLength={30}
                placeholder="Bucket name"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commit();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setAdding(false);
                  }
                }}
                onBlur={commit}
              />
            ) : (
              <button
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[rgb(var(--line)/0.25)] px-3 py-1 text-[13px] font-medium text-slate-500 hover:text-ink"
              >
                <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> New
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExpenseModal({ open, onClose, group, people, me, expense, buckets, onSaved }) {
  const members = useMemo(() => people.filter((p) => p.is_member), [people]);
  // Someone removed from the group can still be the payer of an old expense
  const payers = useMemo(
    () => (expense && !members.some((m) => m.user_id === expense.paid_by) ? [...members, people.find((p) => p.user_id === expense.paid_by)].filter(Boolean) : members),
    [members, people, expense]
  );
  const [form, setForm] = useState(() => initialState(expense, members, me));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialState(expense, members, me));
      setError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const cur = group.currency;
  const symbol = currencySymbol(cur);
  const totalCents = toCents(form.amount);

  // Work out each person's share and anything stopping a save
  const { shares, problem, remainder } = useMemo(() => {
    if (!(totalCents > 0)) return { shares: {}, problem: 'Enter an amount' };
    if (form.splitType === 'equal') {
      const ids = members.map((m) => m.user_id).filter((id) => form.selected.has(id));
      if (!ids.length) return { shares: {}, problem: 'Pick at least one person' };
      return { shares: splitEqual(totalCents, ids) };
    }
    if (form.splitType === 'exact') {
      const shares = {};
      for (const m of members) {
        const c = toCents(form.exact[m.user_id] || 0);
        if (Number.isNaN(c) || c < 0) return { shares: {}, problem: 'Check the amounts' };
        if (c > 0) shares[m.user_id] = c;
      }
      const diff = totalCents - Object.values(shares).reduce((a, b) => a + b, 0);
      return { shares, remainder: diff, problem: diff ? `${formatMoney(fromCents(Math.abs(diff)), cur)} ${diff > 0 ? 'left to assign' : 'too much'}` : '' };
    }
    const pcts = {};
    for (const m of members) {
      const p = Number(form.percent[m.user_id] || 0);
      if (!Number.isFinite(p) || p < 0) return { shares: {}, problem: 'Check the percentages' };
      if (p > 0) pcts[m.user_id] = p;
    }
    const sum = Math.round(Object.values(pcts).reduce((a, b) => a + b, 0) * 100) / 100;
    if (sum !== 100) return { shares: {}, remainder: 100 - sum, problem: `${Math.round((100 - sum) * 100) / 100}% ${sum < 100 ? 'left' : 'too much'}` };
    return { shares: splitPercent(totalCents, pcts) };
  }, [form, members, totalCents, cur]);

  const save = async (e) => {
    e.preventDefault();
    if (!form.bucket) return setError('Pick a bucket');
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      await api.saveExpense({
        id: expense?.id,
        groupId: group.id,
        bucket: form.bucket,
        note: form.note,
        amount: fromCents(totalCents),
        paidBy: form.paidBy,
        splitType: form.splitType,
        date: form.date,
        splits: Object.entries(shares).map(([user_id, c]) => ({ user_id, amount: fromCents(c) })),
      });
      onSaved(expense ? 'Expense updated' : 'Expense added');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteExpense(expense.id);
      onSaved('Expense deleted');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) =>
    set({ selected: new Set(form.selected.has(id) ? [...form.selected].filter((x) => x !== id) : [...form.selected, id]) });

  const nameOf = (id) => (id === me ? 'You' : people.find((p) => p.user_id === id)?.display_name || '');
  const included = members.filter((m) => form.selected.has(m.user_id));
  const each = included.length && totalCents > 0 ? Math.floor(totalCents / included.length) : 0;

  // Plain-language summary: who gets paid back, and how it's shared.
  // "Pay to" is the person who paid; everyone else pays them back.
  const payee = form.paidBy === me ? 'you' : nameOf(form.paidBy);
  const summary =
    totalCents > 0
      ? `${formatMoney(fromCents(totalCents), cur)} to ${payee}${
          form.splitType === 'equal'
            ? included.length
              ? ` · ${formatMoney(fromCents(each), cur)} each for ${included.length === members.length ? 'everyone' : `${included.length} ${included.length === 1 ? 'person' : 'people'}`}`
              : ''
            : form.splitType === 'exact'
              ? ' · shared by amount'
              : ' · shared by percent'
        }`
      : 'Enter the amount above';

  return (
    <Modal open={open} onClose={onClose} labelledBy="expense-title" className="max-w-lg">
      <form onSubmit={save} className="space-y-3">
        <h2 id="expense-title" className="pr-10 text-[20px] font-semibold text-ink">{expense ? 'Edit expense' : 'Add expense'}</h2>
        <ErrorNote>{error}</ErrorNote>

        <BucketPicker buckets={buckets} value={form.bucket} onChange={(bucket) => set({ bucket })} />

        {/* Amount and date in one row */}
        <div className="flex gap-2">
          <FieldBox label="Amount" className="flex-1">
            <span className="flex items-center gap-0.5">
              <span className="text-[17px] text-slate-500">{symbol}</span>
              <input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                className="no-spin w-full min-w-0 bg-transparent text-[18px] font-semibold tabular-nums text-ink outline-none placeholder:text-slate-400"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                required
                placeholder="0"
              />
            </span>
          </FieldBox>
          <FieldBox label="Date" className="w-[9.5rem] flex-shrink-0">
            <input
              id="exp-date"
              type="date"
              className="w-full bg-transparent text-[14px] font-semibold text-ink outline-none"
              value={form.date}
              max={today()}
              onChange={(e) => set({ date: e.target.value })}
              required
            />
          </FieldBox>
        </div>

        <input
          id="exp-note"
          aria-label="Note"
          className="input-field !py-2.5 text-[14px]"
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={120}
          placeholder="Note (optional): airport drop, BigBasket order…"
        />

        {/* Who paid, and how it's shared */}
        <div className="flex gap-2">
          <PillSelect
            label="Pay to"
            id="exp-payer"
            value={form.paidBy}
            onChange={(paidBy) => set({ paidBy })}
            className="flex-1"
            leading={<Avatar id={form.paidBy} name={nameOf(form.paidBy)} size="md" className="!ring-0" />}
            options={payers.map((m) => ({ value: m.user_id, label: m.user_id === me ? 'You' : m.display_name }))}
          />
          <PillSelect
            label="Split"
            id="exp-split"
            value={form.splitType}
            onChange={(splitType) => set({ splitType })}
            className="w-[42%] flex-shrink-0"
            options={SPLIT_TYPES}
          />
        </div>

        <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] p-2.5 ring-1 ring-[rgb(var(--line)/0.06)]">
          <p className="mb-2 px-1 text-[13px] leading-snug text-slate-500">
            <span className="font-medium text-ink">{summary}</span>
            {form.splitType === 'equal' && <span> · tap people to include or leave out</span>}
          </p>

          {form.splitType === 'equal' ? (
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const on = form.selected.has(m.user_id);
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(m.user_id)}
                    className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium transition-[background-color,opacity,transform] duration-200 active:scale-95 ${
                      on ? 'bg-brand-500/10 text-ink ring-1 ring-brand-500/50' : 'bg-transparent text-slate-400 ring-1 ring-[rgb(var(--line)/0.12)]'
                    }`}
                  >
                    <span className={`transition-opacity duration-200 ${on ? '' : 'opacity-40 grayscale'}`}>
                      <Avatar id={m.user_id} name={m.display_name} size="sm" className="!h-6 !w-6 !text-[10px] !ring-0" />
                    </span>
                    {m.user_id === me ? 'You' : m.display_name}
                    {on && shares[m.user_id] > 0 && (
                      <span className="tabular-nums text-slate-500">{formatMoney(fromCents(shares[m.user_id]), cur)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className="max-h-[30vh] space-y-1 overflow-y-auto">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2.5 rounded-xl px-1 py-1">
                  <Avatar id={m.user_id} name={m.display_name} size="sm" className="!ring-0" />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{m.user_id === me ? 'You' : m.display_name}</span>
                  {form.splitType === 'percent' && shares[m.user_id] > 0 && (
                    <span className="text-[12px] tabular-nums text-slate-500">{formatMoney(fromCents(shares[m.user_id]), cur)}</span>
                  )}
                  <div className="relative w-24">
                    {form.splitType === 'exact' && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-500">{symbol}</span>}
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={form.splitType === 'percent' ? 100 : undefined}
                      step="0.01"
                      aria-label={`${m.display_name}'s ${form.splitType === 'exact' ? 'amount' : 'percent'}`}
                      className={`input-field no-spin !py-1.5 text-right text-[14px] ${form.splitType === 'exact' ? '!pl-6 !pr-2' : '!pl-2 !pr-6'}`}
                      value={(form.splitType === 'exact' ? form.exact : form.percent)[m.user_id] ?? ''}
                      onChange={(e) =>
                        set(
                          form.splitType === 'exact'
                            ? { exact: { ...form.exact, [m.user_id]: e.target.value } }
                            : { percent: { ...form.percent, [m.user_id]: e.target.value } }
                        )
                      }
                      placeholder="0"
                    />
                    {form.splitType === 'percent' && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-500">%</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {form.splitType !== 'equal' && totalCents > 0 && (
            <p className={`mt-1.5 px-1 text-right text-[12px] font-medium ${remainder ? 'text-amber-600' : 'text-emerald-600'}`}>
              {remainder ? problem : 'All assigned ✓'}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-0.5">
          {expense && (
            <button type="button" onClick={remove} disabled={busy} className="btn-secondary h-12 !px-4 !text-rose-600" aria-label="Delete expense">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary h-12 flex-1">
            {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

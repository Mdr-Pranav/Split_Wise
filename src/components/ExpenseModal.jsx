import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import Segmented from './Segmented';
import Icon from './Icon';
import BucketIcon from './BucketIcon';
import { ErrorNote } from './AuthShell';
import { api } from '../lib/api';
import { currencySymbol, formatMoney, fromCents, splitEqual, splitPercent, toCents } from '../lib/money';
import { today } from '../lib/dates';
import { canonicalBucket } from '../lib/buckets';

const SPLIT_TYPES = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Amounts' },
  { value: 'percent', label: 'Percent' },
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

// Grid of bucket tiles plus a "New" tile that turns into a text box
function BucketPicker({ buckets, value, onChange }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const isCustomValue = value && !buckets.some((b) => b.name === value);

  const commit = () => {
    if (draft.trim()) onChange(canonicalBucket(draft, buckets));
    setAdding(false);
    setDraft('');
  };

  const tile = 'flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-[12px] font-medium transition-all duration-150';
  const tileState = (active) =>
    active ? 'bg-brand-500/10 text-ink ring-2 ring-brand-500' : 'text-slate-600 ring-1 ring-line/[0.08] hover:bg-surface-elevated';

  return (
    <div role="radiogroup" aria-label="Bucket" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {[...buckets, ...(isCustomValue ? [{ name: value }] : [])].map((b) => (
        <button key={b.name} type="button" role="radio" aria-checked={value === b.name} onClick={() => onChange(b.name)} className={`${tile} ${tileState(value === b.name)}`}>
          <BucketIcon name={b.name} size="sm" />
          <span className="w-full truncate text-center">{b.name}</span>
        </button>
      ))}
      {adding ? (
        <div className="col-span-2 flex items-center gap-1.5">
          <input
            autoFocus
            aria-label="New bucket name"
            className="input-field !px-3 !py-2 text-[14px]"
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
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${tile} border border-dashed border-line/20 text-slate-500 hover:bg-surface-elevated hover:text-ink`}>
          <span className="flex h-7 w-7 items-center justify-center">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
          </span>
          New
        </button>
      )}
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

  return (
    <Modal open={open} onClose={onClose} labelledBy="expense-title" className="max-w-lg">
      <form onSubmit={save} className="space-y-5">
        <h2 id="expense-title" className="pr-10 text-[22px] font-semibold text-ink">{expense ? 'Edit expense' : 'Add expense'}</h2>
        <ErrorNote>{error}</ErrorNote>

        <div>
          <span className="label">Bucket</span>
          <BucketPicker buckets={buckets} value={form.bucket} onChange={(bucket) => set({ bucket })} />
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label htmlFor="exp-amount" className="label">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{symbol}</span>
              <input
                id="exp-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                className="input-field no-spin pl-9 text-[18px] font-semibold"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                required
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label htmlFor="exp-date" className="label">Date</label>
            <input id="exp-date" type="date" className="input-field w-[9.5rem]" value={form.date} max={today()} onChange={(e) => set({ date: e.target.value })} required />
          </div>
        </div>

        <div>
          <label htmlFor="exp-note" className="label">Note <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="exp-note" className="input-field" value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={120} placeholder="Airport drop, BigBasket order…" />
        </div>

        <div>
          <label htmlFor="exp-payer" className="label">Paid by</label>
          <select id="exp-payer" className="input-field" value={form.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
            {payers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user_id === me ? `${m.display_name} (you)` : m.display_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label mb-0">Split</span>
            <Segmented label="Split type" options={SPLIT_TYPES} value={form.splitType} onChange={(v) => set({ splitType: v })} />
          </div>
          <ul className="max-h-[38vh] space-y-1 overflow-y-auto rounded-2xl bg-surface-card p-1.5 ring-1 ring-line/[0.08]">
            {members.map((m) => {
              const share = shares[m.user_id] || 0;
              return (
                <li key={m.user_id} className="flex items-center gap-3 rounded-xl px-2.5 py-2">
                  {form.splitType === 'equal' ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={form.selected.has(m.user_id)}
                      onClick={() => toggle(m.user_id)}
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ring-1 transition-colors ${
                        form.selected.has(m.user_id) ? 'bg-brand-500 text-white ring-brand-500' : 'ring-line/20'
                      }`}
                      aria-label={`Include ${m.display_name}`}
                    >
                      {form.selected.has(m.user_id) && <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />}
                    </button>
                  ) : null}
                  <Avatar id={m.user_id} name={m.display_name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">
                    {m.display_name}
                    {m.user_id === me && <span className="text-slate-500"> (you)</span>}
                  </span>
                  {form.splitType === 'equal' && (
                    <span className={`text-[14px] tabular-nums ${share ? 'font-medium text-ink' : 'text-slate-400'}`}>
                      {formatMoney(fromCents(share), cur)}
                    </span>
                  )}
                  {form.splitType === 'exact' && (
                    <div className="relative w-28">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-500">{symbol}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        aria-label={`${m.display_name}'s amount`}
                        className="input-field no-spin py-2 pl-7 pr-2 text-right"
                        value={form.exact[m.user_id] ?? ''}
                        onChange={(e) => set({ exact: { ...form.exact, [m.user_id]: e.target.value } })}
                        placeholder="0"
                      />
                    </div>
                  )}
                  {form.splitType === 'percent' && (
                    <>
                      <span className="hidden text-[13px] tabular-nums text-slate-500 sm:inline">{share ? formatMoney(fromCents(share), cur) : ''}</span>
                      <div className="relative w-20">
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          step="0.01"
                          aria-label={`${m.display_name}'s percent`}
                          className="input-field no-spin py-2 pl-2 pr-7 text-right"
                          value={form.percent[m.user_id] ?? ''}
                          onChange={(e) => set({ percent: { ...form.percent, [m.user_id]: e.target.value } })}
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-500">%</span>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {form.splitType !== 'equal' && totalCents > 0 && (
            <p className={`mt-2 text-right text-[13px] font-medium ${remainder ? 'text-amber-600' : 'text-emerald-600'}`}>
              {remainder ? problem : 'All assigned ✓'}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center">
          {expense && (
            <button type="button" onClick={remove} disabled={busy} className="btn-secondary !text-rose-600 sm:mr-auto">
              <Icon name="trash" className="h-4 w-4" /> Delete
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary h-12 sm:ml-auto sm:h-auto sm:min-w-[9rem]">
            {busy ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

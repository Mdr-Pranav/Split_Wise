import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import Icon from './Icon';
import BucketIcon from './BucketIcon';
import { ErrorNote } from './AuthShell';
import UpiPay from './UpiPay';
import { APP_NAME } from '../lib/brand';
import { api } from '../lib/api';
import { currencySymbol, formatMoney, fromCents, pendingKey, toCents } from '../lib/money';

const ALL = '__all';

// Pick sensible people when opened from the generic "Settle up" button:
// someone the user owes, else someone who owes the user.
function defaultPair(debts, members, me) {
  const iOwe = debts.find((d) => d.debtor === me);
  if (iOwe) return [me, iOwe.creditor];
  const owesMe = debts.find((d) => d.creditor === me);
  if (owesMe) return [owesMe.debtor, me];
  return [me, members.find((m) => m.user_id !== me)?.user_id ?? ''];
}

// Record a payment between two members, one bucket at a time or all of
// them at once. `preset` ({ from, to, bucket? }) pre-fills it from a row.
// Unless the person being paid records it, it waits for them to confirm.
export default function SettleModal({ open, onClose, group, people, me, isOwner, debts, pending, preset, onSaved }) {
  const members = useMemo(() => people.filter((p) => p.is_member), [people]);
  const [from, setFrom] = useState(me);
  const [to, setTo] = useState('');
  const [bucket, setBucket] = useState(ALL);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // What's still payable per bucket once payments awaiting confirmation are taken off
  const payableFor = (f, t) =>
    debts
      .filter((d) => d.debtor === f && d.creditor === t)
      .map((d) => {
        const waiting = pending.get(pendingKey(f, t, d.bucket)) || 0;
        return { ...d, waiting, cents: d.cents - waiting };
      });
  const all = useMemo(() => payableFor(from, to), [debts, pending, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const owed = all.filter((d) => d.cents > 0);
  const waitingOnly = all.filter((d) => d.cents <= 0);
  const reverseOwed = debts.some((d) => d.debtor === to && d.creditor === from);
  const totalCents = owed.reduce((a, d) => a + d.cents, 0);
  const receiver = to === me;
  // Paying someone with a UPI ID: offer to open the UPI app first
  const payeeUpi = from === me && group.currency === 'INR' ? people.find((p) => p.user_id === to)?.upi_id : null;
  const payCents = bucket === ALL ? totalCents : toCents(amount);
  const selected = owed.find((d) => d.bucket === bucket);

  // Whenever the pair changes, start from "everything" (or the only bucket)
  const pickBucket = (list, wanted) => {
    const b = wanted && list.some((d) => d.bucket === wanted) ? wanted : list.length === 1 ? list[0].bucket : ALL;
    setBucket(b);
    const d = list.find((x) => x.bucket === b);
    setAmount(d ? String(fromCents(d.cents)) : '');
  };

  useEffect(() => {
    if (!open) return;
    const [f, t] = preset ? [preset.from, preset.to] : defaultPair(debts, members, me);
    setFrom(f);
    setTo(t);
    pickBucket(payableFor(f, t).filter((d) => d.cents > 0), preset?.bucket);
    setNote('');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePair = (f, t) => {
    setFrom(f);
    setTo(t);
    setError('');
    pickBucket(payableFor(f, t).filter((d) => d.cents > 0));
  };

  const nameOf = (id) => (id === me ? 'You' : members.find((m) => m.user_id === id)?.display_name || '');
  const cur = group.currency;

  const save = async (e) => {
    e?.preventDefault();
    if (!isOwner && from !== me && to !== me) return setError('You can only record payments you made or received');
    setError('');
    setBusy(true);
    try {
      const sent = `Sent to ${nameOf(to)} to confirm`;
      if (bucket === ALL) {
        const { count } = await api.clearBuckets({ groupId: group.id, from, to, note });
        onSaved(receiver ? `Cleared ${count} bucket${count === 1 ? '' : 's'}` : sent);
      } else {
        const cents = toCents(amount);
        if (!(cents > 0)) throw new Error('Enter an amount');
        if (cents > selected.cents) throw new Error(`That's more than the ${formatMoney(fromCents(selected.cents), cur)} owed for ${bucket}`);
        if (cents === selected.cents) {
          await api.clearBuckets({ groupId: group.id, from, to, buckets: [bucket], note });
          onSaved(receiver ? `${bucket} cleared` : sent);
        } else {
          await api.addSettlement({ groupId: group.id, from, to, bucket, amount: fromCents(cents), note });
          onSaved(receiver ? `Part of ${bucket} recorded` : sent);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="settle-title">
      <form onSubmit={save} className="space-y-5">
        <h2 id="settle-title" className="pr-10 text-[22px] font-semibold text-ink">Settle up</h2>

        <div className="flex items-center justify-center gap-4 py-1">
          <div className="flex w-24 flex-col items-center gap-1.5 text-center">
            <Avatar id={from} name={nameOf(from)} size="lg" />
            <span className="w-full truncate text-[13px] font-medium text-ink">{nameOf(from)}</span>
          </div>
          <button
            type="button"
            onClick={() => changePair(to, from)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-brand-500 transition-colors hover:bg-surface-elevated"
            aria-label="Swap who paid"
            title="Swap"
          >
            <Icon name="swap" className="h-5 w-5" strokeWidth={2} />
          </button>
          <div className="flex w-24 flex-col items-center gap-1.5 text-center">
            <Avatar id={to} name={nameOf(to)} size="lg" />
            <span className="w-full truncate text-[13px] font-medium text-ink">{nameOf(to)}</span>
          </div>
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="settle-from" className="label">Who paid</label>
            <select id="settle-from" className="input-field" value={from} onChange={(e) => changePair(e.target.value, to)}>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.user_id === me ? 'You' : m.display_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="settle-to" className="label">Paid to</label>
            <select id="settle-to" className="input-field" value={to} onChange={(e) => changePair(from, e.target.value)}>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.user_id === me ? 'You' : m.display_name}</option>
              ))}
            </select>
          </div>
        </div>

        {owed.length === 0 ? (
          <div className="rounded-2xl bg-surface-elevated/60 px-4 py-4 text-center text-[14px] text-slate-600">
            {from === to
              ? 'Pick two different people.'
              : waitingOnly.length
                ? `Everything here is already waiting for ${to === me ? 'you' : nameOf(to)} to confirm.`
                : `${nameOf(from)} ${from === me ? "don't" : "doesn't"} owe ${to === me ? 'you' : nameOf(to)} anything.`}
            {reverseOwed && from !== to && (
              <button type="button" onClick={() => changePair(to, from)} className="mt-2 block w-full font-medium text-brand-600 hover:text-brand-700">
                It's the other way round. Swap
              </button>
            )}
          </div>
        ) : (
          <>
            <div>
              <span className="label">What to clear</span>
              <div role="radiogroup" aria-label="Bucket to clear" className="space-y-1.5">
                {owed.length > 1 && (
                  <BucketOption active={bucket === ALL} onClick={() => pickBucket(owed, ALL)} label="All buckets" amount={formatMoney(fromCents(totalCents), cur)}>
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                      <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                  </BucketOption>
                )}
                {owed.map((d) => (
                  <BucketOption key={d.bucket} active={bucket === d.bucket} onClick={() => pickBucket(owed, d.bucket)} label={d.bucket} amount={formatMoney(fromCents(d.cents), cur)}>
                    <BucketIcon name={d.bucket} size="sm" />
                  </BucketOption>
                ))}
                {waitingOnly.map((d) => (
                  <div key={d.bucket} className="flex items-center gap-3 rounded-2xl px-3 py-2 opacity-60">
                    <BucketIcon name={d.bucket} size="sm" />
                    <span className="flex-1 text-[14px] text-ink">{d.bucket}</span>
                    <span className="text-[12px] font-medium text-amber-600">Waiting to confirm</span>
                  </div>
                ))}
              </div>
              {!receiver && (
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500">
                  <Icon name="bell" className="h-3.5 w-3.5" /> {nameOf(to)} confirms it before anything is cleared.
                </p>
              )}
            </div>

            {bucket !== ALL && selected && (
              <div>
                <label htmlFor="settle-amount" className="label">
                  Amount <span className="font-normal text-slate-400">(less than {formatMoney(fromCents(selected.cents), cur)} is a part payment)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{currencySymbol(cur)}</span>
                  <input
                    id="settle-amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    max={fromCents(selected.cents)}
                    className="input-field no-spin pl-9 text-[18px] font-semibold"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="settle-note" className="label">Note <span className="font-normal text-slate-400">(optional)</span></label>
              <input id="settle-note" className="input-field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="UPI, cash…" />
            </div>

            {payeeUpi && payCents > 0 && (!selected || payCents <= selected.cents || bucket === ALL) ? (
              <>
                <UpiPay
                  payee={nameOf(to)}
                  vpa={payeeUpi}
                  amount={fromCents(payCents)}
                  note={`${APP_NAME} · ${group.name} · ${bucket === ALL ? owed.map((d) => d.bucket).join(', ') : bucket}`}
                  busy={busy}
                  onPaid={() => save()}
                />
                <button type="submit" disabled={busy} className="block w-full text-center text-[13px] font-medium text-slate-500 hover:text-ink">
                  Paid another way (cash, bank)? Just send it to confirm
                </button>
              </>
            ) : (
            <button type="submit" disabled={busy} className="btn-primary h-12 w-full">
              {busy
                ? 'Saving…'
                : !receiver
                  ? `Send to ${nameOf(to)} to confirm`
                  : bucket === ALL
                    ? `Clear all · ${formatMoney(fromCents(totalCents), cur)}`
                    : toCents(amount) === selected?.cents
                      ? `Clear ${bucket}`
                      : 'Record part payment'}
            </button>
            )}
            {from === me && !payeeUpi && group.currency === 'INR' && (
              <p className="text-center text-[12px] text-slate-500">
                {nameOf(to)} hasn’t added a UPI ID yet, so pay them any way you like and record it here.
              </p>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}

function BucketOption({ active, onClick, label, amount, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-150 ${
        active ? 'bg-brand-500/10 ring-2 ring-brand-500' : 'ring-1 ring-line/[0.08] hover:bg-surface-elevated'
      }`}
    >
      {children}
      <span className="flex-1 text-[15px] font-medium text-ink">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-ink">{amount}</span>
    </button>
  );
}

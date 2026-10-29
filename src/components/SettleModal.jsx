import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import Icon from './Icon';
import BucketIcon from './BucketIcon';
import { ErrorNote } from './AuthShell';
import UpiPay from './UpiPay';
import { PillSelect } from './Field';
import Segmented from './Segmented';
import SmartSettle from './SmartSettle';
import { APP_NAME } from '../lib/brand';
import { api } from '../lib/api';
import { currencySymbol, formatMoney, fromCents, pendingKey, toCents } from '../lib/money';

const ALL = '__all';
// Every bucket between the two people, both directions, netted into one payment
const NET = '__net';

// Pick sensible people when opened from the generic "Settle up" button:
// someone the user owes, else someone who owes the user.
function defaultPair(debts, members, me) {
  const iOwe = debts.find((d) => d.debtor === me);
  if (iOwe) return [me, iOwe.creditor];
  const owesMe = debts.find((d) => d.creditor === me);
  if (owesMe) return [owesMe.debtor, me];
  return [me, members.find((m) => m.user_id !== me)?.user_id ?? ''];
}

// Settle, three ways: "Smart settle" (fewest payments across the whole
// group), "With a person" (everything between you and them, netted) and
// "One bucket" (all or part of a single bucket). `preset` ({ from, to,
// bucket?, mode? }) pre-fills it. Unless the person being paid records a
// payment, it waits for them to confirm.
export default function SettleModal({ open, onClose, group, people, me, isOwner, debts, pending, plan, hasPending, preset, onSaved }) {
  const members = useMemo(() => people.filter((p) => p.is_member), [people]);
  const [from, setFrom] = useState(me);
  const [to, setTo] = useState('');
  const [bucket, setBucket] = useState(ALL);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('person'); // smart | person | bucket
  const [other, setOther] = useState('');

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
  const selected = owed.find((d) => d.bucket === bucket);
  // What the other person owes back; with debts both ways, "everything" nets them
  const reverse = useMemo(() => payableFor(to, from).filter((d) => d.cents > 0), [debts, pending, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const reverseCents = reverse.reduce((a, d) => a + d.cents, 0);
  const netCents = totalCents - reverseCents;
  const netAvailable = owed.length > 0 && reverse.length > 0;

  // Point "Paid by → Paid to" the way the net money flows
  const orientNet = (f, t) => {
    const sum = (x, y) => payableFor(x, y).reduce((a, d) => a + Math.max(d.cents, 0), 0);
    return sum(t, f) > sum(f, t) ? [t, f] : [f, t];
  };
  const chooseNet = () => {
    const [f, t] = orientNet(from, to);
    setFrom(f);
    setTo(t);
    setBucket(NET);
    setAmount('');
  };

  // Whenever the pair changes, start from "everything" (or the only bucket)
  const pickBucket = (list, wanted) => {
    if (wanted === NET) return chooseNet();
    const b = wanted && list.some((d) => d.bucket === wanted) ? wanted : list.length === 1 ? list[0].bucket : ALL;
    setBucket(b);
    const d = list.find((x) => x.bucket === b);
    setAmount(d ? String(fromCents(d.cents)) : '');
  };

  useEffect(() => {
    if (!open) return;
    // "Everything" needs something payable both ways; otherwise open normally
    const bothWays = preset && [payableFor(preset.from, preset.to), payableFor(preset.to, preset.from)].every((l) => l.some((d) => d.cents > 0));
    const net = preset?.bucket === NET && bothWays;
    const [f, t] = net ? orientNet(preset.from, preset.to) : preset ? [preset.from, preset.to] : defaultPair(debts, members, me);
    setFrom(f);
    setTo(t);
    if (net) {
      setBucket(NET);
      setAmount('');
    } else {
      pickBucket(payableFor(f, t).filter((d) => d.cents > 0), preset?.bucket);
    }
    const m = preset?.mode ?? (preset?.bucket === NET ? 'person' : preset ? 'bucket' : plan ? 'smart' : 'person');
    setMode(m);
    if (m === 'person') setPerson(preset ? (preset.from === me ? preset.to : preset.from) : f === me ? t : f);
    setNote('');
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // "With a person": net both ways if needed, otherwise everything one way
  const setPerson = (o) => {
    setOther(o);
    setError('');
    const fwd = payableFor(me, o).some((d) => d.cents > 0);
    const back = payableFor(o, me).some((d) => d.cents > 0);
    if (fwd && back) {
      const [f, t] = orientNet(me, o);
      setFrom(f);
      setTo(t);
      setBucket(NET);
    } else {
      setFrom(back ? o : me);
      setTo(back ? me : o);
      setBucket(ALL);
    }
    setAmount('');
  };

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
      if (bucket === NET) {
        const res = await api.settlePair({ groupId: group.id, a: from, b: to, note });
        onSaved(res.status === 'confirmed' ? (Number(res.net) === 0 ? 'All square · every bucket cleared' : 'Everything settled') : sent);
      } else if (bucket === ALL) {
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

  const paying = from === me && !receiver && cur === 'INR';
  const amountCents = bucket === NET ? Math.max(netCents, 0) : bucket === ALL ? totalCents : toCents(amount);
  const options = [
    ...(owed.length > 1 ? [{ value: ALL, label: `All ${nameOf(from) === 'You' ? 'you owe' : `${nameOf(from)} owes`}`, cents: totalCents }] : []),
    ...owed.map((d) => ({ value: d.bucket, label: d.bucket, cents: d.cents })),
  ];

  const paymentTail = (
    <>
            {paying && amountCents > 0 && (
              <UpiPay
                payee={nameOf(to)}
                vpa={people.find((p) => p.user_id === to)?.upi_id || ''}
                amount={fromCents(amountCents)}
                note={`${APP_NAME} · ${group.name} · ${bucket === NET ? 'settle everything' : bucket === ALL ? owed.map((d) => d.bucket).join(', ') : bucket}`}
              />
            )}

            <div className="flex gap-2">
              <input
                aria-label="Note"
                className="input-field !py-2.5 text-[14px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder="Note (optional): UPI, cash…"
              />
            </div>

            <button type="submit" disabled={busy} className="btn-primary h-12 w-full">
              {busy ? (
                'Saving…'
              ) : bucket === NET && !netCents ? (
                'Clear everything · you’re even'
              ) : !receiver ? (
                <>
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> {from === me ? `I’ve paid · send to ${nameOf(to)}` : `Send to ${nameOf(to)} to confirm`}
                </>
              ) : bucket === NET ? (
                netCents ? `Settle everything · ${formatMoney(fromCents(netCents), cur)}` : 'Clear everything · you’re even'
              ) : bucket === ALL ? (
                `Clear all · ${formatMoney(fromCents(totalCents), cur)}`
              ) : toCents(amount) === selected?.cents ? (
                `Clear ${bucket}`
              ) : (
                'Record part payment'
              )}
            </button>
    </>
  );

  const bucketView = (
    <>
        {/* Who paid ⇄ who got paid: avatar and name together */}
        <div className="flex items-center gap-1.5">
          <PersonPicker label="Paid by" id="settle-from" value={from} members={members} me={me} nameOf={nameOf} onChange={(v) => changePair(v, to)} />
          <button
            type="button"
            onClick={() => changePair(to, from)}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-brand-500 transition-[transform,background-color] duration-300 hover:bg-[rgb(var(--line)/0.08)] active:rotate-180"
            aria-label="Swap who paid"
            title="Swap"
          >
            <Icon name="swap" className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
          <PersonPicker label="Paid to" id="settle-to" value={to} members={members} me={me} nameOf={nameOf} onChange={(v) => changePair(from, v)} />
        </div>

        <ErrorNote>{error}</ErrorNote>

        {owed.length === 0 ? (
          <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] px-4 py-4 text-center text-[14px] text-slate-600">
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
            {/* What to clear + how much, in one row */}
            <div>
              <div className="flex items-stretch gap-2">
                <label className="relative flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface-card py-1.5 pl-2 pr-8 ring-1 ring-[rgb(var(--line)/0.1)] focus-within:ring-2 focus-within:ring-brand-500/60">
                  {bucket === NET ? (
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
                      <Icon name="swap" className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                  ) : bucket === ALL ? (
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                      <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                  ) : (
                    <BucketIcon name={bucket} size="sm" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Clearing</span>
                    <select
                      aria-label="Bucket to clear"
                      value={bucket}
                      onChange={(e) => pickBucket(owed, e.target.value)}
                      className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
                    >
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} · {formatMoney(fromCents(o.cents), cur)}
                        </option>
                      ))}
                    </select>
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {bucket === NET ? 'Everything' : bucket === ALL ? 'All buckets' : bucket}
                      <span className="font-normal text-slate-500">
                        {' · '}
                        {bucket === NET
                          ? `${owed.length + reverse.length} buckets`
                          : formatMoney(fromCents(bucket === ALL ? totalCents : selected?.cents || 0), cur)}
                      </span>
                    </span>
                  </span>
                  {options.length > 1 && (
                    <Icon name="chevron" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
                  )}
                </label>
                <label className="relative flex w-[34%] flex-shrink-0 flex-col justify-center rounded-2xl bg-surface-card px-3 py-1.5 ring-1 ring-[rgb(var(--line)/0.1)] focus-within:ring-2 focus-within:ring-brand-500/60">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">Amount</span>
                  <span className="flex items-center gap-0.5">
                    <span className="text-[15px] text-slate-500">{currencySymbol(cur)}</span>
                    <input
                      id="settle-amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      max={selected ? fromCents(selected.cents) : undefined}
                      readOnly={bucket === ALL || bucket === NET}
                      className="no-spin w-full min-w-0 bg-transparent text-[16px] font-semibold tabular-nums text-ink outline-none read-only:text-slate-500"
                      value={bucket === NET ? fromCents(Math.max(netCents, 0)) : bucket === ALL ? fromCents(totalCents) : amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </span>
                </label>
              </div>
              <p className="mt-1.5 px-1 text-[11px] leading-snug text-slate-500">
                {bucket === NET
                  ? `${nameOf(from)} ${from === me ? 'owe' : 'owes'} ${formatMoney(fromCents(totalCents), cur)}, ${to === me ? 'you owe' : `${nameOf(to)} owes`} ${formatMoney(fromCents(reverseCents), cur)} back, so ${
                      netCents ? `only ${formatMoney(fromCents(netCents), cur)} changes hands` : 'you’re even'
                    } and every bucket between you clears.`
                  : bucket === ALL
                    ? 'Clears every bucket at once.'
                    : 'Less than the full amount is a part payment.'}
                {!receiver && ` ${nameOf(to)} confirms before anything clears.`}
                {waitingOnly.length > 0 && ` ${waitingOnly.map((d) => d.bucket).join(', ')} already waiting to confirm.`}
              </p>
            </div>

            {paymentTail}
          </>
        )}
    </>
  );

  // Every bucket between you and one person, signed from your side
  const otherId = other;
  const withRows = [
    ...payableFor(me, otherId).filter((d) => d.cents > 0).map((d) => ({ ...d, sign: -1 })),
    ...payableFor(otherId, me).filter((d) => d.cents > 0).map((d) => ({ ...d, sign: 1 })),
  ];
  const personNet = withRows.reduce((a, d) => a + d.sign * d.cents, 0); // positive: they owe you
  const personView = (
    <>
      <PillSelect
        label="Settle everything with"
        id="settle-with"
        value={otherId}
        onChange={setPerson}
        leading={<Avatar id={otherId} name={nameOf(otherId)} size="md" className="!ring-0" />}
        options={members.filter((m) => m.user_id !== me).map((m) => ({ value: m.user_id, label: m.display_name }))}
      />
      <ErrorNote>{error}</ErrorNote>
      {withRows.length === 0 ? (
        <p className="rounded-2xl bg-[rgb(var(--line)/0.05)] px-4 py-5 text-center text-[14px] text-slate-600">
          {waitingOnly.length || payableFor(otherId, me).some((d) => d.waiting) ? `Everything with ${nameOf(otherId)} is waiting to be confirmed.` : `You and ${nameOf(otherId)} are square.`}
        </p>
      ) : (
        <>
          <div className="rounded-2xl bg-[rgb(var(--line)/0.05)] p-3 ring-1 ring-[rgb(var(--line)/0.06)]">
            <ul className="space-y-1">
              {withRows.map((d) => (
                <li key={`${d.bucket}${d.sign}`} className="flex items-center gap-2.5 text-[14px]">
                  <BucketIcon name={d.bucket} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-ink">{d.bucket}</span>
                  <span className="text-[12px] text-slate-500">{d.sign < 0 ? 'you owe' : 'owes you'}</span>
                  <span className={`w-24 text-right font-semibold tabular-nums ${d.sign < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatMoney(fromCents(d.cents), cur)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-[rgb(var(--line)/0.1)] pt-2 text-[14px]">
              <span className="font-medium text-ink">
                {personNet > 0 ? `${nameOf(otherId)} pays you` : personNet < 0 ? `You pay ${nameOf(otherId)}` : 'You’re even'}
              </span>
              <span className="text-[17px] font-semibold tabular-nums text-ink">{formatMoney(fromCents(Math.abs(personNet)), cur)}</span>
            </div>
          </div>
          <p className="px-1 text-[11px] leading-snug text-slate-500">
            Every bucket between you clears{personNet !== 0 && !receiver ? ` once ${nameOf(to)} confirms` : ''}.
          </p>
          {paymentTail}
        </>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} labelledBy="settle-title">
      <form onSubmit={save} className="space-y-3.5">
        <h2 id="settle-title" className="pr-10 text-[20px] font-semibold text-ink">Settle</h2>

        <Segmented
          label="How to settle"
          size="sm"
          className="flex w-full"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
            if (m === 'person') setPerson(other || (from === me ? to : from));
            if (m === 'bucket') pickBucket(payableFor(from, to).filter((d) => d.cents > 0));
          }}
          options={[
            { value: 'smart', label: 'Smart settle' },
            { value: 'person', label: 'With a person' },
            { value: 'bucket', label: 'One bucket' },
          ]}
        />

        {mode === 'smart' ? (
          <SmartSettle group={group} people={people} me={me} isOwner={isOwner} debts={debts} plan={plan} hasPending={hasPending} onDone={onSaved} />
        ) : plan ? (
          <div className="rounded-2xl bg-amber-500/10 px-4 py-4 text-center text-[14px] text-amber-800 dark:text-amber-200">
            A smart settle is in progress, so other payments are paused until it’s done.
            <button type="button" onClick={() => setMode('smart')} className="mt-2 block w-full font-semibold text-brand-600">
              Open smart settle
            </button>
          </div>
        ) : mode === 'person' ? (
          personView
        ) : (
          bucketView
        )}
      </form>
    </Modal>
  );
}

// Avatar + name in one pill
function PersonPicker({ label, id, value, members, me, nameOf, onChange }) {
  return (
    <PillSelect
      label={label}
      id={id}
      value={value}
      onChange={onChange}
      className="flex-1"
      leading={<Avatar id={value} name={nameOf(value)} size="md" className="!ring-0" />}
      options={members.map((m) => ({ value: m.user_id, label: m.user_id === me ? 'You' : m.display_name }))}
    />
  );
}

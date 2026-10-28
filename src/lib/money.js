// All split math runs on integer paise/cents so nothing drifts by a rupee.

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

// toPrecision first so binary float noise (1.005 * 100 = 100.49999…) can't
// round the wrong way
export const toCents = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(12))) : NaN;
};

export const fromCents = (cents) => cents / 100;

const formatters = new Map();

export function formatMoney(amount, currency = 'INR') {
  const n = Number(amount) || 0;
  const whole = Math.abs(Math.round(n * 100)) % 100 === 0;
  const key = `${currency}:${whole}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
      })
    );
  }
  return formatters.get(key).format(n);
}

export function currencySymbol(currency = 'INR') {
  return (
    new Intl.NumberFormat('en-IN', { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  );
}

// Equal split: leftover paise go one each to the first people in the list.
export function splitEqual(totalCents, userIds) {
  const n = userIds.length;
  if (!n) return {};
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  const out = {};
  for (const id of userIds) {
    out[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return out;
}

// Percent split. `percents` maps user id → percent (numbers summing to 100).
// Rounding leftovers land on the largest shares first.
export function splitPercent(totalCents, percents) {
  const entries = Object.entries(percents).filter(([, p]) => p > 0);
  const raw = entries.map(([id, p]) => [id, (totalCents * p) / 100]);
  const out = Object.fromEntries(raw.map(([id, v]) => [id, Math.floor(v)]));
  let remainder = totalCents - Object.values(out).reduce((a, b) => a + b, 0);
  const order = [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1) || b[1] - a[1]);
  for (let i = 0; remainder > 0 && order.length; i = (i + 1) % order.length, remainder -= 1) {
    out[order[i][0]] += 1;
  }
  return out;
}

// Who owes whom, per bucket (same rules as bucket_debts() in schema.sql).
// Inside one bucket, debts between the same two people cancel out; separate
// buckets never mix. Returns [{ bucket, debtor, creditor, cents }].
export function bucketDebts(expenses, settlements) {
  const pairs = new Map();
  const add = (bucket, debtor, creditor, cents) => {
    const [a, b] = debtor < creditor ? [debtor, creditor] : [creditor, debtor];
    const key = `${bucket}\u0000${a}\u0000${b}`;
    const entry = pairs.get(key) || { bucket, a, b, owed: 0 };
    entry.owed += debtor === a ? cents : -cents; // positive: a owes b
    pairs.set(key, entry);
  };
  for (const e of expenses) {
    for (const s of e.expense_splits) {
      if (s.user_id !== e.paid_by) add(e.bucket, s.user_id, e.paid_by, toCents(s.amount));
    }
  }
  // A confirmed payment from A to B cancels that much of A's debt to B
  for (const s of settlements) {
    if (s.status === 'confirmed') add(s.bucket, s.to_user, s.from_user, toCents(s.amount));
  }

  return [...pairs.values()]
    .filter((p) => p.owed !== 0)
    .map((p) => ({
      bucket: p.bucket,
      debtor: p.owed > 0 ? p.a : p.b,
      creditor: p.owed > 0 ? p.b : p.a,
      cents: Math.abs(p.owed),
    }))
    .sort((x, y) => y.cents - x.cents);
}

// Payments sent but not yet accepted by the receiver, in cents, keyed by
// pendingKey(). Mirrors payable_amount() in schema.sql.
export const pendingKey = (from, to, bucket) => `${from}>${to}>${bucket}`;

export function pendingPayments(settlements) {
  const map = new Map();
  for (const s of settlements) {
    if (s.status !== 'pending') continue;
    const key = pendingKey(s.from_user, s.to_user, s.bucket);
    map.set(key, (map.get(key) || 0) + toCents(s.amount));
  }
  return map;
}

// Group bucket debts by the two people involved: [{ debtor, creditor, cents, buckets: [...] }]
export function debtsByPair(debts) {
  const map = new Map();
  for (const d of debts) {
    const key = `${d.debtor}>${d.creditor}`;
    const pair = map.get(key) || { debtor: d.debtor, creditor: d.creditor, cents: 0, buckets: [] };
    pair.cents += d.cents;
    pair.buckets.push(d);
    map.set(key, pair);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents);
}

// "₹1,200 · $40" when someone has groups in more than one currency
export function formatTotals(byCurrency) {
  const parts = Object.entries(byCurrency)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .map(([cur, v]) => formatMoney(v, cur));
  return parts.length ? parts.join(' · ') : formatMoney(0, Object.keys(byCurrency)[0] || 'INR');
}

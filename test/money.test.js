import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEqual, splitPercent, bucketDebts, debtsByPair, pendingPayments, pendingKey, toCents } from '../src/lib/money.js';

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('equal split hands leftover paise to the first people', () => {
  assert.deepEqual(splitEqual(1000, ['a', 'b', 'c']), { a: 334, b: 333, c: 333 });
  assert.equal(sum(splitEqual(100001, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])), 100001);
});

test('percent split always adds up to the total', () => {
  const out = splitPercent(1000, { a: 33.33, b: 33.33, c: 33.34 });
  assert.equal(sum(out), 1000);
  assert.deepEqual(splitPercent(999, { a: 50, b: 50 }), { a: 500, b: 499 });
});

test('toCents avoids float drift', () => {
  assert.equal(toCents('0.29'), 29);
  assert.equal(toCents('1234.56'), 123456);
});

const exp = (bucket, paid_by, shares) => ({
  bucket,
  paid_by,
  expense_splits: Object.entries(shares).map(([user_id, amount]) => ({ user_id, amount })),
});

test('same bucket cancels out between two people', () => {
  // P owes N 50 for a cab, next day N owes P 50 for a cab
  const debts = bucketDebts([exp('Cab', 'N', { P: 50, N: 50 }), exp('Cab', 'P', { P: 50, N: 50 })], []);
  assert.deepEqual(debts, []);
});

test('different buckets stay separate', () => {
  const debts = bucketDebts([exp('Cab', 'N', { P: 50 }), exp('Groceries', 'P', { N: 50 })], []);
  assert.deepEqual(
    debts.map((d) => [d.bucket, d.debtor, d.creditor, d.cents]).sort(),
    [['Cab', 'P', 'N', 5000], ['Groceries', 'N', 'P', 5000]]
  );
});

test('a payment clears only its own bucket', () => {
  const expenses = [exp('Cab', 'N', { P: 50 }), exp('Food', 'N', { P: 120 })];
  const debts = bucketDebts(expenses, [{ bucket: 'Cab', from_user: 'P', to_user: 'N', amount: 50, status: 'confirmed' }]);
  assert.deepEqual(debts, [{ bucket: 'Food', debtor: 'P', creditor: 'N', cents: 12000 }]);
});

test('debtsByPair totals each person-to-person debt', () => {
  const debts = bucketDebts([exp('Cab', 'N', { P: 50 }), exp('Food', 'N', { P: 120 }), exp('Food', 'A', { P: 10 })], []);
  const pairs = debtsByPair(debts);
  assert.equal(pairs[0].cents, 17000);
  assert.equal(pairs[0].buckets.length, 2);
  assert.equal(pairs[1].creditor, 'A');
});

test('pending and declined payments do not clear anything until confirmed', () => {
  const expenses = [exp('Cab', 'N', { P: 50 })];
  const pending = { bucket: 'Cab', from_user: 'P', to_user: 'N', amount: 50, status: 'pending' };
  const rejected = { ...pending, status: 'rejected' };
  assert.equal(bucketDebts(expenses, [pending, rejected]).length, 1);
  assert.equal(pendingPayments([pending, rejected]).get(pendingKey('P', 'N', 'Cab')), 5000);
  assert.equal(bucketDebts(expenses, [{ ...pending, status: 'confirmed' }]).length, 0);
});

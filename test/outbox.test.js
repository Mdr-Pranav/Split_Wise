import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal browser bits the outbox uses
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { enqueue, flush, queued, discard } = await import('../src/lib/outbox.js');

beforeEach(() => store.clear());

const expense = (clientId, groupId = 'g1') => ({ clientId, groupId, bucket: 'Food', amount: 10 });

test('queued items are per user and per group', () => {
  enqueue('u1', expense('a'));
  enqueue('u1', expense('b', 'g2'));
  enqueue('u2', expense('c'));
  assert.deepEqual(queued('u1').map((i) => i.clientId), ['a', 'b']);
  assert.deepEqual(queued('u1', 'g2').map((i) => i.clientId), ['b']);
});

test('flush sends with the client id and removes what was sent', async () => {
  enqueue('u1', expense('a'));
  enqueue('u1', expense('b'));
  const sent = [];
  const result = await flush('u1', async (e) => sent.push(e.clientId));
  assert.deepEqual(result, { sent: 2, failed: 0 });
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(queued('u1').length, 0);
});

test('a network failure stops and keeps everything for later', async () => {
  enqueue('u1', expense('a'));
  enqueue('u1', expense('b'));
  const result = await flush('u1', async () => {
    throw new Error('TypeError: Failed to fetch');
  });
  assert.deepEqual(result, { sent: 0, failed: 0 });
  assert.equal(queued('u1').length, 2);
});

test('a refused expense keeps its error, is not retried, and can be discarded', async () => {
  enqueue('u1', expense('a'));
  await flush('u1', async () => {
    throw new Error('The payer must be in the group');
  });
  assert.equal(queued('u1')[0].error, 'The payer must be in the group');
  let calls = 0;
  await flush('u1', async () => calls++);
  assert.equal(calls, 0);
  discard('a');
  assert.equal(queued('u1').length, 0);
});

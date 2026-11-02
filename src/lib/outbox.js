// New expenses added while offline wait here and are sent when the
// connection is back. Each carries a client id, so if a send goes through
// but the reply is lost, sending it again can't add it twice (see p_client_id
// in save_expense). Edits, deletes and payments need a connection.

import { isNetworkError } from './offline.js';

const KEY = 'splitzy-outbox';
const listeners = new Set();

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full
  }
  listeners.forEach((fn) => fn());
}

export function onOutboxChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The user's waiting expenses, optionally for one group
export const queued = (userId, groupId) => read().filter((i) => i.userId === userId && (!groupId || i.expense.groupId === groupId));

export function enqueue(userId, expense) {
  const item = { clientId: expense.clientId, userId, expense, queuedAt: new Date().toISOString(), error: null };
  write([...read().filter((i) => i.clientId !== item.clientId), item]);
  return item;
}

export const discard = (clientId) => write(read().filter((i) => i.clientId !== clientId));

let flushing = false;

// Sends what's waiting. Stops at the first network failure; anything the
// server refuses (say the payer left the group) stays with its error so the
// user can see it and discard it.
export async function flush(userId, save) {
  if (flushing || !userId || !navigator.onLine) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of queued(userId).filter((i) => !i.error)) {
      try {
        await save({ ...item.expense, clientId: item.clientId, fromOutbox: true });
        write(read().filter((i) => i.clientId !== item.clientId));
        sent += 1;
      } catch (err) {
        if (isNetworkError(err)) break;
        write(read().map((i) => (i.clientId === item.clientId ? { ...i, error: err.message } : i)));
        failed += 1;
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

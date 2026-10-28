// Demo backend: used when no Supabase keys are configured. Mirrors the rules
// in supabase/schema.sql against data kept in localStorage, so every screen
// can be tried locally before deploying.

import { bucketDebts, fromCents, toCents } from './money';
import { isValidUpi } from './upi';

// Bumped when the sample data's shape changes, so old demo data is replaced
const KEY = 'splitzy-demo-v8';
const SESSION_KEY = 'splitzy-demo-session';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const dateOnly = (iso) => iso.slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

function seed() {
  const [me, rahul, aisha, kabir, neha] = ['pranav', 'rahul', 'aisha', 'kabir', 'neha'].map((n) => ({
    id: uid(),
    display_name: n[0].toUpperCase() + n.slice(1),
    email: `${n}@demo.app`,
    password: 'demo',
    // Everyone but Pranav has a UPI ID, so his Settings shows the prompt
    upi_id: n === 'pranav' ? null : `${n}@okaxis`,
    // A couple of people already picked an emoji
    avatar_emoji: { aisha: '🦋', kabir: '🏄' }[n] ?? null,
    avatar_color: { aisha: '#ffd60a' }[n] ?? null,
    created_at: daysAgo(30),
  }));
  const goa = { id: uid(), name: 'Goa Trip', owner_id: me.id, currency: 'INR', nudge_after_days: 3, avatar_emoji: '🏖️', avatar_color: '#30b0c7', created_at: daysAgo(20) };
  const flat = { id: uid(), name: 'Flat 302', owner_id: rahul.id, currency: 'INR', nudge_after_days: 3, avatar_emoji: null, avatar_color: null, created_at: daysAgo(25) };

  const expense = (group, bucket, note, amount, paidBy, shares, ago, split_type = 'equal') => ({
    id: uid(),
    group_id: group.id,
    bucket,
    note,
    amount,
    paid_by: paidBy.id,
    split_type,
    expense_date: dateOnly(daysAgo(ago)),
    created_by: paidBy.id,
    created_at: daysAgo(ago),
    expense_splits: shares.map(([u, a]) => ({ user_id: u.id, amount: a })),
  });

  const payment = (group, from, to, bucket, amount, note, ago, status) => ({
    id: uid(),
    group_id: group.id,
    from_user: from.id,
    to_user: to.id,
    bucket,
    amount,
    note,
    settled_on: dateOnly(daysAgo(ago)),
    status,
    batch_id: uid(),
    decided_at: status === 'pending' ? null : daysAgo(ago),
    created_by: from.id,
    created_at: daysAgo(ago),
  });

  return {
    users: [me, rahul, aisha, kabir, neha],
    groups: [goa, flat],
    members: [
      { group_id: goa.id, user_id: me.id, joined_at: daysAgo(20) },
      { group_id: goa.id, user_id: aisha.id, joined_at: daysAgo(19) },
      { group_id: goa.id, user_id: kabir.id, joined_at: daysAgo(19) },
      { group_id: flat.id, user_id: rahul.id, joined_at: daysAgo(25) },
      { group_id: flat.id, user_id: me.id, joined_at: daysAgo(24) },
    ],
    invites: [
      { id: uid(), group_id: goa.id, code: 'GOA7K2MX', created_by: me.id, expires_at: new Date(Date.now() + 20 * 3600000).toISOString(), used_by: null, used_at: null, revoked: false, created_at: daysAgo(0) },
    ],
    requests: [{ id: uid(), group_id: goa.id, user_id: neha.id, status: 'pending', created_at: daysAgo(1), decided_at: null }],
    // Rahul reminding Pranav about the bills (shows in Pranav's bell)
    nudges: [
      { id: uid(), group_id: flat.id, from_user: rahul.id, to_user: me.id, amount: 2059.5, buckets: [{ bucket: 'Bills', amount: 2059.5 }], created_at: daysAgo(0.1), dismissed_at: null },
    ],
    expenses: [
      expense(goa, 'Travel', 'Flights to Goa', 21000, aisha, [[me, 7000], [aisha, 7000], [kabir, 7000]], 15),
      expense(goa, 'Stay', 'Villa booking', 18000, me, [[me, 6000], [aisha, 6000], [kabir, 6000]], 12),
      // Pranav owes Kabir 300 for this cab…
      expense(goa, 'Cab', 'Airport to villa', 900, kabir, [[me, 300], [aisha, 300], [kabir, 300]], 12),
      // …and Kabir owes Pranav 300 for this one, so their Cab bucket cancels out
      expense(goa, 'Cab', 'Cab to Baga', 600, me, [[me, 300], [kabir, 300]], 10),
      expense(goa, 'Fun', 'Scuba diving', 2400, aisha, [[me, 800], [aisha, 800], [kabir, 800]], 10),
      expense(goa, 'Food', 'Dinner at Thalassa', 5250, kabir, [[me, 2000], [aisha, 1500], [kabir, 1750]], 9, 'exact'),
      expense(flat, 'Rent', 'October rent', 24000, me, [[rahul, 12000], [me, 12000]], 20),
      expense(flat, 'Bills', 'Electricity', 3120, rahul, [[rahul, 1560], [me, 1560]], 4),
      expense(flat, 'Bills', 'WiFi', 999, rahul, [[rahul, 499.5], [me, 499.5]], 6),
      expense(flat, 'Groceries', 'BigBasket order', 1845.5, me, [[rahul, 922.75], [me, 922.75]], 2),
      expense(flat, 'Groceries', null, 640, rahul, [[rahul, 320], [me, 320]], 1),
    ],
    settlements: [
      payment(goa, kabir, me, 'Stay', 1500, 'UPI', 5, 'confirmed'),
      // Waiting for Pranav to confirm (shows in the bell)
      payment(goa, aisha, me, 'Stay', 6000, 'GPay', 0.2, 'pending'),
      payment(flat, rahul, me, 'Groceries', 602.75, null, 0.05, 'pending'),
    ],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to fresh seed
  }
  const db = seed();
  save(db);
  return db;
}

function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // demo only
  }
}

// Small delay so loading states are visible like on the real backend
const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));

function fail(message) {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const listeners = new Set();

function currentUserId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function sessionFor(id) {
  const user = id && load().users.find((u) => u.id === id);
  return user ? { user: { id: user.id, email: user.email } } : null;
}

function setSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // demo only
  }
  const session = sessionFor(id);
  listeners.forEach((fn) => fn(id ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

export const mockAuth = {
  getSession: async () => sessionFor(currentUserId()),
  onChange: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  signIn: async (email, password) => {
    await wait();
    const user = load().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password) fail('Invalid login credentials');
    setSession(user.id);
  },
  signUp: async (email, password, displayName) => {
    await wait();
    const db = load();
    if (db.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) fail('User already registered');
    if (password.length < 6) fail('Password should be at least 6 characters');
    const user = { id: uid(), display_name: displayName.trim() || email.split('@')[0], email: email.trim(), password, created_at: now() };
    db.users.push(user);
    save(db);
    setSession(user.id);
    return { needsConfirmation: false };
  },
  signOut: async () => setSession(null),
  resetPassword: async () => wait(),
  updatePassword: async (password) => {
    const db = load();
    const user = db.users.find((u) => u.id === currentUserId());
    if (user) user.password = password;
    save(db);
  },
  profile: async (id) => {
    const u = load().users.find((x) => x.id === id);
    return u ? { id: u.id, display_name: u.display_name, email: u.email, upi_id: u.upi_id ?? null, avatar_emoji: u.avatar_emoji ?? null, avatar_color: u.avatar_color ?? null } : null;
  },
  // Demo helpers
  users: () =>
    load().users.map(({ id, display_name, email, avatar_emoji, avatar_color }) => ({
      id,
      display_name,
      email,
      avatar_emoji: avatar_emoji ?? null,
      avatar_color: avatar_color ?? null,
    })),
  switchTo: (id) => setSession(id),
  reset: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // demo only
    }
    const db = load();
    setSession(db.users[0].id);
  },
};

// ---------------------------------------------------------------------------
// Data (same shape and rules as the database functions)
// ---------------------------------------------------------------------------

function me() {
  const id = currentUserId();
  if (!id) fail('You need to sign in first');
  return id;
}

const isMember = (db, gid, u) => db.members.some((m) => m.group_id === gid && m.user_id === u);
const isOwner = (db, gid, u) => db.groups.some((g) => g.id === gid && g.owner_id === u);
const userById = (db, id) => db.users.find((u) => u.id === id);

function balances(db, gid) {
  const g = db.groups.find((x) => x.id === gid);
  const nets = new Map();
  const add = (u, amt) => nets.set(u, round2((nets.get(u) || 0) + amt));
  db.members.filter((m) => m.group_id === gid).forEach((m) => add(m.user_id, 0));
  db.expenses
    .filter((e) => e.group_id === gid)
    .forEach((e) => {
      add(e.paid_by, e.amount);
      e.expense_splits.forEach((s) => add(s.user_id, -s.amount));
    });
  db.settlements
    .filter((s) => s.group_id === gid)
    .forEach((s) => {
      add(s.from_user, s.amount);
      add(s.to_user, -s.amount);
    });
  return [...nets.entries()]
    .map(([user_id, net]) => {
      const u = userById(db, user_id);
      return {
        user_id,
        display_name: u.display_name,
        email: u.email,
        upi_id: u.upi_id ?? null,
        avatar_emoji: u.avatar_emoji ?? null,
        avatar_color: u.avatar_color ?? null,
        is_member: isMember(db, gid, user_id),
        is_owner: g.owner_id === user_id,
        net,
      };
    })
    .sort((a, b) => b.is_member - a.is_member || a.display_name.localeCompare(b.display_name));
}

function debtsIn(db, gid) {
  return bucketDebts(
    db.expenses.filter((e) => e.group_id === gid),
    db.settlements.filter((s) => s.group_id === gid)
  );
}

// Same rule as debt_since() in schema.sql
function debtSince(db, gid, debtor, creditor) {
  const shared = db.expenses
    .filter((e) => e.group_id === gid && e.paid_by === creditor && e.expense_splits.some((s) => s.user_id === debtor))
    .map((e) => e.expense_date)
    .sort();
  const lastPaid = db.settlements
    .filter((s) => s.group_id === gid && s.from_user === debtor && s.to_user === creditor && s.status === 'confirmed')
    .map((s) => s.settled_on)
    .sort()
    .pop();
  return shared.find((d) => !lastPaid || d > lastPaid) || shared.pop() || null;
}

function checkPaymentRights(db, gid, from, to) {
  const u = me();
  if (!isMember(db, gid, u)) fail('Group not found');
  if (![from, to].includes(u) && !isOwner(db, gid, u)) fail('Only the people involved or the owner can record this payment');
  if (from === to) fail('Pick two different people');
  if (!isMember(db, gid, from) || !isMember(db, gid, to)) fail('Both people must be in the group');
}

// What `from` can still pay `to` in a bucket after pending payments
function payable(db, gid, from, to, bucket) {
  const due = debtsIn(db, gid).find((d) => d.bucket === bucket && d.debtor === from && d.creditor === to)?.cents || 0;
  const pending = db.settlements
    .filter((s) => s.group_id === gid && s.status === 'pending' && s.from_user === from && s.to_user === to && s.bucket === bucket)
    .reduce((a, s) => a + toCents(s.amount), 0);
  return due - pending;
}

const hasPending = (db, gid, from, to, bucket) =>
  db.settlements.some(
    (s) => s.group_id === gid && s.status === 'pending' && s.from_user === from && s.to_user === to && (!bucket || s.bucket === bucket)
  );

// Accepted straight away only when the person being paid records it
function addPayment(db, gid, from, to, bucket, amount, note, date, batch = uid()) {
  const status = me() === to ? 'confirmed' : 'pending';
  const row = {
    id: uid(),
    group_id: gid,
    from_user: from,
    to_user: to,
    bucket,
    amount,
    note: note?.trim() || null,
    settled_on: date || dateOnly(now()),
    status,
    batch_id: batch,
    decided_at: status === 'confirmed' ? now() : null,
    created_by: me(),
    created_at: now(),
  };
  db.settlements.push(row);
  return row;
}

function mutate(fn) {
  return async (...args) => {
    await wait();
    const db = load();
    const result = fn(db, ...args);
    save(db);
    return result;
  };
}

function read(fn) {
  return async (...args) => {
    await wait();
    return fn(load(), ...args);
  };
}

export const mockApi = {
  myGroups: read((db) => {
    const u = me();
    return db.groups
      .filter((g) => isMember(db, g.id, u))
      .map((g) => {
        const last = [g.created_at, ...db.expenses.filter((e) => e.group_id === g.id).map((e) => e.created_at), ...db.settlements.filter((s) => s.group_id === g.id).map((s) => s.created_at)].sort().pop();
        return {
          ...g,
          owner_name: userById(db, g.owner_id).display_name,
          member_count: db.members.filter((m) => m.group_id === g.id).length,
          my_owe: fromCents(debtsIn(db, g.id).filter((d) => d.debtor === u).reduce((a, d) => a + d.cents, 0)),
          my_owed: fromCents(debtsIn(db, g.id).filter((d) => d.creditor === u).reduce((a, d) => a + d.cents, 0)),
          last_activity: last,
        };
      })
      .sort((a, b) => b.last_activity.localeCompare(a.last_activity));
  }),

  createGroup: mutate((db, name, currency = 'INR') => {
    const u = me();
    if (!name?.trim()) fail('Give the group a name');
    const g = { id: uid(), name: name.trim(), owner_id: u, currency, nudge_after_days: 3, created_at: now() };
    db.groups.push(g);
    db.members.push({ group_id: g.id, user_id: u, joined_at: now() });
    return g.id;
  }),

  setGroupAvatar: mutate((db, gid, { emoji, color }) => {
    if (!isOwner(db, gid, me())) fail('Only the group owner can change the group picture');
    if (emoji && (/[A-Za-z0-9<>&"]/.test(emoji) || [...emoji].length > 16)) fail('violates check constraint');
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) fail('violates check constraint');
    const g = db.groups.find((x) => x.id === gid);
    g.avatar_emoji = emoji || null;
    g.avatar_color = color || null;
  }),

  renameGroup: mutate((db, gid, name) => {
    if (!isOwner(db, gid, me())) fail('Only the group owner can rename the group');
    if (!name?.trim()) fail('Give the group a name');
    db.groups.find((g) => g.id === gid).name = name.trim();
  }),

  deleteGroup: mutate((db, gid) => {
    if (!isOwner(db, gid, me())) fail('Only the group owner can delete the group');
    const drop = (list) => list.filter((x) => x.group_id !== gid);
    db.groups = db.groups.filter((g) => g.id !== gid);
    db.members = drop(db.members);
    db.invites = drop(db.invites);
    db.requests = drop(db.requests);
    db.nudges = drop(db.nudges);
    db.expenses = drop(db.expenses);
    db.settlements = drop(db.settlements);
  }),

  transferOwnership: mutate((db, gid, userId) => {
    const u = me();
    if (!isOwner(db, gid, u)) fail('Only the group owner can hand over ownership');
    if (userId === u) fail('You already own this group');
    if (!isMember(db, gid, userId)) fail('The new owner must be a member of the group');
    db.groups.find((g) => g.id === gid).owner_id = userId;
  }),

  removeMember: mutate((db, gid, userId) => {
    const u = me();
    const g = db.groups.find((x) => x.id === gid);
    if (!g || !isMember(db, gid, u)) fail('Group not found');
    if (u !== g.owner_id && u !== userId) fail('Only the group owner can remove members');
    if (userId === g.owner_id) fail("The owner can't leave. Delete the group instead.");
    if (debtsIn(db, gid).some((d) => d.debtor === userId || d.creditor === userId)) fail('They need to settle up before leaving the group');
    if (db.settlements.some((s) => s.group_id === gid && s.status === 'pending' && [s.from_user, s.to_user].includes(userId))) {
      fail('They have payments waiting to be confirmed');
    }
    db.members = db.members.filter((m) => !(m.group_id === gid && m.user_id === userId));
  }),

  group: read((db, gid) => {
    const u = me();
    const g = db.groups.find((x) => x.id === gid);
    if (!g) return null;
    const pending = db.requests.some((r) => r.group_id === gid && r.user_id === u && r.status === 'pending');
    return isMember(db, gid, u) || pending ? g : null;
  }),

  balances: read((db, gid) => (isMember(db, gid, me()) ? balances(db, gid) : [])),

  expenses: read((db, gid) =>
    isMember(db, gid, me())
      ? db.expenses
          .filter((e) => e.group_id === gid)
          .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at))
      : []
  ),

  settlements: read((db, gid) =>
    isMember(db, gid, me())
      ? db.settlements
          .filter((s) => s.group_id === gid)
          .sort((a, b) => b.settled_on.localeCompare(a.settled_on) || b.created_at.localeCompare(a.created_at))
      : []
  ),

  saveExpense: mutate((db, e) => {
    const u = me();
    if (!isMember(db, e.groupId, u)) fail('Group not found');
    if (!e.bucket?.trim()) fail('Pick a bucket');
    const bucket =
      db.expenses.find((x) => x.group_id === e.groupId && x.bucket.toLowerCase() === e.bucket.trim().toLowerCase())?.bucket ||
      e.bucket.trim();
    if (!(e.amount > 0)) fail('Amount must be more than zero');
    if (!isMember(db, e.groupId, e.paidBy)) fail('The payer must be in the group');
    if (!e.splits?.length) fail('Choose who this is split between');
    if (e.splits.some((s) => !isMember(db, e.groupId, s.user_id))) fail('Everyone in the split must be in the group');
    const total = Math.round(e.splits.reduce((a, s) => a + s.amount * 100, 0));
    if (total !== Math.round(e.amount * 100)) fail('Split amounts must add up to the total');
    const row = {
      group_id: e.groupId,
      bucket,
      note: e.note?.trim() || null,
      amount: e.amount,
      paid_by: e.paidBy,
      split_type: e.splitType,
      expense_date: e.date,
      expense_splits: e.splits.filter((s) => s.amount > 0),
    };
    if (e.id) {
      const existing = db.expenses.find((x) => x.id === e.id && x.group_id === e.groupId);
      if (!existing) fail('Expense not found');
      Object.assign(existing, row);
      return existing.id;
    }
    const created = { id: uid(), ...row, created_by: u, created_at: now() };
    db.expenses.push(created);
    return created.id;
  }),

  deleteExpense: mutate((db, id) => {
    const e = db.expenses.find((x) => x.id === id);
    if (!e || !isMember(db, e.group_id, me())) fail('Expense not found');
    db.expenses = db.expenses.filter((x) => x.id !== id);
  }),

  addSettlement: mutate((db, s) => {
    checkPaymentRights(db, s.groupId, s.from, s.to);
    if (!(s.amount > 0)) fail('Enter a valid amount');
    const cents = payable(db, s.groupId, s.from, s.to, s.bucket);
    if (cents <= 0) {
      if (hasPending(db, s.groupId, s.from, s.to, s.bucket)) fail(`A payment for ${s.bucket} is already waiting to be confirmed`);
      fail(`Nothing is owed for ${s.bucket} between these two`);
    }
    if (toCents(s.amount) > cents) fail(`That's more than the ${fromCents(cents)} owed for ${s.bucket}`);
    return addPayment(db, s.groupId, s.from, s.to, s.bucket, s.amount, s.note, s.date).id;
  }),

  clearBuckets: mutate((db, c) => {
    checkPaymentRights(db, c.groupId, c.from, c.to);
    const due = debtsIn(db, c.groupId)
      .filter((d) => d.debtor === c.from && d.creditor === c.to && (!c.buckets || c.buckets.includes(d.bucket)))
      .map((d) => ({ bucket: d.bucket, cents: payable(db, c.groupId, c.from, c.to, d.bucket) }))
      .filter((d) => d.cents > 0);
    if (!due.length) fail(hasPending(db, c.groupId, c.from, c.to) ? 'Already waiting for confirmation' : 'Nothing to clear');
    const batch = uid();
    const rows = due.map((d) => addPayment(db, c.groupId, c.from, c.to, d.bucket, fromCents(d.cents), c.note, null, batch));
    return { count: rows.length, status: rows[0].status };
  }),

  pendingPayments: read((db) => {
    const u = me();
    const batches = new Map();
    for (const s of db.settlements) {
      if (s.to_user !== u || s.status !== 'pending' || !isMember(db, s.group_id, u)) continue;
      const g = db.groups.find((x) => x.id === s.group_id);
      const b = batches.get(s.batch_id) || {
        batch_id: s.batch_id,
        group_id: g.id,
        group_name: g.name,
        currency: g.currency,
        from_user: s.from_user,
        from_name: userById(db, s.from_user).display_name,
        from_emoji: userById(db, s.from_user).avatar_emoji ?? null,
        from_color: userById(db, s.from_user).avatar_color ?? null,
        total: 0,
        buckets: [],
        note: s.note,
        created_at: s.created_at,
      };
      b.total = round2(b.total + s.amount);
      b.buckets.push({ bucket: s.bucket, amount: s.amount });
      batches.set(s.batch_id, b);
    }
    return [...batches.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }),

  respondPayment: mutate((db, batchId, accept) => {
    const u = me();
    const rows = db.settlements.filter((s) => s.batch_id === batchId && s.status === 'pending');
    if (!rows.length || rows.some((s) => s.to_user !== u)) fail('Only the person being paid can confirm this');
    if (accept) {
      for (const s of rows) {
        const due = debtsIn(db, s.group_id).find((d) => d.bucket === s.bucket && d.debtor === s.from_user && d.creditor === s.to_user);
        if (!due || due.cents < toCents(s.amount)) {
          fail(`The ${s.bucket} balance changed since this was sent. Decline it and ask them to send it again.`);
        }
      }
    }
    for (const s of rows) {
      s.status = accept ? 'confirmed' : 'rejected';
      s.decided_at = now();
    }
  }),

  nudgeInfo: read((db, gid) => {
    const u = me();
    if (!isMember(db, gid, u)) return [];
    const debtors = [...new Set(debtsIn(db, gid).filter((d) => d.creditor === u).map((d) => d.debtor))];
    return debtors.map((debtor) => ({
      debtor,
      debt_since: debtSince(db, gid, debtor, u),
      last_nudged: db.nudges.filter((n) => n.group_id === gid && n.from_user === u && n.to_user === debtor).map((n) => n.created_at).sort().pop() || null,
    }));
  }),

  sendNudge: mutate((db, gid, to) => {
    const u = me();
    if (!isMember(db, gid, u)) fail('Group not found');
    const name = userById(db, to).display_name;
    const owed = debtsIn(db, gid).filter((d) => d.debtor === to && d.creditor === u);
    if (!owed.length) fail(`${name} doesn't owe you anything here`);
    if (!owed.some((d) => payable(db, gid, to, u, d.bucket) > 0)) fail(`${name} already sent you a payment for this. Confirm it from your bell.`);
    const after = db.groups.find((g) => g.id === gid).nudge_after_days;
    const since = debtSince(db, gid, to, u);
    if (since && (Date.now() - new Date(`${since}T00:00`).getTime()) / 86400000 < after) {
      fail(`You can nudge ${name} once the debt is ${after} days old`);
    }
    if (db.nudges.some((n) => n.group_id === gid && n.from_user === u && n.to_user === to && Date.now() - new Date(n.created_at).getTime() < 86400000)) {
      fail(`You already nudged ${name} today`);
    }
    db.nudges.push({
      id: uid(),
      group_id: gid,
      from_user: u,
      to_user: to,
      amount: fromCents(owed.reduce((a, d) => a + d.cents, 0)),
      buckets: owed.map((d) => ({ bucket: d.bucket, amount: fromCents(d.cents) })),
      created_at: now(),
      dismissed_at: null,
    });
  }),

  myNudges: read((db) => {
    const u = me();
    return db.nudges
      .filter(
        (n) =>
          n.to_user === u &&
          !n.dismissed_at &&
          isMember(db, n.group_id, u) &&
          debtsIn(db, n.group_id).some((d) => d.debtor === u && d.creditor === n.from_user)
      )
      .map((n) => {
        const g = db.groups.find((x) => x.id === n.group_id);
        const from = userById(db, n.from_user);
        return { ...n, group_name: g.name, currency: g.currency, from_name: from.display_name, from_emoji: from.avatar_emoji ?? null, from_color: from.avatar_color ?? null };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }),

  dismissNudge: mutate((db, id) => {
    const n = db.nudges.find((x) => x.id === id && x.to_user === me());
    if (n) n.dismissed_at = now();
  }),

  setNudgeAfter: mutate((db, gid, days) => {
    if (!isOwner(db, gid, me())) fail('Only the group owner can change this');
    db.groups.find((g) => g.id === gid).nudge_after_days = Math.min(Math.max(Number(days) || 0, 0), 60);
  }),

  deleteSettlement: mutate((db, id) => {
    const u = me();
    const s = db.settlements.find((x) => x.id === id);
    if (!s || !isMember(db, s.group_id, u)) fail('Payment not found');
    if (s.status === 'pending' && ![s.from_user, s.created_by].includes(u)) fail('Only the person who sent it can withdraw it');
    if (s.status === 'confirmed' && u !== s.to_user && !isOwner(db, s.group_id, u)) {
      fail(`Only ${userById(db, s.to_user).display_name} or the owner can undo a confirmed payment`);
    }
    if (s.status === 'rejected' && ![s.from_user, s.to_user, s.created_by].includes(u) && !isOwner(db, s.group_id, u)) {
      fail('Only the people involved can remove this');
    }
    db.settlements = db.settlements.filter((x) => x.id !== id);
  }),

  invites: read((db, gid) =>
    isOwner(db, gid, me())
      ? db.invites
          .filter((i) => i.group_id === gid && !i.used_at && !i.revoked && i.expires_at > now())
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : []
  ),

  createInvite: mutate((db, gid, hours = 24) => {
    if (!isOwner(db, gid, me())) fail('Only the group owner can create invite codes');
    let code;
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(8));
      code = [...bytes].map((b) => ALPHABET[b % 32]).join('');
    } while (db.invites.some((i) => i.code === code));
    const expires_at = new Date(Date.now() + Math.min(Math.max(hours, 1), 168) * 3600000).toISOString();
    db.invites.push({ id: uid(), group_id: gid, code, created_by: me(), expires_at, used_by: null, used_at: null, revoked: false, created_at: now() });
    return { code, expires_at };
  }),

  revokeInvite: mutate((db, id) => {
    const inv = db.invites.find((i) => i.id === id);
    if (!inv || !isOwner(db, inv.group_id, me())) fail('Invite not found');
    inv.revoked = true;
  }),

  redeemInvite: mutate((db, raw) => {
    const u = me();
    const code = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const inv = db.invites.find((i) => i.code === code);
    if (!inv || inv.revoked) fail("That code isn't valid");
    if (inv.used_at) fail('That code has already been used. Ask the owner for a new one.');
    if (inv.expires_at < now()) fail('That code has expired. Ask the owner for a new one.');
    const g = db.groups.find((x) => x.id === inv.group_id);
    if (isMember(db, g.id, u)) fail(`You're already in ${g.name}`);
    if (db.requests.some((r) => r.group_id === g.id && r.user_id === u && r.status === 'pending')) {
      fail(`You already asked to join ${g.name}. Waiting on the owner.`);
    }
    inv.used_by = u;
    inv.used_at = now();
    db.requests.push({ id: uid(), group_id: g.id, user_id: u, status: 'pending', created_at: now(), decided_at: null });
    return { group_id: g.id, group_name: g.name, owner_name: userById(db, g.owner_id).display_name };
  }),

  pendingRequests: read((db) => {
    const u = me();
    return db.requests
      .filter((r) => r.status === 'pending' && (r.user_id === u || isOwner(db, r.group_id, u)))
      .map((r) => {
        const g = db.groups.find((x) => x.id === r.group_id);
        const p = userById(db, r.user_id);
        return { ...r, groups: { name: g.name, owner_id: g.owner_id }, profiles: { display_name: p.display_name, email: p.email, avatar_emoji: p.avatar_emoji ?? null, avatar_color: p.avatar_color ?? null } };
      });
  }),

  respondRequest: mutate((db, id, approve) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r || !isOwner(db, r.group_id, me())) fail('Only the group owner can approve requests');
    if (r.status !== 'pending') fail('This request was already handled');
    r.status = approve ? 'approved' : 'rejected';
    r.decided_at = now();
    if (approve && !isMember(db, r.group_id, r.user_id)) db.members.push({ group_id: r.group_id, user_id: r.user_id, joined_at: now() });
  }),

  cancelRequest: mutate((db, id) => {
    const u = me();
    db.requests = db.requests.filter((r) => !(r.id === id && r.user_id === u && r.status === 'pending'));
  }),

  updateDisplayName: mutate((db, userId, name) => {
    if (userId !== me()) fail('Not allowed');
    if (!name?.trim()) fail('Name can’t be empty');
    userById(db, userId).display_name = name.trim().slice(0, 60);
  }),

  updateAvatar: mutate((db, userId, { emoji, color }) => {
    if (userId !== me()) fail('Not allowed');
    if (emoji && (/[A-Za-z0-9<>&"]/.test(emoji) || [...emoji].length > 16)) fail('violates check constraint');
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) fail('violates check constraint');
    const u = userById(db, userId);
    u.avatar_emoji = emoji || null;
    u.avatar_color = color || null;
  }),

  updateUpi: mutate((db, userId, upi) => {
    if (userId !== me()) fail('Not allowed');
    const value = upi.trim();
    if (value && !isValidUpi(value)) fail('new row for relation "profiles" violates check constraint');
    userById(db, userId).upi_id = value || null;
  }),
};

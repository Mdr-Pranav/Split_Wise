// Live updates: when anyone changes something the user can see, open
// screens reload. Supabase Realtime sends the row changes (still filtered by
// row level security); in demo mode, another tab writing the demo data
// counts as a change. Changes arriving close together are batched.

import { isConfigured, supabase } from './supabase';

const EVENT = 'live-change';
const TABLES = [
  'groups',
  'group_members',
  'expenses',
  'expense_events',
  'settlements',
  'nudges',
  'join_requests',
  'smart_plans',
  'smart_plan_members',
  'smart_transfers',
];
const BATCH_MS = 400;

let pending = [];
let timer = 0;

function emit(change) {
  pending.push(change);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const changes = pending;
    pending = [];
    window.dispatchEvent(new CustomEvent(EVENT, { detail: changes }));
  }, BATCH_MS);
}

// Start listening for this user; returns a stop function
export function startLive(userId) {
  if (!userId) return () => {};
  // Back online: whatever happened meanwhile
  const onOnline = () => emit({ table: '*' });
  window.addEventListener('online', onOnline);

  if (!isConfigured) {
    const onStorage = (e) => e.key?.startsWith('splitzy-demo') && emit({ table: '*' });
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('storage', onStorage);
    };
  }

  const channel = supabase.channel(`live:${userId}`);
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      // Deletes only carry the primary key
      const record = payload.new && Object.keys(payload.new).length ? payload.new : payload.old || {};
      emit({ table, type: payload.eventType, record });
    });
  }
  channel.subscribe();
  return () => {
    window.removeEventListener('online', onOnline);
    supabase.removeChannel(channel);
  };
}

// Does a batch of changes possibly touch this group? Rows without a
// group_id (deletes, smart settle transfers) are treated as maybe.
export const touchesGroup = (changes, groupId) =>
  changes.some((c) => c.table === '*' || !c.record?.group_id || c.record.group_id === groupId || (c.table === 'groups' && c.record.id === groupId));

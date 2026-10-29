import { isConfigured, supabase } from './supabase';
import { mockApi } from './mock';

// Every write is a database function that checks permissions server side.
async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

async function query(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data;
}

const supabaseApi = {
  myGroups: () => rpc('my_groups'),
  createGroup: (name, currency) => rpc('create_group', { p_name: name, p_currency: currency }),
  setGroupAvatar: (groupId, { emoji, color }) =>
    rpc('set_group_avatar', { p_group_id: groupId, p_emoji: emoji || '', p_color: color || '' }),
  renameGroup: (groupId, name) => rpc('rename_group', { p_group_id: groupId, p_name: name }),
  deleteGroup: (groupId) => rpc('delete_group', { p_group_id: groupId }),
  transferOwnership: (groupId, userId) => rpc('transfer_ownership', { p_group_id: groupId, p_new_owner: userId }),
  removeMember: (groupId, userId) => rpc('remove_member', { p_group_id: groupId, p_user_id: userId }),

  group: (groupId) => query(supabase.from('groups').select('*').eq('id', groupId).maybeSingle()),
  balances: (groupId) => rpc('group_balances', { p_group_id: groupId }),
  expenses: (groupId) =>
    query(
      supabase
        .from('expenses')
        .select('*, expense_splits(user_id, amount)')
        .eq('group_id', groupId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
    ),
  settlements: (groupId) =>
    query(
      supabase
        .from('settlements')
        .select('*')
        .eq('group_id', groupId)
        .order('settled_on', { ascending: false })
        .order('created_at', { ascending: false })
    ),

  saveExpense: (e) =>
    rpc('save_expense', {
      p_expense_id: e.id ?? null,
      p_group_id: e.groupId,
      p_bucket: e.bucket,
      p_note: e.note || null,
      p_amount: e.amount,
      p_paid_by: e.paidBy,
      p_split_type: e.splitType,
      p_expense_date: e.date,
      p_splits: e.splits,
    }),
  deleteExpense: (id) => rpc('delete_expense', { p_expense_id: id }),
  addSettlement: (s) =>
    rpc('add_settlement', {
      p_group_id: s.groupId,
      p_from: s.from,
      p_to: s.to,
      p_bucket: s.bucket,
      p_amount: s.amount,
      p_note: s.note || null,
      p_settled_on: s.date || null,
    }),
  // Settle whole buckets at once; buckets null = everything `from` owes `to`.
  // Returns { count, status } where status is 'pending' unless the receiver sent it.
  clearBuckets: (c) =>
    rpc('clear_buckets', {
      p_group_id: c.groupId,
      p_from: c.from,
      p_to: c.to,
      p_buckets: c.buckets ?? null,
      p_note: c.note || null,
    }),
  // Clear every bucket between two people; only the net amount changes hands.
  // Returns { count, status, net, payer, receiver }.
  settlePair: (c) => rpc('settle_pair', { p_group_id: c.groupId, p_a: c.a, p_b: c.b, p_note: c.note || null }),
  // Smart settle: plans (open and finished) with who approved and the transfers
  smartPlans: (groupId) =>
    query(
      supabase
        .from('smart_plans')
        .select('*, smart_plan_members(user_id, approved_at), smart_transfers(id, from_user, to_user, amount, paid_at, confirmed_at)')
        .eq('group_id', groupId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
    ),
  startSmartSettle: (groupId) => rpc('start_smart_settle', { p_group_id: groupId }),
  respondSmartPlan: (planId, approve) => rpc('respond_smart_plan', { p_plan_id: planId, p_approve: approve }),
  markTransferPaid: (transferId) => rpc('mark_transfer_paid', { p_transfer_id: transferId }),
  confirmTransfer: (transferId) => rpc('confirm_transfer', { p_transfer_id: transferId }),
  cancelSmartPlan: (planId) => rpc('cancel_smart_plan', { p_plan_id: planId }),
  mySmartTasks: () => rpc('my_smart_tasks'),

  // Payments other people sent the user, waiting for them to accept
  pendingPayments: () => rpc('my_pending_payments'),
  respondPayment: (batchId, accept) => rpc('respond_payment', { p_batch_id: batchId, p_accept: accept }),
  // Reminders: the person owed nudges the person who owes
  nudgeInfo: (groupId) => rpc('nudge_info', { p_group_id: groupId }),
  sendNudge: (groupId, userId) => rpc('send_nudge', { p_group_id: groupId, p_to: userId }),
  myNudges: () => rpc('my_nudges'),
  dismissNudge: (id) => rpc('dismiss_nudge', { p_nudge_id: id }),
  setNudgeAfter: (groupId, days) => rpc('set_nudge_after', { p_group_id: groupId, p_days: days }),
  deleteSettlement: (id) => rpc('delete_settlement', { p_settlement_id: id }),

  invites: (groupId) =>
    query(
      supabase
        .from('group_invites')
        .select('*')
        .eq('group_id', groupId)
        .is('used_at', null)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
    ),
  createInvite: (groupId, hours) => rpc('create_invite', { p_group_id: groupId, p_hours: hours }),
  revokeInvite: (id) => rpc('revoke_invite', { p_invite_id: id }),
  redeemInvite: (code) => rpc('redeem_invite', { p_code: code }),

  // Pending requests the user can see: ones they sent, and ones for groups they own
  pendingRequests: () =>
    query(
      supabase
        .from('join_requests')
        .select('id, created_at, user_id, group_id, groups(name, owner_id), profiles(display_name, email, avatar_emoji, avatar_color)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
    ),
  respondRequest: (id, approve) => rpc('respond_join_request', { p_request_id: id, p_approve: approve }),
  cancelRequest: (id) => rpc('cancel_join_request', { p_request_id: id }),

  updateDisplayName: (userId, name) =>
    query(supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId)),
  // Empty string clears it
  // Profile picture: emoji and/or background colour ('' clears either)
  updateAvatar: (userId, { emoji, color }) =>
    query(supabase.from('profiles').update({ avatar_emoji: emoji || null, avatar_color: color || null }).eq('id', userId)),
  updateUpi: (userId, upi) => query(supabase.from('profiles').update({ upi_id: upi.trim() || null }).eq('id', userId)),
};

// No Supabase keys → run against the local demo backend
export const api = isConfigured ? supabaseApi : mockApi;

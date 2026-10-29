import { useMemo, useState } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import UpiPay from './UpiPay';
import { ErrorNote } from './AuthShell';
import { api } from '../lib/api';
import { APP_NAME } from '../lib/brand';
import { formatMoney, fromCents, smartTransfers } from '../lib/money';

// Smart settle inside the Settle dialog. With no plan open it previews the
// fewest payments that clear every debt in the group and lets anyone
// propose it. Once proposed: everyone involved approves, then each payer
// pays their one transfer and each receiver confirms it. The last
// confirmation clears every bucket debt the plan snapshotted.
export default function SmartSettle({ group, people, me, isOwner, debts, plan, hasPending, onDone }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const cur = group.currency;
  const nameOf = (id) => (id === me ? 'You' : people.find((p) => p.user_id === id)?.display_name || 'Someone');
  const money = (amount) => formatMoney(Number(amount), cur);

  const preview = useMemo(() => smartTransfers(debts), [debts]);

  const act = async (key, fn, message) => {
    setError('');
    setBusy(key);
    try {
      const result = await fn();
      onDone(typeof message === 'function' ? message(result) : message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const Transfer = ({ from, to, amount, children }) => (
    <li className="flex items-center gap-2.5 py-2">
      <span className="flex flex-shrink-0 -space-x-2">
        <Avatar id={from} name={nameOf(from)} size="sm" />
        <Avatar id={to} name={nameOf(to)} size="sm" />
      </span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-slate-600">
        <span className="font-medium text-ink">{nameOf(from)}</span> pay{from === me ? '' : 's'}{' '}
        <span className="font-medium text-ink">{to === me ? 'you' : nameOf(to)}</span>
        <span className="block text-[15px] font-semibold tabular-nums text-ink">{money(amount)}</span>
      </span>
      {children}
    </li>
  );

  // ---- No plan yet: preview and propose ----
  if (!plan) {
    if (!debts.length) {
      return <p className="rounded-2xl bg-[rgb(var(--line)/0.05)] px-4 py-6 text-center text-[14px] text-slate-600">Everyone in {group.name} is settled.</p>;
    }
    return (
      <div className="space-y-3">
        <p className="px-1 text-[13px] leading-snug text-slate-500">
          Instead of {debts.length} separate debts, <b className="text-ink">{preview.length} payment{preview.length === 1 ? '' : 's'}</b> clear{preview.length === 1 ? 's' : ''} everyone. People may pay someone they didn’t
          owe directly; it all evens out.
        </p>
        <ul className="divide-y divide-[rgb(var(--line)/0.08)] rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 ring-1 ring-[rgb(var(--line)/0.06)]">
          {preview.map((t) => (
            <Transfer key={`${t.from}>${t.to}`} from={t.from} to={t.to} amount={fromCents(t.cents)} />
          ))}
        </ul>
        <ol className="space-y-1 px-1 text-[12px] text-slate-500">
          <li>1. Everyone involved approves the plan.</li>
          <li>2. Each payer pays once; each receiver confirms.</li>
          <li>3. When the last payment is confirmed, every bucket clears.</li>
        </ol>
        <ErrorNote>{error}</ErrorNote>
        {hasPending ? (
          <p className="rounded-2xl bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
            Some payments are still waiting to be confirmed. Confirm or decline them first.
          </p>
        ) : (
          <button
            type="button"
            disabled={busy === 'start'}
            onClick={() => act('start', () => api.startSmartSettle(group.id), 'Smart settle proposed · waiting for approvals')}
            className="btn-primary h-12 w-full"
          >
            <Icon name="sparkle" className="h-4 w-4" /> {busy === 'start' ? 'Proposing…' : 'Propose smart settle'}
          </button>
        )}
      </div>
    );
  }

  const members = plan.smart_plan_members || [];
  const transfers = plan.smart_transfers || [];
  const mine = members.find((m) => m.user_id === me);
  const approvedCount = members.filter((m) => m.approved_at).length;
  const canCancel = (plan.created_by === me || isOwner) && !transfers.some((t) => t.confirmed_at);
  const cancel = canCancel && (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={() => act('cancel', () => api.cancelSmartPlan(plan.id), 'Smart settle cancelled')}
      className="block w-full text-center text-[13px] font-medium text-rose-600 hover:text-rose-700"
    >
      Cancel smart settle
    </button>
  );

  // ---- Waiting for approvals ----
  if (plan.status === 'approving') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-brand-500/[0.07] px-3.5 py-3 ring-1 ring-brand-500/20">
          <p className="text-[14px] font-semibold text-ink">
            {nameOf(plan.created_by)} proposed a smart settle · {approvedCount} of {members.length} approved
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {members.map((m) => (
              <span
                key={m.user_id}
                className={`inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] font-medium ${
                  m.approved_at ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-[rgb(var(--line)/0.07)] text-slate-500'
                }`}
              >
                <Avatar id={m.user_id} name={nameOf(m.user_id)} size="sm" className="!h-6 !w-6 !text-[10px] !ring-0" />
                {nameOf(m.user_id)}
                <Icon name={m.approved_at ? 'check' : 'clock'} className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
            ))}
          </div>
        </div>
        <ul className="divide-y divide-[rgb(var(--line)/0.08)] rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 ring-1 ring-[rgb(var(--line)/0.06)]">
          {transfers.map((t) => (
            <Transfer key={t.id} from={t.from_user} to={t.to_user} amount={t.amount} />
          ))}
        </ul>
        <ErrorNote>{error}</ErrorNote>
        {mine && !mine.approved_at ? (
          <div className="flex gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => act('no', () => api.respondSmartPlan(plan.id, false), 'Smart settle declined')} className="btn-secondary h-12 flex-1">
              Decline
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => act('yes', () => api.respondSmartPlan(plan.id, true), 'Approved')}
              className="btn-primary h-12 flex-1"
            >
              <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Approve
            </button>
          </div>
        ) : (
          <p className="text-center text-[13px] text-slate-500">
            {mine ? 'You approved. ' : ''}Waiting for {members.filter((m) => !m.approved_at).map((m) => nameOf(m.user_id)).join(', ')}.
          </p>
        )}
        {cancel}
      </div>
    );
  }

  // ---- Paying ----
  const myPayment = transfers.find((t) => t.from_user === me && !t.confirmed_at);
  const payee = myPayment && people.find((p) => p.user_id === myPayment.to_user);
  const doneCount = transfers.filter((t) => t.confirmed_at).length;
  return (
    <div className="space-y-3">
      <p className="px-1 text-[13px] text-slate-500">
        Everyone approved · <b className="text-ink">{doneCount} of {transfers.length}</b> payments confirmed. Every bucket clears when the last one is.
      </p>
      <ul className="divide-y divide-[rgb(var(--line)/0.08)] rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 ring-1 ring-[rgb(var(--line)/0.06)]">
        {transfers.map((t) => (
          <Transfer key={t.id} from={t.from_user} to={t.to_user} amount={t.amount}>
            {t.confirmed_at ? (
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> Done
              </span>
            ) : t.to_user === me ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => act(t.id, () => api.confirmTransfer(t.id), (r) => (r === 'done' ? 'Smart settle complete · every bucket cleared' : 'Payment confirmed'))}
                className="btn-primary h-8 flex-shrink-0 !px-3 !text-[12px]"
              >
                Confirm received
              </button>
            ) : (
              <span className="text-[12px] font-medium text-amber-600">{t.paid_at ? 'Paid · awaiting confirm' : 'To pay'}</span>
            )}
          </Transfer>
        ))}
      </ul>
      {myPayment && (
        <>
          {cur === 'INR' && (
            <UpiPay
              payee={nameOf(myPayment.to_user)}
              vpa={payee?.upi_id || ''}
              amount={Number(myPayment.amount)}
              note={`${APP_NAME} · ${group.name} · smart settle`}
            />
          )}
          <ErrorNote>{error}</ErrorNote>
          <button
            type="button"
            disabled={Boolean(busy) || Boolean(myPayment.paid_at)}
            onClick={() => act('paid', () => api.markTransferPaid(myPayment.id), `Marked paid · ${nameOf(myPayment.to_user)} confirms next`)}
            className="btn-primary h-12 w-full"
          >
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />{' '}
            {myPayment.paid_at ? `Paid · waiting for ${nameOf(myPayment.to_user)}` : `I’ve paid ${nameOf(myPayment.to_user)} ${money(myPayment.amount)}`}
          </button>
        </>
      )}
      {!myPayment && <ErrorNote>{error}</ErrorNote>}
      {cancel}
    </div>
  );
}

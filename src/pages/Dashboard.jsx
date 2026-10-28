import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { rememberLooks } from '../lib/avatars';
import { formatMoney, formatTotals } from '../lib/money';
import { timeAgo } from '../lib/dates';
import Icon from '../components/Icon';
import Skeleton from '../components/Skeleton';
import Avatar from '../components/Avatar';
import { GlowCard, GlowRing } from '../components/Glow';
import JoinRequests from '../components/JoinRequests';
import CreateGroupModal from '../components/CreateGroupModal';
import { InstallBanner } from '../components/InstallApp';

// Glowing summary: the ring shows how much of the open money is coming to you
function BalanceHero({ owed, owe, net, netTotal, onNewGroup }) {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const inflow = sum(owed);
  const outflow = sum(owe);
  const square = Math.abs(inflow) < 0.005 && Math.abs(outflow) < 0.005;
  const status = square ? 'All square' : netTotal > 0.004 ? "You're ahead" : netTotal < -0.004 ? "You're behind" : 'Evened out';
  // Below zero overall: the ring, number and pill glow red instead of white
  const negative = netTotal < -0.004;
  const tone = negative ? 'danger' : undefined;
  return (
    <GlowCard tone={tone} className="h-full" bodyClassName="flex h-full flex-col items-center justify-center px-6 py-7">
      <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.08em] text-white/70">Overall balance</p>
      <GlowRing value={square ? 1 : inflow / (inflow + outflow)} size={188}>
        {/* No truncate here: clipping would box in the glow */}
        <span className={`${negative ? 'text-glow-danger' : 'text-glow'} whitespace-nowrap text-[24px] font-semibold tracking-[-0.03em] tabular-nums`}>{formatTotals(net)}</span>
        <span className="mt-0.5 text-[13px] text-white/70">{square ? 'nothing open' : 'net'}</span>
      </GlowRing>
      <span
        className={`mt-5 inline-block rounded-full px-3 py-1 text-[15px] font-semibold backdrop-blur ${
          'bg-white/20'
        }`}
      >
        {status}
      </span>
      <div className="mt-4 grid w-full max-w-xs grid-cols-2 divide-x divide-white/15 rounded-2xl bg-white/10 py-2.5 ring-1 ring-white/15">
        {[
          ["You're owed", owed],
          ['You owe', owe],
        ].map(([label, totals]) => (
          <div key={label} className="min-w-0 px-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-white/65">{label}</p>
            <p className="mt-0.5 truncate text-[17px] font-semibold tabular-nums">{formatTotals(totals)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 max-w-xs text-center text-[12px] text-white/70">
        {square ? 'Nothing owed either way. Start a group for your next trip.' : 'The ring fills with the share of open money coming to you.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={onNewGroup} className="btn-glow">
          <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> New group
        </button>
        <Link to="/join" className="btn-glow-ghost">
          <Icon name="key" className="h-4 w-4" /> Join with code
        </Link>
      </div>
    </GlowCard>
  );
}

// One row in the groups list on Home
function GroupRow({ group, isMine }) {
  const owe = Number(group.my_owe);
  const owed = Number(group.my_owed);
  return (
    <li>
      <Link
        to={`/groups/${group.id}`}
        className="group flex items-center gap-3 rounded-2xl px-2.5 py-3 transition-colors hover:bg-surface-elevated/70 sm:gap-4 sm:px-3"
      >
        <Avatar id={group.id} name={group.name} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-semibold text-ink">{group.name}</span>
            {isMine && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
                <Icon name="crown" className="h-3 w-3" /> Owner
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-slate-500">
            {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
            {!isMine && ` · by ${group.owner_name}`} · {timeAgo(group.last_activity)}
          </span>
        </span>
        <span className="flex flex-shrink-0 flex-col items-end text-right text-[13px] font-semibold leading-snug tabular-nums">
          {owe < 0.005 && owed < 0.005 ? (
            <span className="font-medium text-slate-400">Settled up</span>
          ) : (
            <>
              {owed >= 0.005 && <span className="text-emerald-600">+{formatMoney(owed, group.currency)}</span>}
              {owe >= 0.005 && <span className="text-rose-600">−{formatMoney(owe, group.currency)}</span>}
            </>
          )}
        </span>
        <Icon name="chevron" className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

export default function Dashboard() {
  const { user, name } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [requests, setRequests] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, r] = await Promise.all([api.myGroups(), api.pendingRequests()]);
      setGroups(g);
      setRequests(r);
      rememberLooks(r.map((x) => [x.user_id, x.profiles?.avatar_emoji, x.profiles?.avatar_color]));
    } catch (err) {
      toast.error(err.message);
      setGroups([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const incoming = requests.filter((r) => r.groups?.owner_id === user.id && r.user_id !== user.id);
  const outgoing = requests.filter((r) => r.user_id === user.id);

  const owed = {};
  const owe = {};
  for (const g of groups || []) {
    owed[g.currency] = (owed[g.currency] || 0) + Number(g.my_owed);
    owe[g.currency] = (owe[g.currency] || 0) + Number(g.my_owe);
  }
  const net = Object.fromEntries(Object.keys(owed).map((c) => [c, owed[c] - owe[c]]));
  const netTotal = Object.values(net).reduce((a, b) => a + b, 0);

  const cancel = async (id) => {
    try {
      await api.cancelRequest(id);
      toast.info('Request withdrawn');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <InstallBanner />

      <div>
        <p className="text-[15px] text-slate-500">Hey {name.split(' ')[0]},</p>
        <h1 className="text-[34px] font-semibold leading-tight text-ink sm:text-[44px]">Your balances</h1>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-5">
        {groups === null ? (
          <>
            <Skeleton className="h-[480px] rounded-3xl" />
            <Skeleton className="h-[480px] rounded-3xl" />
          </>
        ) : (
          <>
            <BalanceHero owed={owed} owe={owe} net={net} netTotal={netTotal} onNewGroup={() => setCreateOpen(true)} />

            {/* Right column: groups list on top, requests underneath; the list takes what's left and scrolls */}
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:h-[max(520px,calc(100dvh-16rem))]">
            <section className="card flex min-h-[220px] flex-1 flex-col overflow-hidden !p-0">
              <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5">
                <h2 className="text-[16px] font-semibold text-ink">
                  Your groups
                  {groups.length > 0 && <span className="ml-1.5 text-[13px] font-medium text-slate-400">{groups.length}</span>}
                </h2>
                <button type="button" onClick={() => setCreateOpen(true)} className="btn-secondary h-8 !px-3 !text-[13px]">
                  <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> New
                </button>
              </div>
              {groups.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                    <Icon name="users" className="h-7 w-7" />
                  </div>
                  <h3 className="text-[18px] font-semibold text-ink">No groups yet</h3>
                  <p className="mt-1.5 max-w-sm text-[14px] text-slate-600">
                    Start one for a trip or your flat, or ask a friend for their group's one-time code.
                  </p>
                </div>
              ) : (
                <ul className="scroll-fade min-h-0 flex-1 divide-y divide-surface-border overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3">
                  {groups.map((g) => (
                    <GroupRow key={g.id} group={g} isMine={g.owner_id === user.id} />
                  ))}
                </ul>
              )}
            </section>
            {incoming.length > 0 && (
              <section className="card flex-shrink-0 !p-5 shadow-[0_14px_36px_-16px_rgb(255_159_10/0.55)] ring-1 ring-amber-400/50">
                <div className="mb-4 flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  </span>
                  <h2 className="text-[16px] font-semibold text-ink">Waiting for your approval</h2>
                </div>
                <JoinRequests requests={incoming} showGroup onChange={load} />
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="card flex-shrink-0 !p-5">
                <h2 className="mb-3 text-[16px] font-semibold text-ink">Requests you sent</h2>
                <ul className="space-y-2">
                  {outgoing.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface-elevated/60 px-4 py-3">
                      <Icon name="clock" className="h-5 w-5 flex-shrink-0 text-amber-600" />
                      <p className="min-w-0 flex-1 text-[14px] text-slate-600">
                        Waiting for the owner to let you into <span className="font-medium text-ink">{r.groups?.name}</span>
                      </p>
                      <button type="button" onClick={() => cancel(r.id)} className="text-[13px] font-medium text-slate-500 hover:text-rose-600">
                        Withdraw
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            </div>
          </>
        )}
      </div>

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          navigate(`/groups/${id}`);
        }}
      />
    </div>
  );
}

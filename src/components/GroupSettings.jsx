import { useEffect, useState } from 'react';
import Icon from './Icon';
import Avatar from './Avatar';
import InvitePanel from './InvitePanel';
import JoinRequests from './JoinRequests';
import ExportCard from './ExportCard';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { notifyGroupsChanged } from '../context/GroupsContext';

// `bodyClass` sizes the scrolling body (e.g. a max height on phones)
function Card({ title, subtitle, children, className = '', bodyClass = '' }) {
  return (
    <section className={`card flex flex-col overflow-hidden !p-0 ${className}`}>
      <div className="px-4 pb-3 pt-4 sm:px-5">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      </div>
      <div className={`min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 ${bodyClass}`}>{children}</div>
    </section>
  );
}

function Detail({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-[14px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}

// How old a debt must be before the person owed can nudge (once a day max)
const NUDGE_OPTIONS = [
  [0, 'Any time'],
  [1, 'After 1 day'],
  [3, 'After 3 days'],
  [7, 'After 7 days'],
  [14, 'After 14 days'],
  [30, 'After 30 days'],
];

function OwnerBadge() {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
      <Icon name="crown" className="h-3 w-3" /> Owner
    </span>
  );
}

// Group settings. Everyone sees the details and members; the owner also
// gets renaming, join requests, codes, member management, ownership
// transfer and deleting the group.
export default function GroupSettings({ group, members, people, expenses, settlements, me, isOwner, invites, requests, onChange, confirm, run, onLeft }) {
  const toast = useToast();
  const owner = members.find((m) => m.is_owner);
  const [name, setName] = useState(group.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => setName(group.name), [group.name]);

  const rename = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.renameGroup(group.id, name);
      toast.success('Group renamed');
      onChange();
      notifyGroupsChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const makeOwner = (m) =>
    confirm({
      title: `Make ${m.display_name} the owner?`,
      body: `${m.display_name} will approve new people, manage join codes, remove members and can delete the group. You'll become a regular member and can't take it back unless they hand it back.`,
      label: 'Make owner',
      action: run(() => api.transferOwnership(group.id, m.user_id), `${m.display_name} now owns ${group.name}`),
    });

  const remove = (m) =>
    confirm({
      title: `Remove ${m.display_name}?`,
      body: 'They need to be settled up first. Their past expenses stay in the history.',
      label: 'Remove',
      danger: true,
      action: run(() => api.removeMember(group.id, m.user_id), `${m.display_name} removed`),
    });

  const created = new Date(group.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    // Owner: details | join code + requests | export + danger. On phones the
    // columns dissolve into one list so requests and the join code come first.
    <div className={`flex flex-col gap-3 sm:gap-4 lg:grid lg:gap-5 ${isOwner ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
      <div className="panel-lg contents lg:flex lg:flex-col lg:gap-5">
        <Card title="Group details" className="flex-shrink-0">
          {isOwner ? (
            <form onSubmit={rename} className="mb-2">
              <label htmlFor="group-name" className="label">Name</label>
              <div className="flex gap-2">
                <input id="group-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
                <button type="submit" disabled={saving || !name.trim() || name.trim() === group.name} className="btn-primary flex-shrink-0">
                  Save
                </button>
              </div>
            </form>
          ) : (
            <Detail label="Name">{group.name}</Detail>
          )}
          <dl className="divide-y divide-surface-border">
            <Detail label="Owner">
              <span className="inline-flex items-center gap-2">
                <Avatar id={owner?.user_id} name={owner?.display_name} size="sm" />
                {owner?.user_id === me ? 'You' : owner?.display_name}
              </span>
            </Detail>
            <Detail label="Currency">{group.currency}</Detail>
            <Detail label="Nudges allowed">
              {isOwner ? (
                <select
                  aria-label="Nudges allowed after"
                  className="rounded-lg bg-surface-elevated/70 px-2 py-1 text-[14px] font-medium text-ink ring-1 ring-line/10 focus:outline-none focus:ring-brand-500/60"
                  value={group.nudge_after_days ?? 3}
                  onChange={async (e) => {
                    try {
                      await api.setNudgeAfter(group.id, Number(e.target.value));
                      toast.success('Reminder setting saved');
                      onChange();
                    } catch (err) {
                      toast.error(err.message);
                    }
                  }}
                >
                  {NUDGE_OPTIONS.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              ) : (
                NUDGE_OPTIONS.find(([v]) => v === (group.nudge_after_days ?? 3))?.[1] || `After ${group.nudge_after_days} days`
              )}
            </Detail>
            <Detail label="Members">{members.length}</Detail>
            <Detail label="Created">{created}</Detail>
          </dl>
          {!isOwner && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-elevated/60 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
              <Icon name="crown" className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" />
              {owner?.display_name} manages this group: inviting people, approving them and removing members. Ask them for a join code to bring someone in.
            </p>
          )}
        </Card>

        <Card
          title={`Members · ${members.length}`}
          subtitle={isOwner ? 'Make someone else the owner, or remove people who are settled up.' : undefined}
          className="lg:min-h-0 lg:flex-1"
          bodyClass="scroll-fade max-h-[45vh] lg:max-h-none lg:flex-1"
        >
          <ul className="space-y-1">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-2xl py-2">
                <Avatar id={m.user_id} name={m.display_name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
                    <span className="truncate">{m.user_id === me ? `${m.display_name} (you)` : m.display_name}</span>
                    {m.is_owner && <OwnerBadge />}
                  </span>
                  <span className="block truncate text-[13px] text-slate-500">{m.email}</span>
                </span>
                {isOwner && !m.is_owner && (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => makeOwner(m)}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-brand-600 ring-1 ring-brand-500/30 transition-colors hover:bg-brand-500 hover:text-white"
                    >
                      <Icon name="crown" className="h-3.5 w-3.5" /> Make owner
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-surface-elevated hover:text-rose-600"
                      aria-label={`Remove ${m.display_name}`}
                      title="Remove from group"
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {isOwner && (
        <div className="panel-lg max-lg:-order-1">
          <InvitePanel group={group} invites={invites} onChange={onChange} />
        </div>
      )}

      <div className="panel-lg contents lg:flex lg:flex-col lg:gap-5">
        {isOwner && (
          <Card
            title="Asking to join"
            subtitle="People who used one of your codes."
            className={`lg:min-h-0 lg:flex-1 ${requests.length ? 'ring-1 ring-amber-400/40 max-lg:-order-2' : ''}`}
            bodyClass="scroll-fade max-h-60 lg:max-h-none lg:flex-1"
          >
            {requests.length ? (
              <JoinRequests requests={requests} onChange={onChange} />
            ) : (
              <p className="text-[14px] text-slate-500">No one is waiting right now.</p>
            )}
          </Card>
        )}

        <ExportCard group={group} people={people} expenses={expenses} settlements={settlements} Card={Card} />


        <Card title={isOwner ? 'Danger zone' : 'Leave group'} className="flex-shrink-0 ring-1 ring-rose-500/15">
          {isOwner ? (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-slate-600">
                Want to leave? Make someone else the owner first, then leave from here.
              </p>
              <button
                type="button"
                onClick={() =>
                  confirm({
                    title: `Delete ${group.name}?`,
                    body: 'This removes the group, every expense and payment in it, for everyone. It can’t be undone.',
                    label: 'Delete group',
                    danger: true,
                    action: run(() => api.deleteGroup(group.id), 'Group deleted', onLeft),
                  })
                }
                className="btn-secondary w-full !text-rose-600"
              >
                <Icon name="trash" className="h-4 w-4" /> Delete group
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[14px] leading-relaxed text-slate-600">
                You need to be settled up in every bucket first. To come back you'll need a new code from {owner?.display_name}.
              </p>
              <button
                type="button"
                onClick={() =>
                  confirm({
                    title: `Leave ${group.name}?`,
                    body: 'You’ll lose access to this group straight away.',
                    label: 'Leave group',
                    danger: true,
                    action: run(() => api.removeMember(group.id, me), 'You left the group', onLeft),
                  })
                }
                className="btn-secondary w-full !text-rose-600"
              >
                Leave group
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

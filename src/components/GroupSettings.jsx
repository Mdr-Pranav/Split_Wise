import { useEffect, useState } from 'react';
import Icon from './Icon';
import Avatar from './Avatar';
import InvitePanel from './InvitePanel';
import JoinRequests from './JoinRequests';
import ExportCard from './ExportCard';
import AvatarPicker from './AvatarPicker';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { notifyGroupsChanged } from '../context/GroupsContext';

// Compact card: everything shows at its natural height, nothing scrolls inside
function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card !p-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-[12px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

// Small labelled tile for group facts
function Fact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 rounded-xl bg-surface-elevated/50 px-3 py-2 ring-1 ring-line/[0.05] ${className}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-medium text-ink">{children}</dd>
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
  const [picking, setPicking] = useState(false);

  const saveAvatar = async (look) => {
    try {
      await api.setGroupAvatar(group.id, look);
      toast.success('Group picture updated');
      onChange();
      notifyGroupsChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

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

  const nudgeSelect = (
    <select
      aria-label="Nudges allowed after"
      className="-ml-1 w-full cursor-pointer rounded-md bg-transparent px-1 text-[14px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/50"
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
  );

  const leaveOrDelete = isOwner
    ? {
        text: 'Hand ownership to someone first if you want to leave.',
        label: 'Delete group',
        icon: 'trash',
        dialog: {
          title: `Delete ${group.name}?`,
          body: 'This removes the group, every expense and payment in it, for everyone. It can’t be undone.',
          label: 'Delete group',
          danger: true,
          action: run(() => api.deleteGroup(group.id), 'Group deleted', onLeft),
        },
      }
    : {
        text: `Settle every bucket first. To rejoin you'll need a new code from ${owner?.display_name}.`,
        label: 'Leave group',
        icon: 'logout',
        dialog: {
          title: `Leave ${group.name}?`,
          body: 'You’ll lose access to this group straight away.',
          label: 'Leave group',
          danger: true,
          action: run(() => api.removeMember(group.id, me), 'You left the group', onLeft),
        },
      };

  return (
    // Owner: group + members | join code (+ requests) | export + danger.
    // On phones it's one list with waiting requests and the join code first.
    <div className={`flex flex-col gap-3 lg:grid lg:items-start lg:gap-4 ${isOwner ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <Card title="Group">
          <div className="mb-2.5 flex items-center gap-2.5">
            {isOwner ? (
              <button
                type="button"
                onClick={() => setPicking((v) => !v)}
                aria-expanded={picking}
                aria-label="Change group picture"
                title="Change group picture"
                className="relative flex-shrink-0 rounded-full transition-transform duration-200 active:scale-95"
              >
                <Avatar id={group.id} name={group.name} size="lg" className="!ring-0" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-[rgb(var(--card))]">
                  <Icon name="pencil" className="h-2.5 w-2.5" strokeWidth={2.6} />
                </span>
              </button>
            ) : (
              <Avatar id={group.id} name={group.name} size="lg" className="flex-shrink-0 !ring-0" />
            )}
          {isOwner ? (
            <form onSubmit={rename} className="flex min-w-0 flex-1 items-center gap-2">
              <input
                aria-label="Group name"
                className="input-field !py-2 text-[15px] font-medium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
              />
              {name.trim() !== group.name && (
                <button type="submit" disabled={saving || !name.trim()} className="btn-primary h-9 flex-shrink-0 !px-3" aria-label="Save name">
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                </button>
              )}
            </form>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ink">{group.name}</p>
          )}
          </div>
          {isOwner && (
            <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-ios ${picking ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="-mx-4 overflow-hidden">
                <AvatarPicker id={group.id} name={group.name} emoji={group.avatar_emoji || ''} color={group.avatar_color || ''} onSave={saveAvatar} />
              </div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Owner">
              <span className="inline-flex items-center gap-1.5">
                <Avatar id={owner?.user_id} name={owner?.display_name} size="sm" className="!h-5 !w-5 !text-[10px] !ring-0" />
                {owner?.user_id === me ? 'You' : owner?.display_name}
              </span>
            </Fact>
            <Fact label="Currency">{group.currency}</Fact>
            <Fact label="Nudges">
              {isOwner ? nudgeSelect : NUDGE_OPTIONS.find(([v]) => v === (group.nudge_after_days ?? 3))?.[1] || `After ${group.nudge_after_days} days`}
            </Fact>
            <Fact label="Created">{created}</Fact>
          </dl>
          {!isOwner && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-snug text-slate-500">
              <Icon name="crown" className="mt-px h-3.5 w-3.5 flex-shrink-0 text-brand-600" />
              {owner?.display_name} invites, approves and removes people. Ask them for a join code.
            </p>
          )}
        </Card>

        <Card title={`Members · ${members.length}`}>
          <ul className="-mx-1">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5" title={m.email}>
                <Avatar id={m.user_id} name={m.display_name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                  {m.user_id === me ? `${m.display_name} (you)` : m.display_name}
                </span>
                {m.is_owner && <OwnerBadge />}
                {isOwner && !m.is_owner && (
                  <span className="flex flex-shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => makeOwner(m)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-brand-500/10 hover:text-brand-600"
                      aria-label={`Make ${m.display_name} the owner`}
                      title="Make owner"
                    >
                      <Icon name="crown" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-rose-500/10 hover:text-rose-600"
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
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {requests.length > 0 && (
            <Card title="Asking to join" subtitle="Used one of your codes" className="shadow-[0_14px_36px_-16px_rgb(255_159_10/0.55)] ring-1 ring-amber-400/50 max-lg:-order-2">
              <JoinRequests requests={requests} onChange={onChange} />
            </Card>
          )}
          <div className="max-lg:-order-1">
            <InvitePanel group={group} invites={invites} onChange={onChange} />
          </div>
        </div>
      )}

      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <ExportCard group={group} people={people} expenses={expenses} settlements={settlements} Card={Card} />

        <Card title={isOwner ? 'Danger zone' : 'Leave group'} className="ring-1 ring-rose-500/15">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-500">{leaveOrDelete.text}</p>
            <button type="button" onClick={() => confirm(leaveOrDelete.dialog)} className="btn-secondary h-9 flex-shrink-0 !px-3.5 !text-[13px] !text-rose-600">
              <Icon name={leaveOrDelete.icon} className="h-4 w-4" /> {leaveOrDelete.label}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

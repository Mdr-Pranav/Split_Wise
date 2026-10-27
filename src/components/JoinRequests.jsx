import { useState } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/dates';

// People waiting for the owner's yes/no. `showGroup` adds the group name
// (used on the dashboard, where requests from every group are mixed).
export default function JoinRequests({ requests, showGroup = false, onChange }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState(null);

  const respond = async (req, approve) => {
    setBusyId(req.id);
    try {
      await api.respondRequest(req.id, approve);
      toast.success(approve ? `${req.profiles?.display_name} joined ${req.groups?.name}` : 'Request declined');
      onChange?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ul className="divide-y divide-surface-border">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Avatar id={r.user_id} name={r.profiles?.display_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium text-ink">
              {r.profiles?.display_name}
              {showGroup && <span className="font-normal text-slate-500"> → {r.groups?.name}</span>}
            </p>
            <p className="truncate text-[13px] text-slate-500">
              {r.profiles?.email} · {timeAgo(r.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => respond(r, false)} disabled={busyId === r.id} className="btn-secondary !px-3.5 !py-2" aria-label={`Decline ${r.profiles?.display_name}`}>
              <Icon name="x" className="h-4 w-4" />
              <span className="hidden sm:inline">Decline</span>
            </button>
            <button type="button" onClick={() => respond(r, true)} disabled={busyId === r.id} className="btn-primary !px-3.5 !py-2">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.2} />
              Approve
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

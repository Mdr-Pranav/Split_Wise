import { useEffect, useState } from 'react';
import Icon from './Icon';
import { GlowCard, GlowRing } from './Glow';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { timeLeft } from '../lib/dates';
import { APP_NAME } from '../lib/brand';

const pretty = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
const EXPIRY = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

// Owner-only, glowing card: the newest single-use code sits inside a ring
// that drains as it nears expiry. Using a code only asks to join; the owner
// still approves each person.
export default function InvitePanel({ group, invites, onChange }) {
  const toast = useToast();
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // Keep the ring and "time left" fresh while the page is open
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const [featured, ...others] = invites;
  const remaining = featured
    ? (new Date(featured.expires_at) - Date.now()) / (new Date(featured.expires_at) - new Date(featured.created_at))
    : 0;

  const create = async () => {
    setBusy(true);
    try {
      await api.createInvite(group.id, hours);
      onChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Couldn’t copy. Select and copy it manually.');
    }
  };

  const share = async (code) => {
    const url = `${window.location.origin}/join?code=${code}`;
    const text = `Join "${group.name}" on ${APP_NAME} with code ${pretty(code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${APP_NAME} invite`, text, url });
        return;
      } catch {
        // cancelled: fall back to copying
      }
    }
    copy(`${text}\n${url}`, 'Invite link');
  };

  const revoke = async (inv) => {
    try {
      await api.revokeInvite(inv.id);
      toast.info('Code revoked');
      onChange();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <GlowCard bodyClassName="flex flex-col items-center px-4 py-4 text-center">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/70">Join code</p>

      <GlowRing value={remaining} size={132} strokeWidth={8}>
        {featured ? (
          <>
            <button
              type="button"
              onClick={() => copy(pretty(featured.code), 'Code')}
              title="Copy code"
              className="text-glow select-all font-mono text-[17px] font-semibold tracking-[0.04em] text-white"
            >
              {pretty(featured.code)}
            </button>
            <span className="mt-0.5 text-[12px] text-white/70">{timeLeft(featured.expires_at)}</span>
          </>
        ) : (
          <>
            <Icon name="key" className="h-7 w-7 text-white/80" />
            <span className="mt-1.5 text-[12px] text-white/70">No active code</span>
          </>
        )}
      </GlowRing>

      <p className="mt-3 text-[12px] text-white/75">Single use · you approve everyone who joins</p>

      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {featured && (
          <button type="button" onClick={() => share(featured.code)} className="btn-glow !px-3 !py-1.5 !text-[12px]">
            <Icon name="link" className="h-3.5 w-3.5" /> Share
          </button>
        )}
        <button type="button" onClick={create} disabled={busy} className={`${featured ? 'btn-glow-ghost' : 'btn-glow'} !px-3 !py-1.5 !text-[12px]`}>
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> {busy ? 'Creating…' : 'New code'}
        </button>
        <select
          aria-label="New codes expire after"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="btn-glow-ghost cursor-pointer appearance-none !px-3 !py-1.5 !text-[12px] [&>option]:text-ink"
        >
          {EXPIRY.map((o) => (
            <option key={o.hours} value={o.hours}>{o.label}</option>
          ))}
        </select>
      </div>

      {others.length > 0 && (
        <ul className="mt-3 flex w-full flex-wrap justify-center gap-1.5 border-t border-white/15 pt-3">
          {invites.map((inv) => (
            <li key={inv.id} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-0.5 pl-2.5 pr-0.5 ring-1 ring-white/20">
              <span className="font-mono text-[12px] font-semibold tracking-wider">{pretty(inv.code)}</span>
              <span className="text-[10px] text-white/60">{timeLeft(inv.expires_at)}</span>
              <button
                type="button"
                onClick={() => revoke(inv)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                aria-label={`Revoke ${pretty(inv.code)}`}
                title="Revoke"
              >
                <Icon name="x" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {featured && others.length === 0 && (
        <button type="button" onClick={() => revoke(featured)} className="mt-2 text-[11px] font-medium text-white/60 hover:text-white">
          Revoke this code
        </button>
      )}
    </GlowCard>
  );
}

import { useEffect, useState } from 'react';
import Icon from './Icon';
import { GlowCard, GlowRing } from './Glow';
import { api } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { timeLeft } from '../lib/dates';

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
    const text = `Join "${group.name}" on Split Wise with code ${pretty(code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Split Wise invite', text, url });
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
    <GlowCard className="lg:h-full" bodyClassName="flex h-full flex-col justify-center overflow-y-auto px-5 py-5">
      <div className="flex flex-col items-center text-center">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-white/70">Join code</p>

        <GlowRing value={remaining} size={156}>
          {featured ? (
            <>
              <button
                type="button"
                onClick={() => copy(pretty(featured.code), 'Code')}
                title="Copy code"
                className="text-glow select-all font-mono text-[20px] font-semibold tracking-[0.04em] text-white"
              >
                {pretty(featured.code)}
              </button>
              <span className="mt-1 text-[13px] text-white/70">{timeLeft(featured.expires_at)}</span>
            </>
          ) : (
            <>
              <Icon name="key" className="h-9 w-9 text-white/80" />
              <span className="mt-2 text-[13px] text-white/70">No active code</span>
            </>
          )}
        </GlowRing>

        <span className="mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-[14px] font-semibold backdrop-blur">
          {featured ? 'Single use' : 'Invite someone'}
        </span>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-white/75">
          Each code works once. Whoever uses it still needs your approval before they see anything.
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {featured && (
            <button type="button" onClick={() => share(featured.code)} className="btn-glow">
              <Icon name="link" className="h-4 w-4" /> Share link
            </button>
          )}
          <button type="button" onClick={create} disabled={busy} className={featured ? 'btn-glow-ghost' : 'btn-glow'}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} /> {busy ? 'Creating…' : 'New code'}
          </button>
          <select
            aria-label="New codes expire after"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="btn-glow-ghost cursor-pointer appearance-none !pr-4 [&>option]:text-ink"
          >
            {EXPIRY.map((o) => (
              <option key={o.hours} value={o.hours}>Valid {o.label}</option>
            ))}
          </select>
        </div>

        {invites.length > 0 && (
          <div className="mt-4 w-full border-t border-white/15 pt-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">
              {invites.length === 1 ? 'Unused code' : `${invites.length} unused codes`}
            </p>
            <ul className="flex flex-wrap justify-center gap-1.5">
              {[featured, ...others].map((inv) => (
                <li key={inv.id} className="inline-flex items-center gap-1 rounded-full bg-white/10 py-1 pl-3 pr-1 ring-1 ring-white/20">
                  <span className="font-mono text-[13px] font-semibold tracking-wider">{pretty(inv.code)}</span>
                  <span className="text-[11px] text-white/60">{timeLeft(inv.expires_at)}</span>
                  <button
                    type="button"
                    onClick={() => revoke(inv)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                    aria-label={`Revoke ${pretty(inv.code)}`}
                    title="Revoke"
                  >
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </GlowCard>
  );
}

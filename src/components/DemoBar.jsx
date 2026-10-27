import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemo, mockAuth } from '../lib/auth';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';
import Avatar from './Avatar';

// Demo mode only: jump between sample people to try both sides of a flow
// (e.g. redeem a code as Neha, then approve it as Pranav).
export default function DemoBar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!isDemo) return null;
  const users = open ? mockAuth.users() : [];
  const current = user && mockAuth.users().find((u) => u.id === user.id);

  const switchTo = (id) => {
    mockAuth.switchTo(id);
    setOpen(false);
    navigate('/');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="safe-bottom glass fixed left-4 z-40 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-ink"
      >
        <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">Demo</span>
        <span className="max-w-[9rem] truncate">{current ? current.display_name : 'Pick a user'}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="demo-title" className="max-w-sm">
        <h2 id="demo-title" className="pr-10 text-[20px] font-semibold text-ink">Demo mode</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">
          No database is connected, so data lives in this browser. Switch person to see the app from their side.
          Every demo password is <code className="rounded bg-surface-elevated px-1">demo</code>.
        </p>
        <ul className="mt-5 space-y-1.5">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => switchTo(u.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated ${
                  u.id === user?.id ? 'bg-brand-500/10 ring-1 ring-brand-500/30' : ''
                }`}
              >
                <Avatar id={u.id} name={u.display_name} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">{u.display_name}</span>
                  <span className="block truncate text-[13px] text-slate-500">{u.email}</span>
                </span>
                {u.id === user?.id && <span className="text-[12px] font-medium text-brand-600">Current</span>}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            mockAuth.reset();
            setOpen(false);
            navigate('/');
          }}
          className="btn-secondary mt-5 w-full"
        >
          Reset demo data
        </button>
      </Modal>
    </>
  );
}

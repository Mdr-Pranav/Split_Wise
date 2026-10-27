import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { isDemo } from '../lib/auth';
import Icon from '../components/Icon';
import { ErrorNote } from '../components/AuthShell';

// Shows the code as XXXX-XXXX while typing
function formatCode(raw) {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export default function JoinGroup() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(formatCode(params.get('code') || ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setResult(await api.redeemInvite(code));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="card mx-auto max-w-md p-7 text-center sm:p-9">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-accent2-700 text-white shadow-glow">
          <Icon name="clock" className="h-8 w-8" />
        </div>
        <h1 className="text-[26px] font-semibold text-ink">Request sent</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          <span className="font-medium text-ink">{result.owner_name}</span> owns <span className="font-medium text-ink">{result.group_name}</span> and
          needs to approve you. It'll show up on your home screen once they do.
        </p>
        <Link to="/" className="btn-primary mt-7 w-full">Back home</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <h1 className="text-[34px] font-semibold leading-tight text-ink sm:text-[42px]">Join a group</h1>
        <p className="mt-2 text-[15px] text-slate-600">Enter the one-time code the group owner gave you.</p>
      </div>
      <form onSubmit={submit} className="card space-y-5 p-7 shadow-glow sm:p-8">
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label htmlFor="code" className="label">Invite code</label>
          <input
            id="code"
            className="input-field text-center font-mono text-[26px] font-semibold uppercase tracking-[0.18em]"
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
        </div>
        <button type="submit" disabled={busy || code.replace('-', '').length !== 8} className="btn-primary h-12 w-full">
          {busy ? 'Checking…' : 'Ask to join'}
        </button>
        <ol className="space-y-2 border-t border-surface-border pt-5 text-[13px] text-slate-500">
          <li className="flex gap-2"><span className="font-semibold text-brand-600">1</span> The code is used up as soon as you submit it.</li>
          <li className="flex gap-2"><span className="font-semibold text-brand-600">2</span> The owner sees your request and approves or declines it.</li>
          <li className="flex gap-2"><span className="font-semibold text-brand-600">3</span> Once approved, the group appears on your home screen.</li>
        </ol>
        {isDemo && (
          <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300">
            Demo tip: switch to <b>Rahul</b> (bottom-left) and use code <b className="font-mono">GOA7-K2MX</b>, then switch back to Pranav to approve.
          </p>
        )}
      </form>
    </div>
  );
}

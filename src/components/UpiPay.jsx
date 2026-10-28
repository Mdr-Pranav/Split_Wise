import { useEffect, useState } from 'react';
import Icon from './Icon';
import { appLaunchUrl, copyNow, isPhone, launchableApps, upiLink } from '../lib/upi';
import { useToast } from '../context/ToastContext';

const LAST_APP_KEY = 'splitzy-upi-app';

// Payment helper inside Settle up: the receiver's UPI ID and the amount to
// copy, then two ways to pay. "Show QR" works on laptops (scan it with your
// phone); "Open app" works on phones (copies the UPI ID and launches the
// app's home screen). The one that doesn't fit the device stays visible but
// disabled. UPI apps flag pre-filled links to personal UPI IDs, so the
// payment itself happens by hand in the UPI app; nothing is recorded until
// the user taps "I've paid".
export default function UpiPay({ payee, vpa, amount, note }) {
  const toast = useToast();
  const phone = isPhone();
  const [open, setOpen] = useState(''); // '' | qr | apps
  const [qr, setQr] = useState('');
  const [lastApp, setLastApp] = useState(() => {
    try {
      return localStorage.getItem(LAST_APP_KEY);
    } catch {
      return null;
    }
  });
  const apps = launchableApps().sort((a, b) => (b.id === lastApp) - (a.id === lastApp));
  const plainAmount = Number(amount).toFixed(2).replace(/\.00$/, '');
  const link = vpa ? upiLink({ vpa, name: payee, amount, note }) : '';

  // A new amount or person invalidates the QR
  useEffect(() => {
    setQr('');
    setOpen((o) => (o === 'qr' ? '' : o));
  }, [link]);

  const copy = (text, what) => {
    copyNow(text);
    toast.success(`${what} copied`);
  };

  const showQr = async () => {
    if (open === 'qr') return setOpen('');
    if (!qr) {
      const { toDataURL } = await import('qrcode');
      setQr(await toDataURL(link, { margin: 1, width: 360, color: { dark: '#000000', light: '#ffffff' } }));
    }
    setOpen('qr');
  };

  const launch = (app) => {
    copyNow(vpa);
    try {
      localStorage.setItem(LAST_APP_KEY, app.id);
    } catch {
      // only affects ordering
    }
    setLastApp(app.id);
    toast.success(`UPI ID copied · opening ${app.name}`);
  };

  const tile = (active) =>
    `flex h-11 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-[transform,background-color,opacity] duration-300 ease-ios active:scale-[0.97] ${
      active ? 'bg-brand-500 text-white' : 'bg-[rgb(var(--line)/0.08)] text-ink hover:bg-[rgb(var(--line)/0.13)]'
    } disabled:pointer-events-none disabled:opacity-35`;

  return (
    <div className="space-y-2.5 rounded-2xl bg-[rgb(var(--line)/0.05)] p-3 ring-1 ring-[rgb(var(--line)/0.06)]">
      {/* What to pay, copyable */}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <CopyField label="UPI ID" value={vpa || 'Not added yet'} mono disabled={!vpa} onCopy={() => copy(vpa, 'UPI ID')} />
        <CopyField label="Amount" value={`₹${plainAmount}`} onCopy={() => copy(plainAmount, 'Amount')} />
      </div>

      {/* Ways to pay; the one that doesn't suit this device is disabled */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={showQr} disabled={phone || !vpa} title={phone ? 'On a phone, use Open app' : undefined} className={tile(open === 'qr')}>
          <Icon name="qr" className="h-4 w-4" /> Show QR
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => (o === 'apps' ? '' : 'apps'))}
          disabled={!phone || !vpa}
          title={!phone ? 'Opening a UPI app works on a phone' : undefined}
          className={tile(open === 'apps')}
        >
          <Icon name="phone" className="h-4 w-4" /> Open app
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-ios ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          {open === 'qr' && qr && (
            <div className="flex items-center gap-3 pt-0.5">
              <img src={qr} alt={`UPI QR to pay ${payee} ₹${plainAmount}`} className="h-[132px] w-[132px] flex-shrink-0 rounded-xl bg-white p-1.5" />
              <p className="text-[13px] leading-snug text-slate-500">
                Scan with any UPI app on your phone to pay <span className="font-medium text-ink">{payee}</span>{' '}
                <span className="font-semibold tabular-nums text-ink">₹{plainAmount}</span>, then tap <b className="text-ink">I’ve paid</b> below.
              </p>
            </div>
          )}
          {open === 'apps' && (
            <div className="space-y-1.5 pt-0.5">
              <div className={`grid gap-1.5 ${apps.length > 3 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {apps.map((app, i) => (
                  <a key={app.id} href={appLaunchUrl(app)} onClick={() => launch(app)} className={`${i === 0 ? 'btn-primary' : 'btn-secondary'} h-9 !px-1 !text-[13px]`}>
                    {app.name}
                  </a>
                ))}
              </div>
              <p className="text-[12px] text-slate-500">
                Copies the UPI ID and opens the app. There: <b className="text-ink">Pay → UPI ID</b> → paste → enter{' '}
                <b className="tabular-nums text-ink">₹{plainAmount}</b>.
              </p>
            </div>
          )}
        </div>
      </div>

      {phone && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-500">
          <Icon name="bell" className="mt-px h-3 w-3 flex-shrink-0" />
          UPI rules don’t let apps start payments between friends automatically, so pay in your UPI app, then come back and tap I’ve paid.
        </p>
      )}
    </div>
  );
}

function CopyField({ label, value, mono, disabled, onCopy }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled}
      title={disabled ? undefined : `Copy ${label}`}
      className="group flex min-w-0 items-center gap-2 rounded-xl bg-surface-card px-3 py-1.5 text-left ring-1 ring-[rgb(var(--line)/0.08)] transition-transform duration-200 active:scale-[0.98] disabled:active:scale-100"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>
        <span className={`block truncate text-[14px] font-semibold tabular-nums ${disabled ? '!font-normal text-slate-400' : 'text-ink'} ${mono ? 'font-mono text-[13px]' : ''}`}>
          {value}
        </span>
      </span>
      {!disabled && <Icon name="copy" className="h-4 w-4 flex-shrink-0 text-slate-400 transition-colors group-hover:text-brand-500" />}
    </button>
  );
}

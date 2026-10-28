import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { iosAppLinks, isIOS, isPhone, upiLink } from '../lib/upi';
import { formatMoney } from '../lib/money';
import { useToast } from '../context/ToastContext';

// Pay the receiver from the user's UPI app, then come back and confirm.
// Phones open the app directly (iOS picks an app by name); laptops get a QR
// code to scan. Some apps (often Google Pay) refuse payments started from a
// link to a personal UPI ID and show a misleading "bank limit" error, so a
// manual route (copy ID + amount, QR from gallery, link without amount) is
// always one tap away. Nothing is recorded until the user taps "I've paid".
export default function UpiPay({ payee, vpa, amount, note, busy, onPaid }) {
  const toast = useToast();
  const [stage, setStage] = useState('pay'); // pay | qr | back | manual
  const [qr, setQr] = useState('');
  const boxRef = useRef(null);
  const payment = { vpa, name: payee, amount, note };
  const link = upiLink(payment);
  const phone = isPhone();
  const ios = isIOS();
  const plainAmount = Number(amount).toFixed(2).replace(/\.00$/, '');

  // Amount or bucket changed: start over
  useEffect(() => {
    setStage('pay');
    setQr('');
  }, [link]);

  const makeQr = async () => {
    if (qr) return qr;
    const { toDataURL } = await import('qrcode');
    const url = await toDataURL(link, { margin: 2, width: 440, color: { dark: '#000000', light: '#ffffff' } });
    setQr(url);
    return url;
  };

  const showQr = async () => {
    await makeQr();
    setStage('qr');
  };

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Couldn’t copy. Long-press to copy it instead.');
    }
  };

  // The extra steps can sit below the fold of a tall dialog
  useEffect(() => {
    if (stage !== 'pay') boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [stage]);

  const money = formatMoney(amount, 'INR');
  const paidButton = (
    <button type="button" onClick={onPaid} disabled={busy} className="btn-primary w-full">
      <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> {busy ? 'Sending…' : 'I’ve paid'}
    </button>
  );

  if (stage === 'manual') {
    return (
      <div ref={boxRef} className="space-y-3 rounded-2xl bg-[rgb(var(--line)/0.06)] p-4">
        <div>
          <p className="text-[15px] font-semibold text-ink">Pay {payee} by hand</p>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
            Some apps, often Google Pay, block payments started from a link and wrongly say you hit a bank limit. Paying by hand
            works: open any UPI app, choose “Pay to UPI ID”, and paste these.
          </p>
        </div>
        <div className="divide-y divide-[rgb(var(--line)/0.1)] overflow-hidden rounded-xl bg-surface-card ring-1 ring-[rgb(var(--line)/0.08)]">
          {[
            ['UPI ID', vpa, 'UPI ID'],
            ['Amount', `₹${plainAmount}`, 'Amount', plainAmount],
          ].map(([label, shown, what, raw]) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2">
              <span className="w-16 flex-shrink-0 text-[12px] text-slate-500">{label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-medium text-ink">{shown}</span>
              <button type="button" onClick={() => copy(raw ?? shown, what)} className="btn-secondary h-8 !px-3 !text-[12px]">
                <Icon name="copy" className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {phone && !ios && (
            <a href={upiLink({ ...payment, withAmount: false })} className="btn-secondary !px-2 !text-[13px]">
              Open UPI app, type amount
            </a>
          )}
          <button
            type="button"
            onClick={async () => {
              const url = await makeQr();
              const a = document.createElement('a');
              a.href = url;
              a.download = `pay-${payee.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-upi.png`;
              a.click();
              toast.success('QR saved. Scan it from your gallery in any UPI app.');
            }}
            className={`btn-secondary !px-2 !text-[13px] ${phone && !ios ? '' : 'col-span-2'}`}
          >
            <Icon name="download" className="h-4 w-4" /> Save QR to scan
          </button>
        </div>
        <p className="text-[12px] text-slate-500">PhonePe, Paytm and BHIM usually accept the normal button too.</p>
        {paidButton}
      </div>
    );
  }

  if (stage === 'back') {
    return (
      <div ref={boxRef} className="space-y-3 rounded-2xl bg-brand-500/[0.07] p-4 text-center ring-1 ring-brand-500/20">
        <p className="text-[15px] font-medium text-ink">Did the {money} payment to {payee} go through?</p>
        <p className="text-[13px] text-slate-500">{payee} still confirms it before anything is cleared.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStage('manual')} className="btn-secondary flex-1">It didn’t work</button>
          <button type="button" onClick={onPaid} disabled={busy} className="btn-primary flex-1">
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> {busy ? 'Sending…' : 'Yes, I’ve paid'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'qr') {
    return (
      <div ref={boxRef} className="space-y-3 rounded-2xl bg-[rgb(var(--line)/0.06)] p-4 text-center">
        <img src={qr} alt={`UPI QR code to pay ${payee} ${money}`} className="mx-auto h-[200px] w-[200px] rounded-xl bg-white p-2" />
        <p className="text-[13px] text-slate-600">
          Scan with any UPI app to pay <span className="font-medium text-ink">{payee}</span> {money}
          <span className="block font-mono text-[12px] text-slate-500">{vpa}</span>
        </p>
        <button type="button" onClick={() => setStage('back')} className="btn-primary w-full">I’ve scanned and paid</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {phone && !ios && (
        <a href={link} onClick={() => setTimeout(() => setStage('back'), 600)} className="btn-primary h-12 w-full">
          <Icon name="bolt" className="h-4 w-4" /> Pay {money} via UPI
        </a>
      )}
      {ios && (
        <>
          <p className="text-center text-[13px] text-slate-500">Pay {money} with</p>
          <div className="grid grid-cols-3 gap-2">
            {iosAppLinks(payment).map((a) => (
              <a key={a.app} href={a.href} onClick={() => setTimeout(() => setStage('back'), 600)} className="btn-primary !px-2">
                {a.app}
              </a>
            ))}
          </div>
          <a href={link} onClick={() => setTimeout(() => setStage('back'), 600)} className="block text-center text-[13px] font-medium text-brand-600">
            Another UPI app
          </a>
        </>
      )}
      {!phone && (
        <button type="button" onClick={showQr} className="btn-primary h-12 w-full">
          <Icon name="bolt" className="h-4 w-4" /> Pay {money} via UPI · show QR
        </button>
      )}
      {/* Exactly what the UPI app will receive, so there's no doubt about the amount */}
      <p className="text-center text-[12px] text-slate-500">
        Opens with <span className="font-semibold tabular-nums text-ink">₹{Number(amount).toFixed(2)}</span> to{' '}
        <span className="font-mono text-ink">{vpa}</span>
      </p>
      <button type="button" onClick={() => setStage('manual')} className="block w-full text-center text-[13px] font-medium text-slate-500 hover:text-ink">
        {phone ? 'App says “bank limit”? Pay by hand' : 'Pay by hand instead'}
      </button>
    </div>
  );
}

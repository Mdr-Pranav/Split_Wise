import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { iosAppLinks, isIOS, isPhone, upiLink } from '../lib/upi';
import { formatMoney } from '../lib/money';

// Pay the receiver from the user's UPI app, then come back and confirm.
// Phones open the app directly (iOS picks an app by name); laptops get a QR
// code to scan. Nothing is recorded until the user taps "I've paid".
export default function UpiPay({ payee, vpa, amount, note, busy, onPaid }) {
  const [stage, setStage] = useState('pay'); // pay | qr | back
  const [qr, setQr] = useState('');
  const boxRef = useRef(null);
  const payment = { vpa, name: payee, amount, note };
  const link = upiLink(payment);
  const phone = isPhone();
  const ios = isIOS();

  // Amount or bucket changed: start over
  useEffect(() => {
    setStage('pay');
    setQr('');
  }, [link]);

  const showQr = async () => {
    const { toDataURL } = await import('qrcode');
    setQr(await toDataURL(link, { margin: 1, width: 220, color: { dark: '#0f172a', light: '#ffffff' } }));
    setStage('qr');
  };

  // The QR / "did it go through?" box can sit below the fold of a tall dialog
  useEffect(() => {
    if (stage !== 'pay') boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [stage]);

  const money = formatMoney(amount, 'INR');

  if (stage === 'back') {
    return (
      <div ref={boxRef} className="space-y-3 rounded-2xl bg-brand-500/[0.07] p-4 text-center ring-1 ring-brand-500/20">
        <p className="text-[15px] font-medium text-ink">Did the {money} payment to {payee} go through?</p>
        <p className="text-[13px] text-slate-500">{payee} still confirms it before anything is cleared.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStage('pay')} className="btn-secondary flex-1">Not yet</button>
          <button type="button" onClick={onPaid} disabled={busy} className="btn-primary flex-1">
            <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> {busy ? 'Sending…' : 'Yes, I’ve paid'}
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'qr') {
    return (
      <div ref={boxRef} className="space-y-3 rounded-2xl bg-surface-elevated/60 p-4 text-center">
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
      {phone && (
        <button type="button" onClick={showQr} className="block w-full text-center text-[13px] font-medium text-slate-500 hover:text-ink">
          Show a QR code instead
        </button>
      )}
    </div>
  );
}

// UPI deep links: open the payer's UPI app (GPay, PhonePe, Paytm, BHIM…)
// with the receiver, amount and note already filled in.

// Same rule as the check on profiles.upi_id in schema.sql
export const UPI_PATTERN = /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export const isValidUpi = (value) => UPI_PATTERN.test(value.trim());

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isIOS();

// The query string every UPI app understands. pa stays unencoded (some apps
// reject %40 for @); the rest is percent-encoded, never "+" for spaces.
// withAmount: false leaves the amount for the payer to type, which some
// apps (often Google Pay) accept when they block a pre-filled link.
function upiQuery({ vpa, name, amount, note, withAmount = true }) {
  const parts = [`pa=${vpa.trim()}`, `pn=${encodeURIComponent(name.slice(0, 40))}`];
  if (withAmount) parts.push(`am=${Number(amount).toFixed(2)}`);
  parts.push('cu=INR');
  if (note) parts.push(`tn=${encodeURIComponent(note.slice(0, 50))}`);
  return parts.join('&');
}

// Android hands upi:// to the default UPI app (or asks which one)
export const upiLink = (payment) => `upi://pay?${upiQuery(payment)}`;

// iOS has no system-wide UPI handler, so offer the big apps by name
export const iosAppLinks = (payment) => {
  const q = upiQuery(payment);
  return [
    { app: 'GPay', href: `gpay://upi/pay?${q}` },
    { app: 'PhonePe', href: `phonepe://pay?${q}` },
    { app: 'Paytm', href: `paytmmp://pay?${q}` },
  ];
};

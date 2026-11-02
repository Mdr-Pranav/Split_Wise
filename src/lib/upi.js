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

// Launch a UPI app's home screen (not a payment link, so no risk check).
// Android: Chrome's intent: URL by package name, which opens the Play Store
// if the app isn't installed. iOS: each app's own URL scheme.
export const UPI_APPS = [
  { id: 'gpay', name: 'GPay', android: 'com.google.android.apps.nbu.paisa.user', ios: 'gpay://' },
  { id: 'phonepe', name: 'PhonePe', android: 'com.phonepe.app', ios: 'phonepe://' },
  { id: 'paytm', name: 'Paytm', android: 'net.one97.paytm', ios: 'paytmmp://' },
  { id: 'bhim', name: 'BHIM', android: 'in.org.npci.upiapp', ios: null },
];

export function appLaunchUrl(app) {
  if (isIOS()) return app.ios;
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.android};end`;
}

// Apps that can be launched on this device
export const launchableApps = () => UPI_APPS.filter((a) => (isIOS() ? a.ios : true));

// Synchronous copy so it lands inside the tap, before the app opens
export function copyNow(text) {
  try {
    navigator.clipboard?.writeText(text).catch(() => {});
  } catch {
    // fall through to the textarea trick
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  } catch {
    // clipboard API above usually covers it
  }
}

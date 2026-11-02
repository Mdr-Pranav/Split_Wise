// Push notifications: the browser subscribes with the app's public VAPID key
// and the subscription is stored in push_subscriptions; the database's
// triggers and the push function (supabase/functions/push) do the sending.

import { isConfigured } from './supabase';
import { api } from './api';
import { isStandalone } from './pwa';
import { isIOS } from './upi';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// The service worker only runs in production builds
const supported = () => import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const save = (sub) => {
  const { endpoint, keys } = sub.toJSON();
  return api.savePushSubscription(endpoint, keys.p256dh, keys.auth);
};

// 'unavailable' (demo / no key / dev server), 'install' (iPhone: only
// installed apps can get pushes), 'unsupported', 'denied', 'on' or 'off'
export async function pushStatus() {
  if (!isConfigured || !VAPID_KEY) return 'unavailable';
  if (isIOS() && !isStandalone()) return 'install';
  if (!supported()) return import.meta.env.PROD ? 'unsupported' : 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings.' : 'Notifications weren’t allowed');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) }));
  await save(sub);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.deletePushSubscription(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

// After signing in: this browser's existing subscription now belongs to them
export async function relinkPush() {
  if (!isConfigured || !VAPID_KEY || !supported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await save(sub);
}

// Before signing out: stop sending this person's notifications here, but
// keep the browser's permission for whoever signs in next
export async function unlinkPush() {
  if (!isConfigured || !supported()) return;
  const sub = await currentSubscription().catch(() => null);
  if (sub) await api.deletePushSubscription(sub.endpoint).catch(() => {});
}

export const sendTestPush = () => api.sendTestPush();

// Splitzy service worker: makes the app installable, opens it offline, and
// shows push notifications. Only the app's own files are cached here;
// Supabase is a different origin and never touched (the app keeps its own
// copy of the last data it saw for offline reading).

// Both filled in by the build (see vite.config.js): a version per deploy and
// every built file, so the whole app works offline after the first visit
const VERSION = '__BUILD__';
const PRECACHE = [] /* __PRECACHE__ */;

const CACHE = `splitzy-${VERSION}`;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...SHELL, ...PRECACHE])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: network first so a new deploy shows up straight away; the cached
  // shell is the fallback when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Built files have content hashes in their names, so cache-first is safe
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});

// { title, body, url, tag } from supabase/functions/push
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Splitzy', {
      body: data.body || '',
      tag: data.tag,
      // A newer update with the same tag replaces the old one but still buzzes
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      data: { url: data.url || '/' },
    })
  );
});

// Open (or focus) the app on the screen the notification is about
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', url: path });
        return;
      }
      await self.clients.openWindow(path);
    })()
  );
});

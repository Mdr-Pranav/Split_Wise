// Offline reading: every successful read is kept in localStorage (per
// signed-in person), and handed back when the network is down, so groups,
// balances and activity still open on a plane or in a basement.

const PREFIX = 'splitzy-cache:';
let scope = '';
let stale = false;
const listeners = new Set();

// Who's signed in; cached data is never shown to someone else
export function setCacheUser(id) {
  scope = id || '';
}

export const cacheUser = () => scope;

// Sign out wipes it so the next person on this device sees nothing
export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable
  }
}

// Chrome: "Failed to fetch"; Safari: "Load failed"; Firefox: "NetworkError…"
export const isNetworkError = (err) =>
  !navigator.onLine || /failed to fetch|load failed|networkerror|network request failed|offline/i.test(err?.message || String(err));

// True while the screen is showing saved data instead of live data
export const isShowingSaved = () => stale;

export function onSavedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStale(value) {
  if (stale === value) return;
  stale = value;
  listeners.forEach((fn) => fn(value));
}

const keyFor = (name, args) => `${PREFIX}${scope}:${name}:${JSON.stringify(args)}`;

// Wraps a read so it falls back to its last good answer when offline
export function cachedRead(name, fn) {
  return async (...args) => {
    try {
      const data = await fn(...args);
      try {
        localStorage.setItem(keyFor(name, args), JSON.stringify(data));
      } catch {
        // full: keep working without the cache
      }
      setStale(false);
      return data;
    } catch (err) {
      if (scope && isNetworkError(err)) {
        const raw = localStorage.getItem(keyFor(name, args));
        if (raw != null) {
          setStale(true);
          return JSON.parse(raw);
        }
      }
      throw err;
    }
  };
}

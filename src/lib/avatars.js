import { useSyncExternalStore } from 'react';

// Profile pictures (emoji + background colour) by user id. Every screen that
// loads people (group balances, join requests, the bell, your own profile)
// records them here, so any <Avatar id={…}> anywhere shows them.
const looks = new Map();
const listeners = new Set();
let version = 0;

// entries: [id, emoji, colour]
export function rememberLooks(entries) {
  let changed = false;
  for (const [id, emoji, color] of entries) {
    if (!id) continue;
    const prev = looks.get(id);
    const next = { emoji: emoji || null, color: color || null };
    if (prev?.emoji !== next.emoji || prev?.color !== next.color) {
      looks.set(id, next);
      changed = true;
    }
  }
  if (changed) {
    version += 1;
    listeners.forEach((fn) => fn());
  }
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const NONE = { emoji: null, color: null };

export function useAvatarLook(id) {
  useSyncExternalStore(subscribe, () => version);
  return (id && looks.get(id)) || NONE;
}

// First grapheme of the input, accepted only if it's an emoji
export function firstEmoji(text) {
  const value = text.trim();
  if (!value) return '';
  const first = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(value)][0]?.segment : [...value][0];
  return first && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) ? first : '';
}

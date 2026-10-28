import { useAvatarLook } from '../lib/avatars';

// Solid iOS system colours, picked from the id so a person keeps theirs
const colours = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#5856d6', '#a2845e'];

function pick(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return colours[Math.abs(h) % colours.length];
}

const sizes = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-[15px]',
};

// Emojis sit a bit larger than letters in the same circle
const emojiSizes = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[23px]' };

// A person's (or group's) circle: their chosen emoji or their initial, on
// the background colour they picked. With an emoji but no colour picked it
// sits on a soft tint. `emoji` / `color` props override the lookup.
export default function Avatar({ id, name = '?', size = 'md', emoji, color, className = '' }) {
  const look = useAvatarLook(id);
  const shown = emoji ?? look.emoji;
  const chosen = color ?? look.color;
  const colour = chosen || pick(id || name);
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: shown && !chosen ? `${colour}2e` : colour }}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--wall)] ${sizes[size]} ${
        shown ? `${emojiSizes[size]} leading-none` : ''
      } ${className}`}
    >
      {shown || name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { firstEmoji } from '../lib/avatars';

const EMOJIS = [
  '😎', '🤠', '🥳', '🤓', '😇', '🤖', '👻', '👽', '🦄', '🐼',
  '🐯', '🦊', '🐨', '🐸', '🐧', '🦋', '🐙', '🦖', '🌵', '🌸',
  '🔥', '⚡️', '🌈', '⭐️', '🍕', '🍔', '🍩', '☕️', '🍻', '🎧',
  '🎮', '🏀', '⚽️', '🏏', '🏄', '🚀', '✈️', '🏝️', '💸', '💎',
];

// iOS system colours to sit behind the emoji or initial
const COLOURS = ['#007aff', '#5856d6', '#af52de', '#ff2d55', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#30b0c7', '#8e8e93', '#1c1c1e', '#f2f2f7'];

// Picture picker for a person or a group: live preview, a background colour,
// and an emoji (from the grid, or any typed / pasted one), or back to the
// initial. onSave({ emoji, color }) gets called on every pick.
export default function AvatarPicker({ id, name, emoji: savedEmoji, color: savedColor, onSave }) {
  const [typed, setTyped] = useState('');
  // Local copy so quick picks build on each other before the save comes back
  const [look, setLook] = useState({ emoji: savedEmoji, color: savedColor });
  useEffect(() => setLook({ emoji: savedEmoji, color: savedColor }), [savedEmoji, savedColor]);
  const { emoji, color } = look;
  const pick = (patch) => {
    const next = { ...look, ...patch };
    setLook(next);
    onSave(next);
  };

  return (
    <div className="space-y-3 px-4 pb-3.5 pt-0.5">
      <div className="flex items-center gap-3">
        <Avatar id={id} name={name} emoji={emoji || null} color={color || null} size="lg" className="!h-14 !w-14 !text-[28px]" />
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Background</p>
          <div role="radiogroup" aria-label="Background colour" className="flex flex-wrap gap-1.5">
            <button
              type="button"
              role="radio"
              aria-checked={!color}
              aria-label="Automatic colour"
              title="Automatic"
              onClick={() => pick({ color: '' })}
              className={`flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--line)/0.08)] text-slate-500 transition-transform duration-200 active:scale-90 ${
                !color ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-[rgb(var(--card))]' : ''
              }`}
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
            {COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Background ${c}`}
                onClick={() => pick({ color: c })}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 rounded-full ring-1 ring-[rgb(var(--line)/0.15)] transition-transform duration-200 active:scale-90 ${
                  color === c ? '!ring-2 !ring-brand-500 ring-offset-2 ring-offset-[rgb(var(--card))]' : ''
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Emoji</p>
        <div className="grid grid-cols-10 gap-1">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => pick({ emoji: e })}
              aria-label={`Use ${e}`}
              className={`flex aspect-square items-center justify-center rounded-xl text-[20px] transition-[transform,background-color] duration-200 hover:bg-[rgb(var(--line)/0.08)] active:scale-90 ${
                emoji === e ? 'bg-brand-500/15 ring-2 ring-brand-500' : ''
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label="Type or paste any emoji"
          value={typed}
          onChange={(ev) => setTyped(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && firstEmoji(typed)) {
              ev.preventDefault();
              pick({ emoji: firstEmoji(typed) });
              setTyped('');
            }
          }}
          placeholder="Or type any emoji…"
          className="input-field !py-1.5 text-[14px]"
        />
        <button
          type="button"
          disabled={!firstEmoji(typed)}
          onClick={() => {
            pick({ emoji: firstEmoji(typed) });
            setTyped('');
          }}
          className="btn-primary h-8 flex-shrink-0 !px-3 !text-[13px]"
        >
          Use
        </button>
        {emoji && (
          <button type="button" onClick={() => pick({ emoji: '' })} className="btn-secondary h-8 flex-shrink-0 !px-3 !text-[13px]">
            Use initial
          </button>
        )}
      </div>
    </div>
  );
}


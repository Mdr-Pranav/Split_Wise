import { useId } from 'react';

// The Splitzy mark: a coin zapped in two by a zig-zag bolt (the "Z").
// The two halves are the same coin clipped either side of the bolt and
// nudged apart. public/favicon.svg and the app icons are drawn the same way.
export const BOLT_LEFT = '0,0 19.6,0 18,4 13.5,15 18.5,17 14,28 12.4,32 0,32';
export const BOLT_RIGHT = '19.6,0 32,0 32,32 12.4,32 14,28 18.5,17 13.5,15 18,4';

export default function Logo({ className = 'h-6 w-6' }) {
  // Unique per instance so a hidden copy can't break the references
  const id = useId();

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <clipPath id={`${id}l`}>
          <polygon points={BOLT_LEFT} />
        </clipPath>
        <clipPath id={`${id}r`}>
          <polygon points={BOLT_RIGHT} />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="9" fill="#007aff" />
      <g clipPath={`url(#${id}l)`}>
        <circle cx="14.3" cy="15.1" r="9.5" fill="#ffffff" />
      </g>
      <g clipPath={`url(#${id}r)`}>
        <circle cx="17.7" cy="16.9" r="9.5" fill="#a9b8dc" />
      </g>
    </svg>
  );
}

import { useId } from 'react';

// Rounded tile with a "%"-style split mark
export default function Logo({ className = 'h-6 w-6' }) {
  // Unique per instance so a hidden copy can't break the gradient reference
  const gradientId = useId();

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--brand-400))" />
          <stop offset="1" stopColor="rgb(var(--brand-700))" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="rgba(255,255,255,0.35)" />
      <path d="M10.5 21.5l11-11" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="11" cy="11" r="2.6" fill="#ffffff" />
      <circle cx="21" cy="21" r="2.6" fill="#ffffff" />
    </svg>
  );
}

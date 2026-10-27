import { useId } from 'react';

// Deep-blue gradient card with soft light blobs (same look as Finance
// Monitor's health score card). Put white text and GlowRing inside.
// `className` sizes the card; `bodyClassName` lays out its content.
export function GlowCard({ className = '', bodyClassName = '', children }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-accent2-800 text-white shadow-glow ring-1 ring-white/25 dark:from-brand-800 dark:via-brand-900 dark:to-brand-950 dark:ring-white/10 ${className}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-sky-300/30 blur-3xl" />
      <div className={`relative ${bodyClassName}`}>{children}</div>
    </div>
  );
}

// White progress ring with a soft glow; `value` is 0..1
export function GlowRing({ value, size = 168, strokeWidth = 10, children }) {
  const glowId = useId();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  // Filter region padded past the ring so the blur fades out instead of clipping
  const pad = 32;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden="true">
        <defs>
          <filter id={glowId} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2}>
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="blur" />
            <feFlood floodColor="rgb(var(--brand-200))" floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={strokeWidth} />
        {clamped > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ffffff"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
            filter={`url(#${glowId})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

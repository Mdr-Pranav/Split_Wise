// iOS hero card: one solid system colour (blue, or red for tone="danger")
// with white content and a soft glow of the same colour around it.
// `className` sizes the card, `bodyClassName` lays out its content.
export function GlowCard({ className = '', bodyClassName = '', tone, children }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl text-white transition-colors duration-500 ease-ios ${
        tone === 'danger' ? 'glow-red bg-[#ff3b30] dark:bg-[#ff453a]' : 'glow-blue bg-[#007aff] dark:bg-[#0a84ff]'
      } ${className}`}
    >
      <div className={`relative ${bodyClassName}`}>{children}</div>
    </div>
  );
}

// White progress ring with a soft glow on a translucent track; `value` is 0..1
export function GlowRing({ value, size = 168, strokeWidth = 10, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={strokeWidth} />
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
            className="transition-[stroke-dashoffset] duration-1000 ease-ios [filter:drop-shadow(0_0_6px_rgba(255,255,255,0.6))]"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

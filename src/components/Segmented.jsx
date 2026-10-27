// Pill-shaped segmented control; size="sm" for tight cards
export default function Segmented({ options, value, onChange, className = '', label, size }) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex rounded-full bg-surface-card p-1 ring-1 ring-line/[0.08] backdrop-blur-xl ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-full font-medium transition-all duration-200 ${size === 'sm' ? 'px-2 py-1.5 text-[12px]' : 'px-3.5 py-1.5 text-[13px]'} ${
            value === o.value
              ? 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_6px_16px_-8px_rgb(var(--brand-500)/0.8)]'
              : 'text-slate-600 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

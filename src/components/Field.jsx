import Icon from './Icon';

const BOX =
  'relative flex min-w-0 items-center gap-2 rounded-2xl bg-surface-card py-1.5 ring-1 ring-[rgb(var(--line)/0.1)] transition-shadow duration-200 focus-within:ring-2 focus-within:ring-brand-500/60';

// Compact labelled box: tiny caption on top, the control underneath
export function FieldBox({ label, leading, children, className = '' }) {
  return (
    <label className={`${BOX} ${leading ? 'pl-1.5' : 'pl-3'} pr-3 ${className}`}>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>
        {children}
      </span>
    </label>
  );
}

// A FieldBox whose value is picked from a list: shows the chosen label, with
// a native select laid invisibly on top (so phones get their own picker)
export function PillSelect({ label, id, value, options, onChange, leading, className = '' }) {
  const current = options.find((o) => o.value === value);
  return (
    <label htmlFor={id} className={`${BOX} ${leading ? 'pl-1.5' : 'pl-3'} pr-7 ${className}`}>
      {leading}
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</span>
        <span className="block truncate text-[15px] font-semibold text-ink">{current?.short ?? current?.label}</span>
      </span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 rotate-90 text-slate-400" />
    </label>
  );
}

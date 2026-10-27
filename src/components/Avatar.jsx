const palettes = [
  'from-brand-400 to-accent2-700',
  'from-sky-400 to-blue-700',
  'from-violet-400 to-indigo-700',
  'from-cyan-400 to-teal-700',
  'from-fuchsia-400 to-purple-700',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-700',
  'from-rose-400 to-pink-700',
];

function pick(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

const sizes = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-[13px]',
  lg: 'h-11 w-11 text-[15px]',
};

export default function Avatar({ id, name = '?', size = 'md', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-2 ring-white/70 dark:ring-white/10 ${pick(id || name)} ${sizes[size]} ${className}`}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

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

export default function Avatar({ id, name = '?', size = 'md', className = '' }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: pick(id || name) }}
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-[var(--wall)] ${sizes[size]} ${className}`}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

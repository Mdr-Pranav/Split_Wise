// iOS toggle switch
export default function Switch({ checked, onChange, label, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[44px] flex-shrink-0 items-center rounded-full p-[2px] transition-colors duration-300 ease-ios ${
        checked ? 'bg-[#34c759]' : 'bg-[rgb(var(--line)/0.16)]'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`h-[22px] w-[22px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-300 ease-ios ${
          checked ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

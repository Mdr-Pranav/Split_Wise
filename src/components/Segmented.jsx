import { useLayoutEffect, useRef, useState } from 'react';

// iOS segmented control: a glassy thumb slides under the selected option.
// size="sm" for tight spots.
export default function Segmented({ options, value, onChange, className = '', label, size }) {
  const trackRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  const [ready, setReady] = useState(false);

  // Measure the selected option and move the thumb there, including when
  // the control resizes (labels with badges, responsive widths)
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const place = () => {
      const el = track.querySelector('[aria-selected="true"]');
      setThumb(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(track);
    track.querySelectorAll('[role="tab"]').forEach((el) => observer.observe(el));
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, options.length]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={label}
      className={`relative inline-flex rounded-full bg-[rgb(var(--line)/0.08)] p-[3px] ring-1 ring-[rgb(var(--line)/0.04)] backdrop-blur-xl ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-[3px] top-[3px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] dark:bg-[rgb(118_118_128/0.5)] dark:shadow-[0_3px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] ${
          ready ? 'transition-[transform,width] duration-500 ease-ios motion-reduce:transition-none' : ''
        }`}
        style={{ width: thumb?.width ?? 0, transform: `translateX(${(thumb?.left ?? 3) - 3}px)`, left: 3, opacity: thumb ? 1 : 0 }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-[1] flex-1 whitespace-nowrap rounded-full font-semibold transition-[color,transform] duration-300 active:scale-95 ${
            size === 'sm' ? 'px-2 py-1.5 text-[12px]' : 'px-3.5 py-1.5 text-[13px]'
          } ${value === o.value ? 'text-ink' : 'text-slate-500 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

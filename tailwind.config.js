/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Accent scale from CSS variables (set from Settings → Theme color)
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        accent2: {
          600: 'rgb(var(--accent2-600) / <alpha-value>)',
          700: 'rgb(var(--accent2-700) / <alpha-value>)',
          800: 'rgb(var(--accent2-800) / <alpha-value>)',
          950: 'rgb(var(--accent2-950) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          soft: 'rgb(var(--ink-soft) / <alpha-value>)',
        },
        'on-ink': 'rgb(var(--on-ink) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / calc(<alpha-value> * var(--surface-alpha)))',
          card: 'rgb(var(--card) / calc(<alpha-value> * var(--card-alpha)))',
          elevated: 'rgb(var(--elevated) / calc(<alpha-value> * var(--elevated-alpha)))',
          border: 'rgb(var(--border) / calc(<alpha-value> * var(--border-alpha)))',
        },
        slate: {
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
        },
        charcoal: {
          DEFAULT: '#24262b',
          light: '#3b3e45',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        display: ['Geist', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 1px 2px rgb(var(--brand-600) / 0.08), 0 24px 48px -20px rgb(var(--brand-500) / 0.5)',
        card: 'var(--card-shadow)',
        pill: '0 8px 30px -14px rgb(var(--brand-600) / 0.25)',
      },
    },
  },
  plugins: [],
};

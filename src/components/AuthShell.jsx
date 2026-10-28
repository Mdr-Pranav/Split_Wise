import { Link } from 'react-router-dom';
import Logo from './Logo';
import { APP_NAME } from '../lib/brand';
import ThemeToggle from './ThemeToggle';
import DemoBar from './DemoBar';

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div className="rounded-2xl bg-red-500/10 p-3 px-4 text-sm text-red-600 ring-1 ring-red-500/20">{children}</div>;
}

export default function AuthShell({ title, subtitle, tagline, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-5 sm:p-6">
      <ThemeToggle className="fixed right-4 top-4" />
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-10 inline-flex items-center gap-2">
            <Logo className="h-7 w-7" />
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-ink">{APP_NAME}</span>
          </Link>
          <h1 className="text-[38px] font-semibold leading-[1.02] text-ink sm:text-[48px]">
            <span className="block">{title}</span>
            {subtitle && <span className="block text-ink/30">{subtitle}</span>}
          </h1>
          {tagline && <p className="mt-4 text-[17px] text-slate-600">{tagline}</p>}
        </div>
        {children}
      </div>
      <DemoBar />
    </div>
  );
}

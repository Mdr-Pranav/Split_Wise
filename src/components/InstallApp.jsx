import { useState } from 'react';
import Logo from './Logo';
import Icon from './Icon';
import { useInstall } from '../hooks/useInstall';
import { APP_NAME } from '../lib/brand';

const DISMISS_KEY = 'splitzy-install-dismissed';

// iOS Safari's share glyph, so the steps match what people see
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 -translate-y-px" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

export function IosSteps() {
  return (
    <ol className="space-y-1 text-[13px] text-slate-600">
      <li>1. Tap <ShareGlyph /> <span className="font-medium text-ink">Share</span> in Safari’s toolbar</li>
      <li>2. Choose <span className="font-medium text-ink">Add to Home Screen</span></li>
      <li>3. Tap <span className="font-medium text-ink">Add</span>, and open {APP_NAME} from your home screen</li>
    </ol>
  );
}

// One-time, dismissible nudge on Home for phones that aren't using the app yet
export function InstallBanner() {
  const { canPrompt, iosSteps, install } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showSteps, setShowSteps] = useState(false);
  const phone = window.matchMedia('(max-width: 767px)').matches;
  if (dismissed || !phone || !(canPrompt || iosSteps)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // fine, it just shows again next time
    }
    setDismissed(true);
  };

  return (
    <div className="card !p-3.5">
      <div className="flex items-center gap-3">
        <Logo className="h-10 w-10 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">Get the {APP_NAME} app</p>
          <p className="text-[12px] text-slate-500">Full screen, one tap from your home screen.</p>
        </div>
        <button
          type="button"
          onClick={canPrompt ? install : () => setShowSteps((v) => !v)}
          className="btn-primary h-9 flex-shrink-0 !px-3.5 !text-[13px]"
        >
          {canPrompt ? 'Install' : 'How?'}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-ink">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      {showSteps && (
        <div className="mt-3 border-t border-surface-border pt-3">
          <IosSteps />
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from '../lib/pwa';
import { isIOS } from '../lib/upi';

// What install option this browser offers: a real prompt (Chrome, Edge,
// Android), manual steps (iPhone / iPad Safari), or nothing.
export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => onInstallChange(() => setTick((t) => t + 1)), []);

  const installed = isStandalone();
  return {
    installed,
    canPrompt: !installed && canPromptInstall(),
    iosSteps: !installed && isIOS(),
    install: promptInstall,
  };
}

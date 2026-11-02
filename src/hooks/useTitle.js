import { useEffect } from 'react';
import { APP_NAME } from '../lib/brand';

// Browser tab / app switcher title: "Goa Trip · Splitzy"
export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}

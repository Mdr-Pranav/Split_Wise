import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

function readTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('dark') !== (theme === 'dark')) {
      root.classList.toggle('dark', theme === 'dark');
      window.dispatchEvent(new Event('themechange'));
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#010206' : '#e3ecfe');
  }, [theme]);

  // Keep every toggle on the page in step (header button and Settings)
  useEffect(() => {
    const onSync = () => setTheme(readTheme());
    window.addEventListener('themechange', onSync);
    return () => window.removeEventListener('themechange', onSync);
  }, []);

  // Follow the OS setting until the user picks a theme explicitly
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        // ignore
      }
      setTheme(e.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}

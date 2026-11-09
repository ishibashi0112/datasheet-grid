'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // avoid hydration mismatch: render a neutral label on the server
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <button
      type="button"
      data-testid="mode-toggle"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent"
    >
      {mounted ? (resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode') : 'Theme'}
    </button>
  );
}

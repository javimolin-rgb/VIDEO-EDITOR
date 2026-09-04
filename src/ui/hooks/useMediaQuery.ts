import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query. SSR-safe and re-renders on change.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia !== 'function') return () => undefined;
      const mql = matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false),
    () => false,
  );
}

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

/** Breakpoints tuned for an editor: phones stack, tablets drop a dock, desktop is 3-up. */
export function useLayoutMode(): LayoutMode {
  const isMobile = useMediaQuery('(max-width: 759px)');
  const isTablet = useMediaQuery('(min-width: 760px) and (max-width: 1179px)');
  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

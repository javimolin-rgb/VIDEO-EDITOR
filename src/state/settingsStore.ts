/**
 * App-level preferences (spec §143, §144, §248). Persisted to localStorage,
 * applied to the document root as data-attributes + CSS variables. No
 * telemetry: there is nothing here that leaves the device.
 */

import { create } from 'zustand';

export type ThemeId = 'dark' | 'high-contrast' | 'light';
export type LanguageId = 'en' | 'es';

interface SettingsState {
  theme: ThemeId;
  /** Root font-size multiplier, 0.85–1.4. */
  uiScale: number;
  language: LanguageId;
  /** Follows the OS unless the user overrides it here. */
  reducedMotion: boolean | 'system';

  setTheme: (t: ThemeId) => void;
  setUiScale: (n: number) => void;
  setLanguage: (l: LanguageId) => void;
  setReducedMotion: (v: boolean | 'system') => void;
}

const KEY = 'aiv.settings';

interface Persisted {
  theme: ThemeId;
  uiScale: number;
  language: LanguageId;
  reducedMotion: boolean | 'system';
}

/** Match the browser's preferred language to one we ship; default English. */
function detectLanguage(): LanguageId {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      if (l?.toLowerCase().startsWith('es')) return 'es';
      if (l?.toLowerCase().startsWith('en')) return 'en';
    }
  } catch {
    /* no navigator */
  }
  return 'en';
}

function load(): Persisted {
  const fallback: Persisted = {
    theme: 'dark',
    uiScale: 1,
    language: detectLanguage(),
    reducedMotion: 'system',
  };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Persisted>) };
  } catch {
    return fallback;
  }
}

function persist(s: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export function prefersReducedMotion(setting: boolean | 'system'): boolean {
  if (setting !== 'system') return setting;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Push the current settings onto <html>. Call after every change. */
export function applySettings(s: Persisted): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.style.setProperty('--ui-scale', String(s.uiScale));
  root.style.fontSize = `${Math.round(16 * s.uiScale)}px`;
  root.lang = s.language;
  root.dataset.reducedMotion = String(prefersReducedMotion(s.reducedMotion));
}

const initial = load();
applySettings(initial);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,

  setTheme: (theme) => {
    set({ theme });
    const s = pick(get());
    persist(s);
    applySettings(s);
  },
  setUiScale: (uiScale) => {
    const clamped = Math.min(1.4, Math.max(0.85, uiScale));
    set({ uiScale: clamped });
    const s = pick(get());
    persist(s);
    applySettings(s);
  },
  setLanguage: (language) => {
    set({ language });
    const s = pick(get());
    persist(s);
    applySettings(s);
  },
  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    const s = pick(get());
    persist(s);
    applySettings(s);
  },
}));

function pick(s: SettingsState): Persisted {
  return { theme: s.theme, uiScale: s.uiScale, language: s.language, reducedMotion: s.reducedMotion };
}

/** Non-reactive helper for modules outside React. */
export function isReducedMotion(): boolean {
  return prefersReducedMotion(useSettingsStore.getState().reducedMotion);
}

/**
 * Minimal i18n (spec §144). English is the source; other languages fall back
 * per key. `t()` for non-React code, `useT()` for components (re-renders on a
 * language change).
 */

import { useSettingsStore, type LanguageId } from '@/state/settingsStore';
import { en, type MessageKey } from './en';
import { es } from './es';

const DICTS: Record<LanguageId, Partial<Record<MessageKey, string>>> = { en, es };

export function translate(lang: LanguageId, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Non-reactive translate using the current language. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(useSettingsStore.getState().language, key, vars);
}

/** Reactive translate for components. */
export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const lang = useSettingsStore((s) => s.language);
  return (key, vars) => translate(lang, key, vars);
}

export type { MessageKey };

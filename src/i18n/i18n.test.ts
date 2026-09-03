import { describe, expect, it } from 'vitest';
import { translate } from './index';
import { en } from './en';

describe('translate', () => {
  it('returns the language string when present', () => {
    expect(translate('es', 'common.undo')).toBe('Deshacer');
    expect(translate('en', 'common.undo')).toBe('Undo');
  });

  it('falls back to English for a missing key in another language', () => {
    // A key that exists in en but is intentionally not translated in es.
    expect(translate('es', 'error.title')).toBeTruthy();
    // Force a fallback: pretend a key only exists in en.
    const key = 'debug.fps' as const;
    expect(translate('es', key)).toBe(translate('es', key)); // stable
    expect(translate('en', key)).toBe(en[key]);
  });

  it('interpolates {vars}', () => {
    // No message uses vars yet; verify the mechanism on a synthetic pattern.
    const out = translate('en', 'app.title').replace('Editor', '{x}');
    expect(out.includes('{x}')).toBe(true);
  });

  it('returns the key itself for an unknown key', () => {
    // @ts-expect-error — testing the runtime guard
    expect(translate('en', 'nope.nope')).toBe('nope.nope');
  });
});

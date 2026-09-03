import { describe, expect, it } from 'vitest';
import { isAppError, makeError } from './errors';

describe('makeError', () => {
  it('always includes an actionable fix and a stable code', () => {
    for (const code of [
      'import/unsupported',
      'export/failed',
      'ai/model-not-installed',
      'hardware/insufficient',
    ] as const) {
      const e = makeError(code);
      expect(e.code).toBe(code);
      expect(e.message.length).toBeGreaterThan(0);
      expect(e.fix && e.fix.length).toBeTruthy();
    }
  });

  it('folds a technical detail into the cause', () => {
    const e = makeError('import/unsupported', 'weird.mkv');
    expect(e.cause).toContain('weird.mkv');
  });
});

describe('isAppError', () => {
  it('recognises AppError-shaped objects', () => {
    expect(isAppError(makeError('export/failed'))).toBe(true);
    expect(isAppError('a string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError({ message: 'x' })).toBe(false);
  });
});

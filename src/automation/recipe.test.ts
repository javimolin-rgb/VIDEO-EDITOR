import { describe, expect, it } from 'vitest';
import { STEP_DEFS, stepDef } from './types';

describe('recipe step catalogue', () => {
  it('every step has a resolvable def with a label', () => {
    for (const d of STEP_DEFS) {
      expect(stepDef(d.kind)).toBe(d);
      expect(d.label.length).toBeGreaterThan(0);
    }
  });

  it('select params carry an options list and a default within it', () => {
    for (const d of STEP_DEFS) {
      for (const p of d.params) {
        if (p.type === 'select') {
          expect(p.options && p.options.length).toBeTruthy();
          expect(p.options).toContain(p.default);
        }
      }
    }
  });

  it('marks the transcription step as needing a model', () => {
    expect(stepDef('generate-captions').needsModel).toBe(true);
    expect(stepDef('remove-silences').needsModel).toBeFalsy();
  });
});

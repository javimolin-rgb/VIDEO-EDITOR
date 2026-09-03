import { describe, expect, it } from 'vitest';
import { EFFECT_DEFS, EFFECT_LIST, clampEffectParam, createEffect } from './registry';

describe('effects registry', () => {
  it('creates an instance with default params', () => {
    const fx = createEffect('vignette');
    expect(fx.type).toBe('vignette');
    expect(fx.enabled).toBe(true);
    expect(fx.params.amount).toBe(EFFECT_DEFS.vignette.params.find((p) => p.key === 'amount')!.default);
  });

  it('clamps params to declared range', () => {
    expect(clampEffectParam('gaussian-blur', 'radius', 999)).toBe(40);
    expect(clampEffectParam('gaussian-blur', 'radius', -5)).toBe(0);
    expect(clampEffectParam('hue-rotate', 'angle', 400)).toBe(180);
  });

  it('every catalogue entry has at least one param and a known render mode', () => {
    for (const def of EFFECT_LIST) {
      expect(def.params.length).toBeGreaterThan(0);
      expect(['filter', 'overlay']).toContain(def.render);
    }
  });
});

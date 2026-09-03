import { describe, expect, it } from 'vitest';
import { autoColorGrade, NEUTRAL_TARGET } from './autocolor';
import type { LookStats } from '@/ai/style';

const look = (over: Partial<LookStats>): LookStats => ({
  luma: 0.5,
  contrast: 0.17,
  saturation: 0.34,
  r: 0.5,
  g: 0.5,
  b: 0.5,
  ...over,
});

describe('autoColorGrade', () => {
  it('lifts a dark clip and drops a bright one', () => {
    expect(autoColorGrade(look({ luma: 0.2 })).exposure).toBeGreaterThan(0);
    expect(autoColorGrade(look({ luma: 0.85 })).exposure).toBeLessThan(0);
  });

  it('does almost nothing to an already-neutral clip', () => {
    const g = autoColorGrade(NEUTRAL_TARGET, 0.6);
    expect(Math.abs(g.exposure)).toBeLessThan(0.05);
    expect(Math.abs(g.contrast)).toBeLessThan(0.05);
  });

  it('is enabled and scales with strength', () => {
    const full = autoColorGrade(look({ luma: 0.2 }), 1).exposure;
    const half = autoColorGrade(look({ luma: 0.2 }), 0.5).exposure;
    expect(half).toBeCloseTo(full / 2, 4);
    expect(autoColorGrade(look({ luma: 0.2 })).enabled).toBe(true);
  });
});

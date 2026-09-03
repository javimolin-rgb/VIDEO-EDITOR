import { describe, expect, it } from 'vitest';
import { ease, evaluateKeyframes, currentParamValue } from './keyframes';
import { IDENTITY_TRANSFORM, NEUTRAL_COLOR, type Clip } from './types';

describe('ease', () => {
  it('clamps and maps endpoints', () => {
    expect(ease('linear', -1)).toBe(0);
    expect(ease('linear', 2)).toBe(1);
    expect(ease('ease-in', 0)).toBe(0);
    expect(ease('ease-out', 1)).toBe(1);
    expect(ease('hold', 0.9)).toBe(0);
  });
});

describe('evaluateKeyframes', () => {
  const kfs = [
    { frame: 0, value: 0, easing: 'linear' as const },
    { frame: 10, value: 100, easing: 'linear' as const },
  ];

  it('returns null with no keyframes', () => {
    expect(evaluateKeyframes(undefined, 5)).toBeNull();
    expect(evaluateKeyframes([], 5)).toBeNull();
  });

  it('clamps outside the range', () => {
    expect(evaluateKeyframes(kfs, -3)).toBe(0);
    expect(evaluateKeyframes(kfs, 99)).toBe(100);
  });

  it('interpolates linearly between keyframes', () => {
    expect(evaluateKeyframes(kfs, 5)).toBe(50);
    expect(evaluateKeyframes(kfs, 2.5)).toBe(25);
  });

  it('applies the segment easing of the left keyframe', () => {
    const eased = [
      { frame: 0, value: 0, easing: 'ease-in' as const },
      { frame: 10, value: 100, easing: 'linear' as const },
    ];
    // ease-in at t=0.5 -> 0.25 -> value 25
    expect(evaluateKeyframes(eased, 5)).toBeCloseTo(25);
  });
});

describe('currentParamValue', () => {
  it('reads base fields', () => {
    const clip = {
      opacity: 0.5,
      gain: 1.2,
      transform: { ...IDENTITY_TRANSFORM, x: 40, scale: 2 },
      color: { ...NEUTRAL_COLOR, exposure: 0.3 },
    } as Clip;
    expect(currentParamValue(clip, 'opacity')).toBe(0.5);
    expect(currentParamValue(clip, 'gain')).toBe(1.2);
    expect(currentParamValue(clip, 'transform.x')).toBe(40);
    expect(currentParamValue(clip, 'transform.scale')).toBe(2);
    expect(currentParamValue(clip, 'color.exposure')).toBe(0.3);
  });
});

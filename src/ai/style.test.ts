import { describe, expect, it } from 'vitest';
import { averageStats, lookDistance, matchLook, statsFromImageData } from './style';

/** Build a flat RGBA buffer of a solid colour. */
function solid(r: number, g: number, b: number, px = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('statsFromImageData', () => {
  it('measures luma and near-zero contrast for a flat frame', () => {
    const s = statsFromImageData(solid(128, 128, 128));
    expect(s.luma).toBeCloseTo(0.5, 1);
    expect(s.contrast).toBeCloseTo(0, 3);
    expect(s.saturation).toBeCloseTo(0, 3);
  });

  it('detects a warm cast', () => {
    const warm = statsFromImageData(solid(220, 150, 90));
    expect(warm.r).toBeGreaterThan(warm.b);
  });
});

describe('matchLook', () => {
  it('brightens a dark source toward a bright target', () => {
    const dark = statsFromImageData(solid(40, 40, 40));
    const bright = statsFromImageData(solid(200, 200, 200));
    const grade = matchLook(dark, bright, 1);
    expect(grade.enabled).toBe(true);
    expect(grade.exposure).toBeGreaterThan(0.3);
  });

  it('pushes warm when the target is warmer', () => {
    const neutral = statsFromImageData(solid(128, 128, 128));
    const warm = statsFromImageData(solid(200, 140, 90));
    expect(matchLook(neutral, warm, 1).temperature).toBeGreaterThan(0);
  });

  it('scales the correction by strength', () => {
    const a = statsFromImageData(solid(40, 40, 40));
    const b = statsFromImageData(solid(200, 200, 200));
    const full = matchLook(a, b, 1).exposure;
    const half = matchLook(a, b, 0.5).exposure;
    expect(half).toBeCloseTo(full / 2, 5);
  });
});

describe('lookDistance / averageStats', () => {
  it('is ~0 for identical looks and larger when different', () => {
    const g = statsFromImageData(solid(128, 128, 128));
    const w = statsFromImageData(solid(220, 150, 90));
    expect(lookDistance(g, g)).toBeCloseTo(0, 5);
    expect(lookDistance(g, w)).toBeGreaterThan(lookDistance(g, g));
  });

  it('averages a list of stats', () => {
    const a = statsFromImageData(solid(0, 0, 0));
    const b = statsFromImageData(solid(255, 255, 255));
    expect(averageStats([a, b]).luma).toBeCloseTo(0.5, 2);
  });
});

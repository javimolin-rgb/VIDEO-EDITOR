import { describe, expect, it } from 'vitest';
import { gainForTarget, rmsDb } from './normalize';

function sine(n: number, amp: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.sin(i * 0.3) * amp;
  return a;
}

describe('rmsDb', () => {
  it('measures a quieter signal as lower dBFS', () => {
    const loud = rmsDb(sine(4000, 0.5));
    const quiet = rmsDb(sine(4000, 0.05));
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThan(0);
  });

  it('returns -Infinity for silence', () => {
    expect(rmsDb(new Float32Array(1000))).toBe(-Infinity);
  });
});

describe('gainForTarget', () => {
  it('boosts a quiet mix and attenuates a loud one', () => {
    expect(gainForTarget(-30, -16)).toBeGreaterThan(1);
    expect(gainForTarget(-6, -16)).toBeLessThan(1);
    expect(gainForTarget(-16, -16)).toBeCloseTo(1, 5);
  });

  it('clamps extreme corrections', () => {
    expect(gainForTarget(-90, -16, 18)).toBeCloseTo(Math.pow(10, 18 / 20), 3);
    expect(gainForTarget(Number.NEGATIVE_INFINITY, -16)).toBe(1);
  });
});

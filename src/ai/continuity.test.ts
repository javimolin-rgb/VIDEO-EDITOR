import { describe, expect, it } from 'vitest';
import { analyzeSequence, pairContinuity } from './continuity';
import type { LookStats } from './style';

const look = (luma: number, r = 0.5, g = 0.5, b = 0.5): LookStats => ({
  luma,
  contrast: 0.15,
  saturation: 0.3,
  r,
  g,
  b,
});

describe('pairContinuity', () => {
  it('is 1 for identical looks and lower for divergent ones', () => {
    expect(pairContinuity(look(0.5), look(0.5))).toBeCloseTo(1, 5);
    expect(pairContinuity(look(0.1, 0.1, 0.1, 0.1), look(0.9, 0.9, 0.9, 0.9))).toBeLessThan(0.6);
  });

  it('does not penalise unknown looks', () => {
    expect(pairContinuity(null, look(0.5))).toBe(1);
  });
});

describe('analyzeSequence', () => {
  it('scores each adjacent pair and flags weak cuts', () => {
    const report = analyzeSequence([
      { id: 'a', label: 'a', look: look(0.5) },
      { id: 'b', label: 'b', look: look(0.52) },
      { id: 'c', label: 'c', look: look(0.05, 0.9, 0.1, 0.1) },
    ]);
    expect(report.pairs).toHaveLength(2);
    expect(report.pairs[0]!.score).toBeGreaterThan(0.9);
    expect(report.pairs[1]!.score).toBeLessThan(0.6);
    expect(report.weak).toContain('b→c');
    expect(report.overall).toBeLessThan(report.pairs[0]!.score);
  });

  it('is seamless for a single item', () => {
    expect(analyzeSequence([{ id: 'a', label: 'a', look: look(0.5) }]).overall).toBe(1);
  });
});

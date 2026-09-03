import { describe, expect, it } from 'vitest';
import { extractVisualConcepts } from './broll';

describe('extractVisualConcepts', () => {
  it('pulls concrete noun phrases, drops stopwords', () => {
    const c = extractVisualConcepts('The rugged coastline of northern Chile has changed dramatically.');
    expect(c.join(' ')).toMatch(/coastline|chile|rugged/);
    expect(c).not.toContain('the');
    expect(c).not.toContain('has');
  });

  it('prefers longer phrases and limits the count', () => {
    const c = extractVisualConcepts(
      'A red vintage sports car speeds along a mountain road at sunset over the valley',
      3,
    );
    expect(c.length).toBeLessThanOrEqual(3);
    expect(c[0]!.split(' ').length).toBeGreaterThanOrEqual(c[c.length - 1]!.split(' ').length);
  });

  it('returns nothing for a line of only stopwords', () => {
    expect(extractVisualConcepts('and it is so that we can')).toHaveLength(0);
  });
});

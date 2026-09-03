import { describe, expect, it } from 'vitest';
import { getFps, markFrame } from './fps';

describe('fps meter', () => {
  it('is 0 before enough frames', () => {
    expect(getFps()).toBe(0);
  });

  it('estimates a rate after marking several frames', async () => {
    for (let i = 0; i < 10; i++) {
      markFrame();
      await new Promise((r) => setTimeout(r, 10));
    }
    const fps = getFps();
    expect(fps).toBeGreaterThan(0);
    expect(fps).toBeLessThan(1000);
  });
});

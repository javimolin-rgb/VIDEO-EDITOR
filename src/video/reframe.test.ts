import { describe, expect, it } from 'vitest';
import { salientCenter } from './reframe';

/** Grid with a bright square (high edge energy) in a given quadrant. */
function frameWithBox(w: number, h: number, bx: number, by: number, bs: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255; // opaque black
  for (let y = by; y < by + bs; y++) {
    for (let x = bx; x < bx + bs; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
  }
  return data;
}

describe('salientCenter', () => {
  it('locks onto the edge-dense region', () => {
    const w = 48;
    const h = 27;
    const left = salientCenter(frameWithBox(w, h, 4, 10, 6), w, h);
    expect(left.x).toBeLessThan(0.4);

    const right = salientCenter(frameWithBox(w, h, 36, 10, 6), w, h);
    expect(right.x).toBeGreaterThan(0.6);
  });

  it('defaults to centre for a flat frame', () => {
    const w = 48;
    const h = 27;
    const flat = new Uint8ClampedArray(w * h * 4).fill(128);
    const c = salientCenter(flat, w, h);
    expect(c.x).toBeCloseTo(0.5, 5);
    expect(c.y).toBeCloseTo(0.5, 5);
  });
});

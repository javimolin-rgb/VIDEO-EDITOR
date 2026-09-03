/**
 * Style / look extraction + matching (spec §64, §185, §226). Samples a few
 * frames of a clip, measures luma / contrast / saturation / white balance, and
 * derives a `ColorGrade` that pushes a source clip toward a reference. Pure
 * measurement + arithmetic — no model, deterministic, testable.
 */

import type { ColorGrade } from '@/domain/types';
import { NEUTRAL_COLOR } from '@/domain/types';

export interface LookStats {
  /** Mean luma, 0..1. */
  luma: number;
  /** RMS contrast around the mean, 0..~0.5. */
  contrast: number;
  /** Mean HSV-ish saturation, 0..1. */
  saturation: number;
  /** Mean channel values, 0..1. */
  r: number;
  g: number;
  b: number;
}

export function statsFromImageData(data: Uint8ClampedArray): LookStats {
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sl = 0;
  let ss = 0;
  const n = data.length / 4;
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    sr += r;
    sg += g;
    sb += b;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    sl += l;
    lumas.push(l);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    ss += max === 0 ? 0 : (max - min) / max;
  }
  const luma = sl / n;
  let variance = 0;
  for (const l of lumas) variance += (l - luma) ** 2;
  return {
    luma,
    contrast: Math.sqrt(variance / n),
    saturation: ss / n,
    r: sr / n,
    g: sg / n,
    b: sb / n,
  };
}

/** Average several frame stats into one. */
export function averageStats(all: LookStats[]): LookStats {
  if (all.length === 0) return { luma: 0.5, contrast: 0.15, saturation: 0.3, r: 0.5, g: 0.5, b: 0.5 };
  const acc = all.reduce(
    (a, s) => ({
      luma: a.luma + s.luma,
      contrast: a.contrast + s.contrast,
      saturation: a.saturation + s.saturation,
      r: a.r + s.r,
      g: a.g + s.g,
      b: a.b + s.b,
    }),
    { luma: 0, contrast: 0, saturation: 0, r: 0, g: 0, b: 0 },
  );
  const k = all.length;
  return {
    luma: acc.luma / k,
    contrast: acc.contrast / k,
    saturation: acc.saturation / k,
    r: acc.r / k,
    g: acc.g / k,
    b: acc.b / k,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A `ColorGrade` that nudges `source` toward `target`. `strength` 0..1 scales
 * the whole correction (spec §64 slider).
 */
export function matchLook(source: LookStats, target: LookStats, strength = 1): ColorGrade {
  const s = clamp(strength, 0, 1);

  const exposure = clamp((target.luma - source.luma) * 1.6, -1, 1) * s;
  const contrast = clamp((target.contrast - source.contrast) * 3.2, -1, 1) * s;
  const saturation = clamp((target.saturation - source.saturation) * 2.2, -1, 1) * s;

  // Warm/cool from the red-vs-blue balance; tint from green.
  const srcWb = source.r - source.b;
  const tgtWb = target.r - target.b;
  const temperature = clamp((tgtWb - srcWb) * 2.5, -1, 1) * s;
  const srcTint = source.g - (source.r + source.b) / 2;
  const tgtTint = target.g - (target.r + target.b) / 2;
  const tint = clamp((tgtTint - srcTint) * 2.5, -1, 1) * s;

  return {
    ...NEUTRAL_COLOR,
    enabled: true,
    exposure,
    contrast,
    saturation,
    temperature,
    tint,
  };
}

/** 0 (identical) .. 1 (very different) — palette + luma distance. */
export function lookDistance(a: LookStats, b: LookStats): number {
  const d =
    Math.abs(a.luma - b.luma) * 1.4 +
    Math.abs(a.contrast - b.contrast) * 1.2 +
    Math.abs(a.saturation - b.saturation) * 1.0 +
    (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) * 0.6;
  return clamp(d, 0, 1);
}

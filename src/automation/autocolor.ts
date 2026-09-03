/**
 * Automatic colour correction (spec §63, §226). Nudges a clip toward a
 * neutral, well-exposed target using the same look-match maths as shot
 * matching.
 */

import type { ColorGrade } from '@/domain/types';
import { matchLook, type LookStats } from '@/ai/style';

/** A pleasant neutral: mid luma, moderate contrast, gentle saturation. */
export const NEUTRAL_TARGET: LookStats = {
  luma: 0.48,
  contrast: 0.17,
  saturation: 0.34,
  r: 0.5,
  g: 0.5,
  b: 0.5,
};

export function autoColorGrade(source: LookStats, strength = 0.6): ColorGrade {
  return matchLook(source, NEUTRAL_TARGET, strength);
}

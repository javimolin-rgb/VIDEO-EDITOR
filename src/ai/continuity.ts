/**
 * Continuity engine (spec §40). Scores how well consecutive shots match on
 * palette / exposure / contrast so the UI can flag jarring cuts and the
 * storyboard generator can carry a look forward. Local, deterministic.
 */

import { lookDistance, type LookStats } from './style';

export interface SequenceItem {
  id: string;
  label: string;
  look: LookStats | null;
}

export interface ContinuityPair {
  fromId: string;
  toId: string;
  /** 0 (jarring) .. 1 (seamless). */
  score: number;
}

export interface ContinuityReport {
  pairs: ContinuityPair[];
  /** Mean of all pair scores, 0..1. */
  overall: number;
  /** Ids of pairs below the warn threshold. */
  weak: string[];
}

const WARN_BELOW = 0.55;

export function pairContinuity(a: LookStats | null, b: LookStats | null): number {
  if (!a || !b) return 1; // unknown → don't penalise
  return Math.max(0, 1 - lookDistance(a, b));
}

export function analyzeSequence(items: SequenceItem[]): ContinuityReport {
  const pairs: ContinuityPair[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const from = items[i]!;
    const to = items[i + 1]!;
    pairs.push({ fromId: from.id, toId: to.id, score: pairContinuity(from.look, to.look) });
  }
  const overall = pairs.length ? pairs.reduce((s, p) => s + p.score, 0) / pairs.length : 1;
  const weak = pairs.filter((p) => p.score < WARN_BELOW).map((p) => `${p.fromId}→${p.toId}`);
  return { pairs, overall, weak };
}

/**
 * Local project search (spec §16, §174). Text-based, runs entirely on the
 * loaded project — asset names, markers, caption cues and (when present) the
 * transcript. Embedding / semantic visual search is a later addition behind an
 * opt-in model download; the API shape here is ready for it.
 */

import { framesToSeconds } from '@/lib/time';
import type { Asset, VideoProject } from '@/domain/types';
import type { TranscriptResult } from './local/types';

export type SearchHitKind = 'asset' | 'marker' | 'caption' | 'transcript';

export interface SearchHit {
  kind: SearchHitKind;
  label: string;
  score: number;
  /** For time-based hits. */
  frame?: number;
  /** For asset hits. */
  assetId?: string;
}

function scoreText(haystack: string, tokens: string[]): number {
  const h = haystack.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (h.includes(t)) score += t.length >= 4 ? 2 : 1;
    if (h.split(/\s+/).includes(t)) score += 1;
  }
  return score;
}

export function searchProject(
  project: VideoProject,
  assets: Asset[],
  transcript: TranscriptResult | null,
  query: string,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = q.split(/\s+/);
  const tb = project.timeline.timebase;
  const hits: SearchHit[] = [];

  for (const a of assets) {
    const s = scoreText(`${a.name} ${a.kind} ${a.role} ${a.tags.join(' ')}`, tokens);
    if (s > 0) hits.push({ kind: 'asset', label: a.name, score: s, assetId: a.id });
  }

  for (const m of project.timeline.markers) {
    const s = scoreText(m.label, tokens);
    if (s > 0) hits.push({ kind: 'marker', label: `${m.label}`, score: s, frame: m.frame });
  }

  for (const cue of project.timeline.captionLayer.cues) {
    const s = scoreText(cue.text, tokens);
    if (s > 0) {
      hits.push({
        kind: 'caption',
        label: cue.text,
        score: s,
        frame: cue.startFrame,
      });
    }
  }

  if (transcript) {
    for (const seg of transcript.segments) {
      const s = scoreText(seg.text, tokens);
      if (s > 0) {
        hits.push({
          kind: 'transcript',
          label: seg.text.length > 90 ? seg.text.slice(0, 90) + '…' : seg.text,
          score: s + 0.5,
          frame: Math.round(seg.startSec * tb.fps),
        });
      }
    }
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((h) => ({ ...h }));
}

export function hitTimecodeSec(hit: SearchHit, project: VideoProject): number | null {
  if (hit.frame == null) return null;
  return framesToSeconds(hit.frame, project.timeline.timebase);
}

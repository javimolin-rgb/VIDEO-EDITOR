/**
 * Deterministic planners (spec §44, §131, §80). Produce a `DirectorPlan` from
 * a creative brief or a script. No model — a readable, editable plan the user
 * approves before anything runs (spec §194).
 */

import { newId } from '@/lib/id';
import type { CreativeBrief, DirectorPlan, DraftShot, PlanStep, PlanStepKind } from './types';
import { PLATFORM_ASPECT } from './types';

const CAMERA_CYCLE = ['dolly-in', 'pan-right', 'orbit', 'static', 'crane-up', 'dolly-out', 'pan-left'];

function step(kind: PlanStepKind, title: string, detail: string, destructive: boolean): PlanStep {
  return { id: newId('action'), kind, title, detail, destructive, status: 'pending' };
}

function clampDur(sec: number): number {
  return Math.max(2, Math.min(10, Math.round(sec)));
}

// ─── Brief → plan ───────────────────────────────────────────────────────────

export function planFromBrief(brief: CreativeBrief): DirectorPlan {
  const n = Math.max(3, brief.shotCount);
  const per = clampDur(brief.durationSec / n);

  const shots: DraftShot[] = [];
  for (let i = 0; i < n; i++) {
    const role =
      i === 0 ? 'opening hook' : i === n - 1 ? 'closing shot with product hero framing' : `product beat ${i}`;
    shots.push({
      title: i === 0 ? 'Hook' : i === n - 1 ? 'Close / CTA' : `Beat ${i}`,
      prompt: `${brief.product}, ${role}, ${brief.style} style, ${brief.mood}`,
      camera: CAMERA_CYCLE[i % CAMERA_CYCLE.length]!,
      style: brief.style,
      durationSec: per,
      carryContinuity: i > 0,
    });
  }

  const primary = PLATFORM_ASPECT[brief.platform];
  const exportAspects = primary === '16:9' ? ['16:9', '9:16', '1:1'] : [primary, '16:9', '1:1'];

  return {
    id: newId('action'),
    goal: `${brief.durationSec}s ${brief.style} spot for ${brief.product} (${brief.platform})`,
    createdAt: Date.now(),
    shots,
    captionLines: [],
    exportAspects,
    steps: [
      step('analyze', 'Analyse references & brand', 'Sample the reference board and brand colours for a style profile.', false),
      step('build-storyboard', `Build a ${n}-shot storyboard`, 'Create the shots above in the storyboard.', true),
      step('generate-shots', 'Generate every shot', 'Run each shot through the generation queue; carry continuity forward.', true),
      step('qc-retry', 'Quality check & regenerate weak shots', 'Re-generate any shot scoring below 55%.', true),
      step('assemble', 'Assemble the timeline', 'Place the shots end to end on a video track.', true),
      step('color-match', 'Match colour across shots', 'Grade every shot toward the opening shot.', true),
      step('music', 'Add music', 'Requires a local music model — not available in this build.', false),
      step('sound-design', 'Add sound design', 'Requires a local SFX model — not available in this build.', false),
      step('export-variants', `Export ${exportAspects.join(' / ')}`, 'Render one file per target aspect ratio.', true),
    ],
  };
}

// ─── Script → plan ──────────────────────────────────────────────────────────

export function splitScriptBeats(script: string): string[] {
  const cleaned = script.replace(/[ \t]+/g, ' ').trim();
  if (!cleaned) return [];

  // Sentence-level split; merge only very short fragments into the next.
  const sentences = (cleaned.match(/[^.!?\n]+[.!?]?/g) ?? [cleaned])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const isFragment = (t: string) =>
    t.split(/\s+/).length < 4 && t.replace(/[^\p{L}\p{N}]/gu, '').length < 18;

  const beats: string[] = [];
  let carry = '';
  for (const s of sentences) {
    const merged = carry ? `${carry} ${s}` : s;
    if (isFragment(merged)) {
      carry = merged;
    } else {
      beats.push(merged);
      carry = '';
    }
  }
  if (carry) {
    if (beats.length) beats[beats.length - 1] = `${beats[beats.length - 1]} ${carry}`.trim();
    else beats.push(carry);
  }
  return beats.slice(0, 12);
}

const CTA_RE = /\b(shop|buy|get|try|visit|subscribe|link in bio|order|download|sign up|learn more)\b/i;

export function planFromScript(script: string, style = 'cinematic'): DirectorPlan {
  const beats = splitScriptBeats(script);
  const shots: DraftShot[] = beats.map((beat, i) => {
    const words = beat.split(/\s+/).length;
    return {
      title: i === 0 ? 'Hook' : CTA_RE.test(beat) ? 'CTA' : `Scene ${i + 1}`,
      prompt: `${beat} — ${style} visual treatment, natural light`,
      camera: CAMERA_CYCLE[i % CAMERA_CYCLE.length]!,
      style,
      durationSec: clampDur(words / 2.6),
      carryContinuity: i > 0,
    };
  });

  return {
    id: newId('action'),
    goal: `Script → video · ${beats.length} scenes`,
    createdAt: Date.now(),
    shots,
    captionLines: beats,
    exportAspects: ['9:16', '16:9'],
    steps: [
      step('analyze', 'Analyse references', 'Sample any reference clips for a style profile.', false),
      step('build-storyboard', `Build a ${beats.length}-scene storyboard`, 'One shot per script beat.', true),
      step('generate-shots', 'Generate every scene', 'Run each scene through the generation queue.', true),
      step('qc-retry', 'Quality check & regenerate weak scenes', 'Re-generate any scene below 55%.', true),
      step('assemble', 'Assemble the timeline', 'Place the scenes in script order.', true),
      step('captions', 'Lay down captions from the script', 'Add a styled caption cue per scene, timed to its clip.', true),
      step('broll', 'Add B-roll', 'Pull visual concepts from each line; use your media if it matches, else generate.', true),
      step('color-match', 'Match colour across scenes', 'Grade every scene toward the first.', true),
      step('music', 'Add music', 'Requires a local music model — not available in this build.', false),
      step('export-variants', 'Export 9:16 / 16:9', 'Render one file per target aspect ratio.', true),
    ],
  };
}

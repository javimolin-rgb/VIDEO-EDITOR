/**
 * Prompt engine (spec §132, §133, §134). Turns free text into a **structured**
 * prompt and a provider request. Heuristic only — no LLM — and it always
 * preserves the user's original text (spec §133: show original + enhanced,
 * allow editing).
 */

import type { GenerationRequestBase, ReferenceInput } from '@/ai/provider';

export type CameraMove =
  | 'static'
  | 'dolly-in'
  | 'dolly-out'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'orbit'
  | 'crane-up'
  | 'handheld';

export type MotionLevel = 'low' | 'medium' | 'high';

export type StyleId =
  | 'cinematic'
  | 'editorial'
  | 'fashion'
  | 'documentary'
  | 'commercial'
  | 'realistic'
  | 'analog'
  | 'minimal'
  | 'music-video'
  | 'architectural';

export interface StructuredPrompt {
  subject: string;
  action: string;
  environment: string;
  camera: CameraMove;
  lens: string;
  lighting: string;
  composition: string;
  style: StyleId;
  colorMood: string;
  motion: MotionLevel;
  audio: string;
  /** Negative / preserve constraints. */
  constraints: string[];
}

export const DEFAULT_STRUCTURED: StructuredPrompt = {
  subject: '',
  action: '',
  environment: '',
  camera: 'dolly-in',
  lens: '35mm',
  lighting: 'soft natural light',
  composition: 'balanced, rule of thirds',
  style: 'cinematic',
  colorMood: 'warm neutral',
  motion: 'medium',
  audio: '',
  constraints: [],
};

const CAMERA_WORDS: Array<[RegExp, CameraMove]> = [
  [/\b(dolly|push|move) ?in|zoom in\b/i, 'dolly-in'],
  [/\b(dolly|pull|move) ?out|zoom out\b/i, 'dolly-out'],
  [/\bpan(ning)? left\b/i, 'pan-left'],
  [/\bpan(ning)? right\b/i, 'pan-right'],
  [/\btilt(ing)? up\b/i, 'tilt-up'],
  [/\btilt(ing)? down\b/i, 'tilt-down'],
  [/\borbit|arc shot|revolve\b/i, 'orbit'],
  [/\bcrane|jib|rising\b/i, 'crane-up'],
  [/\bhandheld|shaky|documentary cam\b/i, 'handheld'],
  [/\bstatic|locked ?off|tripod|still\b/i, 'static'],
];

const STYLE_WORDS: Array<[RegExp, StyleId]> = [
  [/\bfashion|editorial runway|lookbook\b/i, 'fashion'],
  [/\beditorial\b/i, 'editorial'],
  [/\bdocumentary|verite\b/i, 'documentary'],
  [/\bcommercial|advert|product hero\b/i, 'commercial'],
  [/\banalog|film grain|super ?8|vhs|vintage\b/i, 'analog'],
  [/\bminimal(ist)?\b/i, 'minimal'],
  [/\bmusic video\b/i, 'music-video'],
  [/\barchitectur(e|al)|interior|building\b/i, 'architectural'],
  [/\brealistic|photoreal\b/i, 'realistic'],
  [/\bcinematic|film ?look|anamorphic\b/i, 'cinematic'],
];

function detectMotion(text: string): MotionLevel {
  if (/\b(fast|energetic|frenetic|rapid|whip|dynamic)\b/i.test(text)) return 'high';
  if (/\b(slow|gentle|subtle|calm|still|elegant|slow ?motion)\b/i.test(text)) return 'low';
  return 'medium';
}

function detectColor(text: string): string {
  const named = text.match(
    /\b(warm|cool|golden|amber|teal|cyan|magenta|crimson|emerald|indigo|monochrome|pastel|neon|sepia|desaturated|vivid|muted)\b/i,
  );
  if (named) return named[0].toLowerCase();
  if (/\b(sunset|golden hour|late afternoon|firelight)\b/i.test(text)) return 'warm golden';
  if (/\b(overcast|blue hour|moonlight|night)\b/i.test(text)) return 'cool blue';
  return 'warm neutral';
}

function detectConstraints(text: string): string[] {
  const out: string[] = [];
  const noMatch = text.match(/\bno ([a-z ]{3,40})/gi);
  if (noMatch) out.push(...noMatch.map((m) => m.trim()));
  if (/\bpreserve (the )?face|keep identity\b/i.test(text)) out.push('preserve face / identity');
  if (/\bpreserve (the )?product|product lock\b/i.test(text)) out.push('preserve product shape & logo');
  if (/\bno text|no captions\b/i.test(text)) out.push('no text');
  return [...new Set(out)];
}

/** Expand free text into a structured prompt without discarding user intent. */
export function enhance(raw: string): {
  original: string;
  structured: StructuredPrompt;
  enhanced: string;
} {
  const text = raw.trim();
  const camera = CAMERA_WORDS.find(([re]) => re.test(text))?.[1] ?? DEFAULT_STRUCTURED.camera;
  const style = STYLE_WORDS.find(([re]) => re.test(text))?.[1] ?? DEFAULT_STRUCTURED.style;
  const motion = detectMotion(text);
  const colorMood = detectColor(text);
  const constraints = detectConstraints(text);

  // The user's line stands as the subject/action; the rest is scaffolding.
  const structured: StructuredPrompt = {
    ...DEFAULT_STRUCTURED,
    subject: text || 'an abstract scene',
    action: '',
    environment: '',
    camera,
    style,
    motion,
    colorMood,
    constraints,
    lighting:
      style === 'fashion' || style === 'editorial'
        ? 'directional editorial light, soft key'
        : style === 'documentary'
          ? 'available light'
          : 'soft natural light',
  };

  return { original: raw, structured, enhanced: composePrompt(structured) };
}

/** Flatten a structured prompt into a single model-facing string. */
export function composePrompt(s: StructuredPrompt): string {
  const parts = [
    s.subject,
    s.action,
    s.environment,
    `${s.camera.replace('-', ' ')} camera`,
    s.lens,
    s.lighting,
    s.composition,
    `${s.style} style`,
    `${s.colorMood} palette`,
    `${s.motion} motion`,
    s.audio && `audio: ${s.audio}`,
  ].filter(Boolean);
  return parts.join(', ');
}

export interface BuildRequestInput {
  structured: StructuredPrompt;
  durationSec: number;
  fps: number;
  resolution: { width: number; height: number };
  aspectRatio: string;
  seed: number | null;
  references: ReferenceInput[];
  advanced?: Record<string, number | string | boolean>;
}

export function buildRequest(projectId: string, input: BuildRequestInput): GenerationRequestBase {
  return {
    projectId,
    prompt: composePrompt(input.structured),
    negativePrompt: input.structured.constraints.join(', ') || undefined,
    durationSec: input.durationSec,
    fps: input.fps,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    seed: input.seed,
    references: input.references,
    advanced: input.advanced,
  };
}

/**
 * Automation engine (spec §87, §141). A **recipe** is an ordered list of typed
 * steps that run against the project. Recipes are stored globally (not per
 * project) so they are reusable, and can be triggered manually or when media
 * is imported.
 */

import type { CaptionStyle } from '@/domain/types';

export type RecipeTrigger = 'manual' | 'on-import';

export type RecipeStepKind =
  | 'remove-silences'
  | 'detect-shots'
  | 'generate-captions'
  | 'caption-style'
  | 'normalize-audio'
  | 'auto-color'
  | 'auto-reframe'
  | 'add-broll'
  | 'apply-brand'
  | 'export';

export interface RecipeStep {
  id: string;
  kind: RecipeStepKind;
  /** Step-specific params; see the executor for the shape per kind. */
  params: Record<string, string | number | boolean>;
}

export interface Recipe {
  id: string;
  name: string;
  trigger: RecipeTrigger;
  /** Only run `on-import` recipes for these asset kinds (empty = any). */
  importKinds: string[];
  steps: RecipeStep[];
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
}

export type RecipeStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface RecipeRunStep {
  stepId: string;
  kind: RecipeStepKind;
  title: string;
  status: RecipeStepStatus;
  result?: string;
}

export interface RecipeRun {
  recipeId: string;
  startedAt: number;
  steps: RecipeRunStep[];
  done: boolean;
}

// ─── Brand templates (spec §86) ────────────────────────────────────────────

export interface BrandTemplate {
  id: string;
  name: string;
  captionStyle: CaptionStyle;
  colors: string[];
  fonts: string[];
  /** Preferred delivery aspect. */
  primaryAspect: string;
  createdAt: number;
}

// ─── Step catalogue (for the recipe editor UI) ─────────────────────────────

export interface StepDef {
  kind: RecipeStepKind;
  label: string;
  detail: string;
  /** Params shown in the editor: key → {label, type, default, options?}. */
  params: Array<{
    key: string;
    label: string;
    type: 'number' | 'text' | 'select' | 'bool';
    default: string | number | boolean;
    options?: string[];
  }>;
  /** Needs a local speech model. */
  needsModel?: boolean;
}

export const STEP_DEFS: StepDef[] = [
  {
    kind: 'remove-silences',
    label: 'Remove silences',
    detail: 'Ripple-delete quiet gaps in every clip that has audio.',
    params: [{ key: 'mode', label: 'Mode', type: 'select', default: 'balanced', options: ['conservative', 'balanced', 'aggressive'] }],
  },
  {
    kind: 'detect-shots',
    label: 'Detect shots',
    detail: 'Add shot-boundary markers to each video clip.',
    params: [{ key: 'sensitivity', label: 'Sensitivity', type: 'number', default: 0.45 }],
  },
  {
    kind: 'generate-captions',
    label: 'Generate captions',
    detail: 'Transcribe the first audio/video clip and lay down captions.',
    params: [{ key: 'model', label: 'Model', type: 'select', default: 'whisper-tiny-en', options: ['whisper-tiny-en', 'whisper-base'] }],
    needsModel: true,
  },
  {
    kind: 'caption-style',
    label: 'Set caption style',
    detail: 'Apply a caption preset.',
    params: [{ key: 'preset', label: 'Preset', type: 'select', default: 'bold', options: ['minimal', 'bold', 'boxed', 'karaoke'] }],
  },
  {
    kind: 'normalize-audio',
    label: 'Normalize audio',
    detail: 'Set audio-track gain so the mix hits a target loudness.',
    params: [{ key: 'targetDb', label: 'Target (dBFS RMS)', type: 'number', default: -16 }],
  },
  {
    kind: 'auto-color',
    label: 'Auto colour',
    detail: 'Gently push every clip toward a neutral exposure and contrast.',
    params: [{ key: 'strength', label: 'Strength', type: 'number', default: 0.6 }],
  },
  {
    kind: 'auto-reframe',
    label: 'Auto-reframe',
    detail: 'Create a subject-tracked version of the first video clip at a new aspect.',
    params: [{ key: 'aspect', label: 'Aspect', type: 'select', default: '9:16', options: ['9:16', '1:1', '4:5', '16:9'] }],
  },
  {
    kind: 'add-broll',
    label: 'Add B-roll',
    detail: 'Match or generate a clip for each caption line.',
    params: [],
  },
  {
    kind: 'apply-brand',
    label: 'Apply brand template',
    detail: 'Set caption style and project colours from a saved brand template.',
    params: [{ key: 'templateId', label: 'Template id', type: 'text', default: '' }],
  },
  {
    kind: 'export',
    label: 'Export',
    detail: 'Render the timeline with a preset.',
    params: [
      { key: 'format', label: 'Format', type: 'select', default: 'mp4', options: ['mp4', 'webm'] },
      { key: 'aspect', label: 'Aspect', type: 'select', default: 'project', options: ['project', '9:16', '1:1', '16:9'] },
    ],
  },
];

export function stepDef(kind: RecipeStepKind): StepDef {
  return STEP_DEFS.find((s) => s.kind === kind)!;
}

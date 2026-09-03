/**
 * AI Director (spec §80, §126, §194, §195). There is no LLM here: the Director
 * is a **deterministic planner** that composes the capabilities the app
 * already has (storyboard, generation queue, QC, look-match, captions, export)
 * into an ordered plan, shows it for approval, then executes it step by step
 * with an explanation for each action (spec §18, §120).
 */

export type AutonomyLevel = 'assisted' | 'semi-auto' | 'auto' | 'full-auto';

export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  assisted: 'Assisted — build the plan, I run each step',
  'semi-auto': 'Semi-auto — approve the plan, then auto-run non-destructive steps',
  auto: 'Auto — run non-destructive steps without asking',
  'full-auto': 'Full auto — run everything, including export',
};

export type PlanStepKind =
  | 'analyze'
  | 'build-storyboard'
  | 'generate-shots'
  | 'qc-retry'
  | 'assemble'
  | 'color-match'
  | 'captions'
  | 'broll'
  | 'music'
  | 'sound-design'
  | 'export-variants';

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  detail: string;
  /** Changes the timeline / creates assets → gated by autonomy level. */
  destructive: boolean;
  status: PlanStepStatus;
  /** Human-readable outcome, filled after the step runs (spec §120). */
  result?: string;
}

export interface DraftShot {
  title: string;
  prompt: string;
  camera: string;
  style: string;
  durationSec: number;
  carryContinuity: boolean;
}

export interface DirectorPlan {
  id: string;
  goal: string;
  createdAt: number;
  /** Shots the plan will create in the storyboard. */
  shots: DraftShot[];
  /** Caption cues the plan will lay down, if any (from a script). */
  captionLines: string[];
  /** Target aspect ratios for export variants. */
  exportAspects: string[];
  steps: PlanStep[];
}

export interface CreativeBrief {
  objective: string;
  product: string;
  audience: string;
  platform: 'reel' | 'tiktok' | 'youtube' | 'story' | 'square' | 'landscape';
  durationSec: number;
  style: string;
  mood: string;
  shotCount: number;
}

export const DEFAULT_BRIEF: CreativeBrief = {
  objective: '',
  product: '',
  audience: 'general audience',
  platform: 'reel',
  durationSec: 20,
  style: 'cinematic',
  mood: 'warm, elegant',
  shotCount: 5,
};

export const PLATFORM_ASPECT: Record<CreativeBrief['platform'], string> = {
  reel: '9:16',
  tiktok: '9:16',
  story: '9:16',
  square: '1:1',
  youtube: '16:9',
  landscape: '16:9',
};

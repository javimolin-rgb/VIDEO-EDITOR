/**
 * Core domain types. Everything here is plain data and JSON-serializable so
 * it can be persisted to IndexedDB and exported as a portable project
 * package (spec §9, §118, §286). Binary media never lives in these
 * structures — assets reference blobs stored separately by id.
 */

import type { Timebase, Frame, FrameRange } from '@/lib/time';

export const PROJECT_SCHEMA_VERSION = 4 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Assets (spec §14, §214)
// ─────────────────────────────────────────────────────────────────────────────

export type AssetKind = 'video' | 'audio' | 'image' | 'caption';

/**
 * Why an asset exists in the project. Drives AI reasoning about the project
 * later (spec §213) and keeps generated media distinct from source media.
 */
export type AssetRole =
  | 'source' // imported footage / audio
  | 'generated' // produced by a generative model
  | 'reference' // used to condition generation, not for the cut
  | 'brand' // logo / brand-kit element
  | 'output'; // a rendered export kept inside the project

export interface MediaMeta {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  codec: string | null;
  audioChannels: number | null;
  sampleRate: number | null;
  /** Rotation flag from container metadata, degrees. */
  rotation: number | null;
  sizeBytes: number;
  mimeType: string;
}

export interface Asset {
  id: string;
  projectId: string;
  kind: AssetKind;
  role: AssetRole;
  name: string;
  /** Key into the blob store (Dexie table `blobs`). Null for pure metadata assets. */
  blobKey: string | null;
  /** Data URL for a small poster frame / waveform preview. */
  thumbnailDataUrl: string | null;
  meta: MediaMeta;
  createdAt: number;
  /** Present only when role === 'generated' (spec §124, §243). */
  generation?: GenerationMeta;
  /** Free-form tags from media analysis (spec §175). Empty until Phase 3. */
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation metadata (spec §124, §243, §286) — model-agnostic
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerationMeta {
  generationId: string;
  parentId: string | null;
  providerId: string;
  modelId: string;
  modelVersion: string;
  prompt: string;
  negativePrompt: string | null;
  referenceAssetIds: string[];
  seed: number | null;
  params: Record<string, number | string | boolean>;
  durationSec: number;
  resolution: { width: number; height: number };
  fps: number;
  createdAt: number;
  qualityScore: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline (spec §10, §11)
// ─────────────────────────────────────────────────────────────────────────────

export type TrackKind = 'video' | 'audio' | 'text' | 'adjustment' | 'caption';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  /** Top-to-bottom order within its kind group; lower renders on top for video. */
  index: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  height: number;
  /** Audio track mixing (spec §53). 1 = unity; ignored for non-audio tracks. */
  gain: number;
  /** -1 (L) .. 1 (R). */
  pan: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — transform, colour, effects, keyframes (spec §63, §106, §107, §110)
// ─────────────────────────────────────────────────────────────────────────────

/** 2D placement of a visual clip in project-resolution space. */
export interface Transform {
  /** Offset from centre, in project pixels. */
  x: number;
  y: number;
  /** 1 = the clip's natural "contain" fit inside the frame. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** Rotation/scale anchor, 0..1 within the clip's fitted box. */
  anchorX: number;
  anchorY: number;
}

export const IDENTITY_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

/** Primary colour correction, applied before effects (spec §63). */
export interface ColorGrade {
  enabled: boolean;
  /** All roughly -1..1, 0 = unchanged. */
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
}

export const NEUTRAL_COLOR: ColorGrade = {
  enabled: false,
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
};

export type EffectType =
  | 'gaussian-blur'
  | 'sharpen'
  | 'vignette'
  | 'grain'
  | 'grayscale'
  | 'sepia'
  | 'hue-rotate'
  | 'brightness'
  | 'invert'
  | 'contrast'
  | 'saturation'
  | 'blur-direction'
  | 'scanlines'
  | 'chromatic'
  | 'bloom'
  | 'pixelate'
  | 'vhs'
  | 'duotone'
  | 'mirror';

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  /** Effect-specific scalar params; see `domain/effects/registry.ts`. */
  params: Record<string, number>;
}

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export interface Keyframe {
  /** Frame relative to the clip's own start. */
  frame: Frame;
  value: number;
  /** Interpolation from this keyframe to the next. */
  easing: Easing;
}

/** Parameters that can be animated with keyframes (spec §106). */
export type AnimatableParam =
  | 'opacity'
  | 'gain'
  | 'transform.x'
  | 'transform.y'
  | 'transform.scale'
  | 'transform.rotation'
  | 'color.exposure'
  | 'color.contrast'
  | 'color.saturation';

export type ClipKeyframes = Partial<Record<AnimatableParam, Keyframe[]>>;

// ─────────────────────────────────────────────────────────────────────────────
// Transitions (spec §42, §108) — standard (non-generative) set for Phase 2
// ─────────────────────────────────────────────────────────────────────────────

export type TransitionType =
  | 'dissolve'
  | 'fade-color'
  | 'wipe'
  | 'slide'
  | 'zoom'
  | 'circle'
  | 'push'
  | 'blur'
  | 'flash'
  | 'pixelate'
  | 'spin'
  | 'whip';

export interface Transition {
  id: string;
  trackId: string;
  /** The outgoing clip (ends into the transition). */
  fromClipId: string;
  /** The incoming clip (starts out of the transition). */
  toClipId: string;
  type: TransitionType;
  /** Length of the overlap the transition plays across. */
  durationFrames: Frame;
  params: Record<string, number | string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Captions (spec §50, §51, §52)
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptionWord {
  text: string;
  startFrame: Frame;
  endFrame: Frame;
}

export interface CaptionCue {
  id: string;
  startFrame: Frame;
  endFrame: Frame;
  text: string;
  /** Populated when the source (VTT) carries inline word timings. */
  words?: CaptionWord[];
}

export type CaptionPreset = 'minimal' | 'bold' | 'boxed' | 'karaoke';

export interface CaptionStyle {
  preset: CaptionPreset;
  fontFamily: string;
  fontSizePct: number; // % of frame height
  color: string;
  highlightColor: string;
  backgroundColor: string;
  /** Vertical anchor, 0 (top) .. 1 (bottom). */
  position: number;
  uppercase: boolean;
  maxCharsPerLine: number;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  preset: 'bold',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSizePct: 5.5,
  color: '#ffffff',
  highlightColor: '#ffd60a',
  backgroundColor: 'rgba(0,0,0,0.55)',
  position: 0.82,
  uppercase: false,
  maxCharsPerLine: 38,
};

export interface CaptionLayer {
  enabled: boolean;
  style: CaptionStyle;
  cues: CaptionCue[];
  /** Where the cues came from, for the UI. */
  sourceName: string | null;
}

/**
 * A clip places a slice of an asset (`sourceIn..sourceOut`, in asset frames on
 * the project timebase) at `timelineStart` on a track. Non-destructive: the
 * asset is never modified (spec §215).
 */
export interface Clip {
  id: string;
  trackId: string;
  assetId: string;
  /** Frame on the timeline where this clip begins. */
  timelineStart: Frame;
  /** Source-media in/out points, in frames on the project timebase. */
  sourceIn: Frame;
  sourceOut: Frame;
  /** Playback rate multiplier (1 = normal). Phase 2 wires the UI. */
  speed: number;
  /** 0..2 base gain for audio-bearing clips; may be animated via `keyframes`. */
  gain: number;
  /** -1 (L) .. 1 (R) constant pan for audio-bearing clips. */
  pan: number;
  /** 0..1 base opacity for visual clips; may be animated via `keyframes`. */
  opacity: number;
  /** Fade lengths in frames. */
  fadeInFrames: number;
  fadeOutFrames: number;
  /** Placement of a visual clip within the frame (spec §110). */
  transform: Transform;
  /** Primary colour correction (spec §63). */
  color: ColorGrade;
  /** Ordered, stackable effects (spec §107). Rendered top-to-bottom. */
  effects: EffectInstance[];
  /** Per-parameter animation curves (spec §106). */
  keyframes: ClipKeyframes;
  label: string | null;
}

export function clipTimelineRange(clip: Clip): FrameRange {
  const len = Math.round((clip.sourceOut - clip.sourceIn) / clip.speed);
  return { start: clip.timelineStart, end: clip.timelineStart + Math.max(1, len) };
}

export interface Marker {
  id: string;
  frame: Frame;
  label: string;
  color: string;
}

export interface Timeline {
  timebase: Timebase;
  /** Explicit sequence length; clips may extend it. */
  durationFrames: Frame;
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  /** Standard transitions across clip boundaries (spec §108). */
  transitions: Transition[];
  /** Single project caption layer (spec §50). */
  captionLayer: CaptionLayer;
  playheadFrame: Frame;
  /** In/out selection on the ruler, half-open. Null when unset. */
  selectionRange: FrameRange | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Project (spec §9, §286)
// ─────────────────────────────────────────────────────────────────────────────

export type AspectRatioId = '16:9' | '9:16' | '1:1' | '4:5' | '21:9' | 'custom';

export interface ProjectSettings {
  resolution: { width: number; height: number };
  aspectRatio: AspectRatioId;
  fps: number;
  /** Background behind all video tracks. */
  backgroundColor: string;
  /** Proxy generation policy (spec §113). */
  proxyMode: 'off' | 'auto' | 'always';
}

export interface BrandKit {
  logos: string[]; // asset ids
  fonts: string[];
  colors: string[];
  notes: string;
}

// ─── Reference board (spec §23, §24, §135, §186) ────────────────────────────

export type ReferenceRole =
  | 'character'
  | 'product'
  | 'clothing'
  | 'environment'
  | 'architecture'
  | 'style'
  | 'color'
  | 'composition'
  | 'camera'
  | 'motion'
  | 'audio'
  | 'story'
  | 'brand';

export type ReferencePriority = 'critical' | 'high' | 'medium' | 'low';

export interface ReferenceAsset {
  assetId: string;
  role: ReferenceRole;
  priority: ReferencePriority;
}

// ─── Storyboard (spec §38, §39, §131, §203, §204) ───────────────────────────

export type ShotState = 'draft' | 'queued' | 'generating' | 'ready' | 'failed';

export interface StoryboardShot {
  id: string;
  /** Position in the storyboard, 0-based. */
  order: number;
  title: string;
  /** Free-text shot description (fed through the prompt engine). */
  prompt: string;
  durationSec: number;
  camera: string;
  style: string;
  referenceAssetIds: string[];
  /** Carry the previous shot's last frame as this shot's first frame (spec §40). */
  carryContinuity: boolean;
  /** Generated clip once ready. */
  assetId: string | null;
  lastGenerationId: string | null;
  state: ShotState;
}

export interface ProjectMeta {
  id: string;
  name: string;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  createdAt: number;
  updatedAt: number;
  /** Human-authored creative direction, fed to the AI later (spec §17, §139). */
  aiInstructions: string;
}

export interface VideoProject {
  meta: ProjectMeta;
  settings: ProjectSettings;
  timeline: Timeline;
  brandKit: BrandKit;
  /** Ids only; asset rows live in their own table. */
  assetIds: string[];
  /** Reference board for generative work (spec §23). */
  references: ReferenceAsset[];
  /** Multi-shot plan for long-form generation (spec §204). */
  storyboard: StoryboardShot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Version history (spec §123)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectVersion {
  id: string;
  projectId: string;
  createdAt: number;
  label: string;
  /** Full project snapshot at save time. */
  snapshot: VideoProject;
}

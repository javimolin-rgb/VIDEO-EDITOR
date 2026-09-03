/**
 * Core domain types. Everything here is plain data and JSON-serializable so
 * it can be persisted to IndexedDB and exported as a portable project
 * package (spec §9, §118, §286). Binary media never lives in these
 * structures — assets reference blobs stored separately by id.
 */

import type { Timebase, Frame, FrameRange } from '@/lib/time';

export const PROJECT_SCHEMA_VERSION = 1 as const;

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
  /** 0..1 constant gain for audio-bearing clips. Keyframes come in Phase 2. */
  gain: number;
  /** 0..1 opacity for visual clips. */
  opacity: number;
  /** Fade lengths in frames. */
  fadeInFrames: number;
  fadeOutFrames: number;
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

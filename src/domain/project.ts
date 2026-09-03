import { newId } from '@/lib/id';
import { DEFAULT_TIMEBASE, secondsToFrames } from '@/lib/time';
import {
  DEFAULT_CAPTION_STYLE,
  PROJECT_SCHEMA_VERSION,
  type AspectRatioId,
  type Timeline,
  type Track,
  type TrackKind,
  type VideoProject,
} from './types';

export const ASPECT_PRESETS: Record<Exclude<AspectRatioId, 'custom'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '21:9': { width: 2560, height: 1080 },
};

function makeTrack(kind: TrackKind, index: number, name: string): Track {
  return {
    id: newId('track'),
    kind,
    name,
    index,
    muted: false,
    locked: false,
    hidden: false,
    height: kind === 'audio' ? 72 : 96,
    gain: 1,
    pan: 0,
  };
}

/** A fresh, empty timeline with the conventional V2/V1/A1/A2 track stack. */
export function createEmptyTimeline(fps: number): Timeline {
  return {
    timebase: { ...DEFAULT_TIMEBASE, fps },
    durationFrames: secondsToFrames(30, { ...DEFAULT_TIMEBASE, fps }),
    tracks: [
      makeTrack('video', 0, 'V2'),
      makeTrack('video', 1, 'V1'),
      makeTrack('audio', 0, 'A1'),
      makeTrack('audio', 1, 'A2'),
    ],
    clips: [],
    markers: [],
    transitions: [],
    captionLayer: { enabled: false, style: { ...DEFAULT_CAPTION_STYLE }, cues: [], sourceName: null },
    playheadFrame: 0,
    selectionRange: null,
  };
}

export interface CreateProjectOptions {
  name?: string;
  aspectRatio?: AspectRatioId;
  fps?: number;
}

export function createProject(opts: CreateProjectOptions = {}): VideoProject {
  const aspectRatio = opts.aspectRatio ?? '16:9';
  const fps = opts.fps ?? 30;
  const resolution =
    aspectRatio === 'custom' ? { width: 1920, height: 1080 } : ASPECT_PRESETS[aspectRatio];
  const now = Date.now();

  return {
    meta: {
      id: newId('proj'),
      name: opts.name?.trim() || 'Untitled project',
      schemaVersion: PROJECT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      aiInstructions: '',
    },
    settings: {
      resolution,
      aspectRatio,
      fps,
      backgroundColor: '#000000',
      proxyMode: 'auto',
    },
    timeline: createEmptyTimeline(fps),
    brandKit: { logos: [], fonts: [], colors: [], notes: '' },
    assetIds: [],
  };
}

/** Structural clone that is safe to mutate. Uses native structuredClone. */
export function cloneProject(project: VideoProject): VideoProject {
  return structuredClone(project);
}

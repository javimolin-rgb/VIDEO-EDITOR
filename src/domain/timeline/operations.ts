/**
 * Pure timeline edit operations (spec §10). Every function takes a timeline
 * and returns a **new** timeline; nothing is mutated in place. These are the
 * deterministic primitives that both the UI and the AI intent executor
 * (spec §18) call — natural language is never executed directly.
 */

import { newId } from '@/lib/id';
import { clampFrame, quantize, type Frame, type FrameRange } from '@/lib/time';
import {
  clipTimelineRange,
  type Clip,
  type Marker,
  type Timeline,
  type Track,
  type TrackKind,
} from '@/domain/types';

const MIN_CLIP_FRAMES = 1;

function replaceClip(timeline: Timeline, id: string, next: Clip | null): Timeline {
  const clips: Clip[] = [];
  for (const c of timeline.clips) {
    if (c.id !== id) {
      clips.push(c);
    } else if (next) {
      clips.push(next);
    }
  }
  return { ...timeline, clips };
}

export function getClip(timeline: Timeline, id: string): Clip | undefined {
  return timeline.clips.find((c) => c.id === id);
}

export function getTrack(timeline: Timeline, id: string): Track | undefined {
  return timeline.tracks.find((t) => t.id === id);
}

export function clipsOnTrack(timeline: Timeline, trackId: string): Clip[] {
  return timeline.clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.timelineStart - b.timelineStart);
}

/** Longest clip end across all tracks, in frames. */
export function contentEndFrame(timeline: Timeline): Frame {
  let end = 0;
  for (const c of timeline.clips) end = Math.max(end, clipTimelineRange(c).end);
  return end;
}

function overlaps(a: FrameRange, b: FrameRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Find the earliest free start >= desiredStart on a track where a clip of
 * `length` frames fits without overlapping existing clips.
 */
export function findFreeSlot(
  timeline: Timeline,
  trackId: string,
  desiredStart: Frame,
  length: Frame,
  ignoreClipId?: string,
): Frame {
  const others = clipsOnTrack(timeline, trackId).filter((c) => c.id !== ignoreClipId);
  let start = Math.max(0, quantize(desiredStart));
  // Walk forward past any clip we'd collide with.
  for (let guard = 0; guard < others.length + 1; guard++) {
    const candidate: FrameRange = { start, end: start + length };
    const hit = others.find((c) => overlaps(candidate, clipTimelineRange(c)));
    if (!hit) return start;
    start = clipTimelineRange(hit).end;
  }
  return start;
}

export interface AddClipParams {
  trackId: string;
  assetId: string;
  timelineStart: Frame;
  sourceIn: Frame;
  sourceOut: Frame;
  label?: string | null;
  /** When true, push to the next free slot instead of overlapping. */
  avoidOverlap?: boolean;
}

export function addClip(timeline: Timeline, params: AddClipParams): { timeline: Timeline; clipId: string } {
  const length = Math.max(MIN_CLIP_FRAMES, params.sourceOut - params.sourceIn);
  const start = params.avoidOverlap ?? true
    ? findFreeSlot(timeline, params.trackId, params.timelineStart, length)
    : Math.max(0, quantize(params.timelineStart));

  const clip: Clip = {
    id: newId('clip'),
    trackId: params.trackId,
    assetId: params.assetId,
    timelineStart: start,
    sourceIn: Math.max(0, quantize(params.sourceIn)),
    sourceOut: Math.max(quantize(params.sourceIn) + MIN_CLIP_FRAMES, quantize(params.sourceOut)),
    speed: 1,
    gain: 1,
    opacity: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    label: params.label ?? null,
  };

  const next: Timeline = {
    ...timeline,
    clips: [...timeline.clips, clip],
  };
  return { timeline: growToFitContent(next), clipId: clip.id };
}

export interface MoveClipParams {
  clipId: string;
  /** New timeline start (frames). Clamped to >= 0. */
  timelineStart: Frame;
  /** Optional track change. */
  trackId?: string;
  avoidOverlap?: boolean;
}

export function moveClip(timeline: Timeline, params: MoveClipParams): Timeline {
  const clip = getClip(timeline, params.clipId);
  if (!clip) return timeline;
  const trackId = params.trackId ?? clip.trackId;
  const length = clipTimelineRange(clip).end - clipTimelineRange(clip).start;
  const start =
    (params.avoidOverlap ?? true)
      ? findFreeSlot(timeline, trackId, params.timelineStart, length, clip.id)
      : Math.max(0, quantize(params.timelineStart));
  return growToFitContent(replaceClip(timeline, clip.id, { ...clip, trackId, timelineStart: start }));
}

export type TrimEdge = 'start' | 'end';

export interface TrimClipParams {
  clipId: string;
  edge: TrimEdge;
  /** Absolute timeline frame the dragged edge should move to. */
  toFrame: Frame;
}

/**
 * Trim one edge of a clip. Moving the start edge also rolls the source-in
 * point so the media stays in sync (a true trim, not a slip).
 */
export function trimClip(timeline: Timeline, params: TrimClipParams): Timeline {
  const clip = getClip(timeline, params.clipId);
  if (!clip) return timeline;
  const range = clipTimelineRange(clip);
  const to = quantize(params.toFrame);

  if (params.edge === 'start') {
    const maxStart = range.end - MIN_CLIP_FRAMES;
    const newStart = clampFrame(to, Math.max(0, range.start - clip.sourceIn), maxStart);
    const deltaTimeline = newStart - range.start;
    const deltaSource = Math.round(deltaTimeline * clip.speed);
    const nextSourceIn = clampFrame(
      clip.sourceIn + deltaSource,
      0,
      clip.sourceOut - MIN_CLIP_FRAMES,
    );
    return replaceClip(timeline, clip.id, {
      ...clip,
      timelineStart: newStart,
      sourceIn: nextSourceIn,
    });
  }

  // edge === 'end': roll source-out. Media length caps the extension when known.
  const minEnd = range.start + MIN_CLIP_FRAMES;
  const newEnd = Math.max(minEnd, to);
  const deltaTimeline = newEnd - range.end;
  const deltaSource = Math.round(deltaTimeline * clip.speed);
  const nextSourceOut = Math.max(clip.sourceIn + MIN_CLIP_FRAMES, clip.sourceOut + deltaSource);
  return growToFitContent(
    replaceClip(timeline, clip.id, { ...clip, sourceOut: nextSourceOut }),
  );
}

export interface SplitParams {
  clipId: string;
  /** Absolute timeline frame to cut at. Must fall strictly inside the clip. */
  atFrame: Frame;
}

export function splitClip(
  timeline: Timeline,
  params: SplitParams,
): { timeline: Timeline; newClipId: string | null } {
  const clip = getClip(timeline, params.clipId);
  if (!clip) return { timeline, newClipId: null };
  const range = clipTimelineRange(clip);
  const at = quantize(params.atFrame);
  if (at <= range.start || at >= range.end) return { timeline, newClipId: null };

  const offsetTimeline = at - range.start;
  const offsetSource = Math.round(offsetTimeline * clip.speed);
  const left: Clip = { ...clip, sourceOut: clip.sourceIn + offsetSource };
  const right: Clip = {
    ...clip,
    id: newId('clip'),
    timelineStart: at,
    sourceIn: clip.sourceIn + offsetSource,
    fadeInFrames: 0,
  };
  left.fadeOutFrames = 0;

  return {
    timeline: { ...timeline, clips: [...timeline.clips.filter((c) => c.id !== clip.id), left, right] },
    newClipId: right.id,
  };
}

export function removeClip(timeline: Timeline, clipId: string): Timeline {
  return replaceClip(timeline, clipId, null);
}

/**
 * Ripple-delete: remove the clip and pull every later clip on the *same track*
 * back by the gap it left (spec §10 ripple editing).
 */
export function rippleDeleteClip(timeline: Timeline, clipId: string): Timeline {
  const clip = getClip(timeline, clipId);
  if (!clip) return timeline;
  const gap = clipTimelineRange(clip).end - clipTimelineRange(clip).start;
  const cutAt = clip.timelineStart;
  const clips = timeline.clips
    .filter((c) => c.id !== clipId)
    .map((c) =>
      c.trackId === clip.trackId && c.timelineStart >= cutAt
        ? { ...c, timelineStart: Math.max(0, c.timelineStart - gap) }
        : c,
    );
  return { ...timeline, clips };
}

export function duplicateClip(
  timeline: Timeline,
  clipId: string,
): { timeline: Timeline; newClipId: string | null } {
  const clip = getClip(timeline, clipId);
  if (!clip) return { timeline, newClipId: null };
  const length = clipTimelineRange(clip).end - clipTimelineRange(clip).start;
  const start = findFreeSlot(timeline, clip.trackId, clipTimelineRange(clip).end, length);
  const copy: Clip = { ...clip, id: newId('clip'), timelineStart: start };
  return { timeline: growToFitContent({ ...timeline, clips: [...timeline.clips, copy] }), newClipId: copy.id };
}

// ─── Playhead / selection / markers ──────────────────────────────────────────

export function setPlayhead(timeline: Timeline, frame: Frame): Timeline {
  const max = Math.max(timeline.durationFrames, contentEndFrame(timeline));
  return { ...timeline, playheadFrame: clampFrame(quantize(frame), 0, max) };
}

export function setSelectionRange(timeline: Timeline, range: FrameRange | null): Timeline {
  if (!range) return { ...timeline, selectionRange: null };
  const start = Math.max(0, quantize(Math.min(range.start, range.end)));
  const end = Math.max(start + 1, quantize(Math.max(range.start, range.end)));
  return { ...timeline, selectionRange: { start, end } };
}

export function addMarker(timeline: Timeline, frame: Frame, label = 'Marker'): Timeline {
  const marker: Marker = { id: newId('marker'), frame: quantize(frame), label, color: '#ffd43b' };
  return { ...timeline, markers: [...timeline.markers, marker].sort((a, b) => a.frame - b.frame) };
}

export function removeMarker(timeline: Timeline, markerId: string): Timeline {
  return { ...timeline, markers: timeline.markers.filter((m) => m.id !== markerId) };
}

// ─── Tracks ─────────────────────────────────────────────────────────────────

export function addTrack(timeline: Timeline, kind: TrackKind): { timeline: Timeline; trackId: string } {
  const sameKind = timeline.tracks.filter((t) => t.kind === kind);
  const index = sameKind.length;
  const track: Track = {
    id: newId('track'),
    kind,
    name: `${kind[0]!.toUpperCase()}${sameKind.length + 1}`,
    index,
    muted: false,
    locked: false,
    hidden: false,
    height: kind === 'audio' ? 72 : 96,
  };
  return { timeline: { ...timeline, tracks: [...timeline.tracks, track] }, trackId: track.id };
}

export function updateTrack(timeline: Timeline, trackId: string, patch: Partial<Track>): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => (t.id === trackId ? { ...t, ...patch, id: t.id } : t)),
  };
}

export function removeTrack(timeline: Timeline, trackId: string): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.filter((t) => t.id !== trackId),
    clips: timeline.clips.filter((c) => c.trackId !== trackId),
  };
}

// ─── Internal ───────────────────────────────────────────────────────────────

/** Ensure the declared sequence length always covers the last clip. */
function growToFitContent(timeline: Timeline): Timeline {
  const end = contentEndFrame(timeline);
  if (end <= timeline.durationFrames) return timeline;
  return { ...timeline, durationFrames: end };
}

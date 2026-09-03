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
  IDENTITY_TRANSFORM,
  NEUTRAL_COLOR,
  type Clip,
  type Marker,
  type Timeline,
  type Track,
  type TrackKind,
  type Transition,
  type TransitionType,
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
    pan: 0,
    opacity: 1,
    fadeInFrames: 0,
    fadeOutFrames: 0,
    transform: { ...IDENTITY_TRANSFORM },
    color: { ...NEUTRAL_COLOR },
    effects: [],
    keyframes: {},
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

  // An outgoing transition on the original clip now belongs to the right half.
  const transitions = timeline.transitions.map((t) =>
    t.fromClipId === clip.id ? { ...t, fromClipId: right.id } : t,
  );

  return {
    timeline: {
      ...timeline,
      clips: [...timeline.clips.filter((c) => c.id !== clip.id), left, right],
      transitions,
    },
    newClipId: right.id,
  };
}

export function removeClip(timeline: Timeline, clipId: string): Timeline {
  const next = replaceClip(timeline, clipId, null);
  return {
    ...next,
    transitions: next.transitions.filter(
      (t) => t.fromClipId !== clipId && t.toClipId !== clipId,
    ),
  };
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
  return {
    ...timeline,
    clips,
    transitions: timeline.transitions.filter(
      (t) => t.fromClipId !== clipId && t.toClipId !== clipId,
    ),
  };
}

/**
 * Cut a set of silent spans out of one clip and close the gaps (spec §47).
 * `silentRanges` are timeline frames, sorted, non-overlapping, inside the clip.
 * Implemented with the existing split + ripple-delete primitives so behaviour
 * (and undo) is identical to doing it by hand.
 */
export function removeSilencesFromClip(
  timeline: Timeline,
  clipId: string,
  silentRanges: FrameRange[],
): { timeline: Timeline; removedFrames: Frame } {
  const original = getClip(timeline, clipId);
  if (!original || silentRanges.length === 0) return { timeline, removedFrames: 0 };

  const ranges = [...silentRanges].sort((a, b) => a.start - b.start);
  let tl = timeline;
  let currentId: string | null = clipId;
  let removed = 0;

  for (const r of ranges) {
    if (!currentId) break;
    const start = r.start - removed;
    const end = r.end - removed;
    const cur = getClip(tl, currentId);
    if (!cur) break;
    const range = clipTimelineRange(cur);
    if (start <= range.start || end >= range.end || end <= start) continue;

    const afterStart = splitClip(tl, { clipId: currentId, atFrame: start });
    tl = afterStart.timeline;
    const middleId = afterStart.newClipId;
    if (!middleId) continue;

    const afterEnd = splitClip(tl, { clipId: middleId, atFrame: end });
    tl = afterEnd.timeline;
    const rightId = afterEnd.newClipId;

    tl = rippleDeleteClip(tl, middleId);
    removed += end - start;
    currentId = rightId;
  }

  return { timeline: tl, removedFrames: removed };
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

// ─── Transitions (spec §108) ────────────────────────────────────────────────

const MIN_TRANSITION_FRAMES = 2;

export function transitionsForClip(timeline: Timeline, clipId: string): Transition[] {
  return timeline.transitions.filter((t) => t.fromClipId === clipId || t.toClipId === clipId);
}

/**
 * Add a transition across the boundary between two clips on the same track.
 * If the clips do not already overlap by `durationFrames`, the incoming clip
 * (and everything after it on that track) is rippled left to create the
 * overlap the transition plays across.
 */
export function addTransition(
  timeline: Timeline,
  params: {
    fromClipId: string;
    toClipId: string;
    type: TransitionType;
    durationFrames: Frame;
    params?: Record<string, number | string>;
  },
): { timeline: Timeline; transitionId: string | null } {
  const from = getClip(timeline, params.fromClipId);
  const to = getClip(timeline, params.toClipId);
  if (!from || !to || from.trackId !== to.trackId || from.id === to.id) {
    return { timeline, transitionId: null };
  }

  const fromRange = clipTimelineRange(from);
  const toRange = clipTimelineRange(to);
  // `from` must be the earlier clip.
  if (fromRange.start > toRange.start) return { timeline, transitionId: null };

  const duration = Math.max(MIN_TRANSITION_FRAMES, quantize(params.durationFrames));
  const currentOverlap = fromRange.end - toRange.start;
  const shortfall = duration - currentOverlap;

  let clips = timeline.clips;
  if (shortfall > 0) {
    // Don't let `to` pass the start of `from`.
    const maxShift = toRange.start - (fromRange.start + MIN_CLIP_FRAMES);
    const shift = Math.min(shortfall, Math.max(0, maxShift));
    if (shift <= 0) return { timeline, transitionId: null };
    clips = clips.map((c) =>
      c.trackId === to.trackId && c.timelineStart >= toRange.start
        ? { ...c, timelineStart: c.timelineStart - shift }
        : c,
    );
  }

  const transition: Transition = {
    id: newId('clip'),
    trackId: from.trackId,
    fromClipId: from.id,
    toClipId: to.id,
    type: params.type,
    durationFrames: duration,
    params: params.params ?? {},
  };

  return {
    timeline: {
      ...timeline,
      clips,
      transitions: [
        ...timeline.transitions.filter(
          (t) => !(t.fromClipId === from.id && t.toClipId === to.id),
        ),
        transition,
      ],
    },
    transitionId: transition.id,
  };
}

export function updateTransition(
  timeline: Timeline,
  transitionId: string,
  patch: Partial<Pick<Transition, 'type' | 'durationFrames' | 'params'>>,
): Timeline {
  return {
    ...timeline,
    transitions: timeline.transitions.map((t) =>
      t.id === transitionId
        ? {
            ...t,
            ...patch,
            durationFrames:
              patch.durationFrames != null
                ? Math.max(MIN_TRANSITION_FRAMES, quantize(patch.durationFrames))
                : t.durationFrames,
          }
        : t,
    ),
  };
}

export function removeTransition(timeline: Timeline, transitionId: string): Timeline {
  return { ...timeline, transitions: timeline.transitions.filter((t) => t.id !== transitionId) };
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
    gain: 1,
    pan: 0,
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

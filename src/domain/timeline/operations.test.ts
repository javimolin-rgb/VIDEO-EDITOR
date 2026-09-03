import { describe, expect, it } from 'vitest';
import { createEmptyTimeline } from '@/domain/project';
import { clipTimelineRange } from '@/domain/types';
import {
  addClip,
  contentEndFrame,
  duplicateClip,
  findFreeSlot,
  moveClip,
  removeClip,
  rippleDeleteClip,
  splitClip,
  trimClip,
} from './operations';

const fps = 30;

function seed() {
  const tl = createEmptyTimeline(fps);
  const videoTrack = tl.tracks.find((t) => t.kind === 'video')!;
  return { tl, trackId: videoTrack.id };
}

describe('addClip', () => {
  it('adds a clip at the requested frame and grows the sequence', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'asset_a',
      timelineStart: 100,
      sourceIn: 0,
      sourceOut: 150,
    });
    const clip = timeline.clips.find((c) => c.id === clipId)!;
    expect(clip.timelineStart).toBe(100);
    expect(clipTimelineRange(clip).end).toBe(250);
    expect(timeline.durationFrames).toBeGreaterThanOrEqual(250);
  });

  it('avoids overlap by pushing to the next free slot', () => {
    const { tl, trackId } = seed();
    const a = addClip(tl, { trackId, assetId: 'a', timelineStart: 0, sourceIn: 0, sourceOut: 100 });
    const b = addClip(a.timeline, {
      trackId,
      assetId: 'b',
      timelineStart: 50,
      sourceIn: 0,
      sourceOut: 100,
    });
    const clipB = b.timeline.clips.find((c) => c.id === b.clipId)!;
    expect(clipB.timelineStart).toBe(100);
  });
});

describe('findFreeSlot', () => {
  it('returns the desired start when the lane is empty', () => {
    const { tl, trackId } = seed();
    expect(findFreeSlot(tl, trackId, 42, 30)).toBe(42);
  });
});

describe('trimClip', () => {
  it('rolls source-in when trimming the start edge', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 100,
    });
    const trimmed = trimClip(timeline, { clipId, edge: 'start', toFrame: 20 });
    const clip = trimmed.clips.find((c) => c.id === clipId)!;
    expect(clip.timelineStart).toBe(20);
    expect(clip.sourceIn).toBe(20);
  });

  it('extends the end edge', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 100,
    });
    const trimmed = trimClip(timeline, { clipId, edge: 'end', toFrame: 160 });
    const clip = trimmed.clips.find((c) => c.id === clipId)!;
    expect(clipTimelineRange(clip).end).toBe(160);
    expect(clip.sourceOut).toBe(160);
  });
});

describe('splitClip', () => {
  it('splits into two contiguous clips sharing the source', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 100,
    });
    const { timeline: after, newClipId } = splitClip(timeline, { clipId, atFrame: 40 });
    expect(newClipId).toBeTruthy();
    const left = after.clips.find((c) => c.id === clipId)!;
    const right = after.clips.find((c) => c.id === newClipId)!;
    expect(left.sourceOut).toBe(40);
    expect(right.sourceIn).toBe(40);
    expect(right.timelineStart).toBe(40);
    expect(clipTimelineRange(left).end).toBe(right.timelineStart);
  });

  it('is a no-op when the cut is outside the clip', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 10,
      sourceIn: 0,
      sourceOut: 50,
    });
    const { newClipId } = splitClip(timeline, { clipId, atFrame: 5 });
    expect(newClipId).toBeNull();
  });
});

describe('rippleDeleteClip', () => {
  it('removes the clip and pulls later clips back on the same track', () => {
    const { tl, trackId } = seed();
    let t = addClip(tl, { trackId, assetId: 'a', timelineStart: 0, sourceIn: 0, sourceOut: 60 }).timeline;
    const b = addClip(t, { trackId, assetId: 'b', timelineStart: 60, sourceIn: 0, sourceOut: 60 });
    t = b.timeline;
    const c = addClip(t, { trackId, assetId: 'c', timelineStart: 120, sourceIn: 0, sourceOut: 60 });
    t = c.timeline;

    const after = rippleDeleteClip(t, b.clipId);
    expect(after.clips).toHaveLength(2);
    const moved = after.clips.find((x) => x.id === c.clipId)!;
    expect(moved.timelineStart).toBe(60);
  });
});

describe('moveClip / removeClip / duplicateClip', () => {
  it('moves a clip to a new start', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 60,
    });
    const moved = moveClip(timeline, { clipId, timelineStart: 200 });
    expect(moved.clips[0]!.timelineStart).toBe(200);
  });

  it('removes a clip', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 60,
    });
    expect(removeClip(timeline, clipId).clips).toHaveLength(0);
  });

  it('duplicates a clip into the next free slot', () => {
    const { tl, trackId } = seed();
    const { timeline, clipId } = addClip(tl, {
      trackId,
      assetId: 'a',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 60,
    });
    const { timeline: after, newClipId } = duplicateClip(timeline, clipId);
    const copy = after.clips.find((c) => c.id === newClipId)!;
    expect(copy.timelineStart).toBe(60);
    expect(contentEndFrame(after)).toBe(120);
  });
});

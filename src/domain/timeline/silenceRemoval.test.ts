import { describe, expect, it } from 'vitest';
import { createEmptyTimeline } from '@/domain/project';
import { clipTimelineRange } from '@/domain/types';
import { addClip, contentEndFrame, removeSilencesFromClip } from './operations';

const fps = 30;

function seed() {
  const tl = createEmptyTimeline(fps);
  const trackId = tl.tracks.find((t) => t.kind === 'video')!.id;
  const { timeline, clipId } = addClip(tl, {
    trackId,
    assetId: 'a',
    timelineStart: 0,
    sourceIn: 0,
    sourceOut: 300, // 10s
  });
  return { timeline, clipId };
}

describe('removeSilencesFromClip', () => {
  it('cuts the requested spans and closes the gaps', () => {
    const { timeline, clipId } = seed();
    const { timeline: after, removedFrames } = removeSilencesFromClip(timeline, clipId, [
      { start: 60, end: 90 }, // 1s
      { start: 180, end: 240 }, // 2s
    ]);
    expect(removedFrames).toBe(90);
    // 3 keep-segments remain, packed contiguously from 0.
    expect(after.clips.length).toBe(3);
    const starts = after.clips.map((c) => clipTimelineRange(c).start).sort((a, b) => a - b);
    expect(starts[0]).toBe(0);
    expect(contentEndFrame(after)).toBe(300 - 90);
  });

  it('is a no-op with no ranges', () => {
    const { timeline, clipId } = seed();
    const { timeline: after, removedFrames } = removeSilencesFromClip(timeline, clipId, []);
    expect(removedFrames).toBe(0);
    expect(after.clips.length).toBe(1);
  });

  it('ignores ranges outside the clip', () => {
    const { timeline, clipId } = seed();
    const { removedFrames } = removeSilencesFromClip(timeline, clipId, [{ start: 400, end: 450 }]);
    expect(removedFrames).toBe(0);
  });
});

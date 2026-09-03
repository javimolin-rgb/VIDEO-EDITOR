import { describe, expect, it } from 'vitest';
import { createEmptyTimeline } from '@/domain/project';
import { addClip, gapAt } from './operations';

const fps = 30;

function withTwoClips() {
  const tl = createEmptyTimeline(fps);
  const trackId = tl.tracks.find((t) => t.kind === 'video')!.id;
  let t = addClip(tl, { trackId, assetId: 'a', timelineStart: 0, sourceIn: 0, sourceOut: 60 }).timeline;
  t = addClip(t, { trackId, assetId: 'b', timelineStart: 200, sourceIn: 0, sourceOut: 60 }).timeline;
  return { timeline: t, trackId };
}

describe('gapAt', () => {
  it('returns the empty span between two clips', () => {
    const { timeline, trackId } = withTwoClips();
    const gap = gapAt(timeline, trackId, 120);
    expect(gap).toEqual({ start: 60, end: 200 });
  });

  it('returns null when the frame is inside a clip', () => {
    const { timeline, trackId } = withTwoClips();
    expect(gapAt(timeline, trackId, 30)).toBeNull();
  });

  it('returns null past the last clip (open-ended, not a gap)', () => {
    const { timeline, trackId } = withTwoClips();
    expect(gapAt(timeline, trackId, 500)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { createEmptyTimeline } from '@/domain/project';
import { clipTimelineRange } from '@/domain/types';
import { addClip, addTransition, removeClip, splitClip } from './operations';

const fps = 30;

function twoClips() {
  const tl = createEmptyTimeline(fps);
  const trackId = tl.tracks.find((t) => t.kind === 'video')!.id;
  const a = addClip(tl, { trackId, assetId: 'a', timelineStart: 0, sourceIn: 0, sourceOut: 90 });
  const b = addClip(a.timeline, {
    trackId,
    assetId: 'b',
    timelineStart: 90,
    sourceIn: 0,
    sourceOut: 90,
  });
  return { timeline: b.timeline, fromId: a.clipId, toId: b.clipId, trackId };
}

describe('addTransition', () => {
  it('creates the overlap by rippling the incoming clip left', () => {
    const { timeline, fromId, toId } = twoClips();
    const { timeline: next, transitionId } = addTransition(timeline, {
      fromClipId: fromId,
      toClipId: toId,
      type: 'dissolve',
      durationFrames: 15,
    });
    expect(transitionId).toBeTruthy();
    const to = next.clips.find((c) => c.id === toId)!;
    expect(clipTimelineRange(to).start).toBe(75); // moved left by 15
    const from = next.clips.find((c) => c.id === fromId)!;
    const overlap = clipTimelineRange(from).end - clipTimelineRange(to).start;
    expect(overlap).toBe(15);
    expect(next.transitions).toHaveLength(1);
  });

  it('rejects when clips are on different tracks', () => {
    const { timeline, fromId, toId, trackId } = twoClips();
    const other = { ...timeline, clips: timeline.clips.map((c) => (c.id === toId ? { ...c, trackId: `${trackId}x` } : c)) };
    const { transitionId } = addTransition(other, {
      fromClipId: fromId,
      toClipId: toId,
      type: 'wipe',
      durationFrames: 10,
    });
    expect(transitionId).toBeNull();
  });

  it('drops the transition when either clip is removed', () => {
    const { timeline, fromId, toId } = twoClips();
    const withTr = addTransition(timeline, {
      fromClipId: fromId,
      toClipId: toId,
      type: 'slide',
      durationFrames: 12,
    }).timeline;
    expect(withTr.transitions).toHaveLength(1);
    const after = removeClip(withTr, toId);
    expect(after.transitions).toHaveLength(0);
  });

  it('reassigns an outgoing transition to the right half on split', () => {
    const { timeline, fromId, toId } = twoClips();
    const withTr = addTransition(timeline, {
      fromClipId: fromId,
      toClipId: toId,
      type: 'dissolve',
      durationFrames: 10,
    }).timeline;
    const from = withTr.clips.find((c) => c.id === fromId)!;
    const mid = Math.floor((clipTimelineRange(from).start + clipTimelineRange(from).end) / 2);
    const { timeline: after, newClipId } = splitClip(withTr, { clipId: fromId, atFrame: mid });
    expect(after.transitions[0]!.fromClipId).toBe(newClipId);
  });
});

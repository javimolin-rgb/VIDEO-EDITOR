import { describe, expect, it } from 'vitest';
import { formatTimecode, framesToSeconds, secondsToFrames } from './time';

const tb = { fps: 30, dropFrame: false };

describe('time', () => {
  it('round-trips seconds and frames', () => {
    expect(secondsToFrames(2, tb)).toBe(60);
    expect(framesToSeconds(60, tb)).toBe(2);
  });

  it('formats SMPTE-ish timecode', () => {
    expect(formatTimecode(0, tb)).toBe('00:00:00:00');
    expect(formatTimecode(90, tb)).toBe('00:00:03:00');
    expect(formatTimecode(91, tb)).toBe('00:00:03:01');
    expect(formatTimecode(30 * 60 * 60 + 30 * 61 + 5, tb)).toBe('01:01:01:05');
  });
});

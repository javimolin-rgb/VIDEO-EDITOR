import { describe, expect, it } from 'vitest';
import { transcriptToCues } from './transcriptToCaptions';
import type { TranscriptResult } from './types';

const result: TranscriptResult = {
  language: 'en',
  modelId: 'whisper-tiny-en',
  createdAt: 0,
  segments: [
    {
      id: 's1',
      startSec: 0,
      endSec: 2,
      text: 'hello there world',
      words: [
        { text: 'hello', startSec: 0, endSec: 0.5 },
        { text: 'there', startSec: 0.5, endSec: 1 },
        { text: 'world', startSec: 1, endSec: 2 },
      ],
    },
  ],
};

describe('transcriptToCues', () => {
  it('applies the timeline offset in frames', () => {
    const cues = transcriptToCues(result, { offsetSec: 10, fps: 30, maxCharsPerLine: 100 });
    expect(cues).toHaveLength(1);
    expect(cues[0]!.startFrame).toBe(300); // 10s
    expect(cues[0]!.endFrame).toBe(360); // 12s
    expect(cues[0]!.text).toBe('hello there world');
    expect(cues[0]!.words?.[0]).toEqual({ text: 'hello', startFrame: 300, endFrame: 315 });
  });

  it('wraps long segments into multiple cues at the char limit', () => {
    const cues = transcriptToCues(result, { offsetSec: 0, fps: 30, maxCharsPerLine: 8 });
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]!.startFrame).toBeLessThan(cues[1]!.startFrame);
  });
});

import { describe, expect, it } from 'vitest';
import { parseCaptions } from './captions';

const fps = 30;

describe('parseCaptions', () => {
  it('parses SRT with comma milliseconds', () => {
    const srt = `1
00:00:00,000 --> 00:00:02,000
Hello world

2
00:00:02,500 --> 00:00:04,000
Second line`;
    const { cues, format } = parseCaptions(srt, fps);
    expect(format).toBe('srt');
    expect(cues).toHaveLength(2);
    expect(cues[0]!.startFrame).toBe(0);
    expect(cues[0]!.endFrame).toBe(60);
    expect(cues[0]!.text).toBe('Hello world');
    expect(cues[1]!.startFrame).toBe(75);
  });

  it('parses WebVTT and strips tags', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
<v Roger>Some <b>bold</b> text`;
    const { cues, format } = parseCaptions(vtt, fps);
    expect(format).toBe('vtt');
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Some bold text');
    expect(cues[0]!.startFrame).toBe(30);
  });

  it('extracts inline word timings for karaoke', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
one<00:00:00.500>two<00:00:01.000>three`;
    const { cues } = parseCaptions(vtt, fps);
    const words = cues[0]!.words!;
    expect(words.map((w) => w.text)).toEqual(['one', 'two', 'three']);
    expect(words[1]!.startFrame).toBe(15);
    expect(words[0]!.endFrame).toBe(words[1]!.startFrame);
  });

  it('returns nothing for junk input', () => {
    expect(parseCaptions('not a caption file', fps).cues).toHaveLength(0);
  });
});

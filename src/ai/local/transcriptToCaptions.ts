/**
 * Turn a local transcript into timeline caption cues (spec §43, §50, §51).
 * Splits each segment into reading-length lines, keeps word timings for the
 * karaoke style, and shifts times by the clip's timeline offset.
 */

import { newId } from '@/lib/id';
import { secondsToFrames } from '@/lib/time';
import type { CaptionCue } from '@/domain/types';
import type { TranscriptResult } from './types';

export interface ToCuesOptions {
  /** Seconds to add so cue times land on the project timeline. */
  offsetSec: number;
  fps: number;
  maxCharsPerLine: number;
}

export function transcriptToCues(result: TranscriptResult, opts: ToCuesOptions): CaptionCue[] {
  const cues: CaptionCue[] = [];

  for (const seg of result.segments) {
    if (seg.words.length === 0) {
      cues.push({
        id: newId('marker'),
        startFrame: secondsToFrames(seg.startSec + opts.offsetSec, { fps: opts.fps, dropFrame: false }),
        endFrame: secondsToFrames(seg.endSec + opts.offsetSec, { fps: opts.fps, dropFrame: false }),
        text: seg.text,
      });
      continue;
    }

    let line: typeof seg.words = [];
    const flush = () => {
      if (line.length === 0) return;
      const start = line[0]!.startSec + opts.offsetSec;
      const end = line[line.length - 1]!.endSec + opts.offsetSec;
      cues.push({
        id: newId('marker'),
        startFrame: secondsToFrames(start, { fps: opts.fps, dropFrame: false }),
        endFrame: secondsToFrames(end, { fps: opts.fps, dropFrame: false }),
        text: line.map((w) => w.text).join(' ').replace(/\s+([,.!?;:])/g, '$1'),
        words: line.map((w) => ({
          text: w.text,
          startFrame: secondsToFrames(w.startSec + opts.offsetSec, { fps: opts.fps, dropFrame: false }),
          endFrame: secondsToFrames(w.endSec + opts.offsetSec, { fps: opts.fps, dropFrame: false }),
        })),
      });
      line = [];
    };

    let len = 0;
    for (const w of seg.words) {
      if (len + w.text.length + 1 > opts.maxCharsPerLine && line.length > 0) flush();
      line.push(w);
      len = line.reduce((n, x) => n + x.text.length + 1, 0);
    }
    flush();
  }

  return cues.sort((a, b) => a.startFrame - b.startFrame);
}

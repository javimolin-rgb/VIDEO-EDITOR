import { describe, expect, it } from 'vitest';
import { detectSilences, defaultSilenceParams, totalSilenceSec } from './silence';

/** Minimal AudioBuffer stand-in with the fields detectSilences reads. */
function fakeBuffer(mono: Float32Array, sampleRate: number): AudioBuffer {
  return {
    sampleRate,
    length: mono.length,
    numberOfChannels: 1,
    duration: mono.length / sampleRate,
    getChannelData: () => mono,
  } as unknown as AudioBuffer;
}

function tone(samples: number, amp: number): Float32Array {
  const a = new Float32Array(samples);
  for (let i = 0; i < samples; i++) a[i] = Math.sin(i * 0.2) * amp;
  return a;
}

describe('detectSilences', () => {
  const sr = 16000;

  it('finds a quiet gap between two loud sections', () => {
    const loud = tone(sr, 0.5); // 1s
    const quiet = new Float32Array(sr); // 1s of silence
    const pcm = new Float32Array(loud.length * 2 + quiet.length);
    pcm.set(loud, 0);
    pcm.set(quiet, loud.length);
    pcm.set(loud, loud.length + quiet.length);

    const regions = detectSilences(fakeBuffer(pcm, sr), defaultSilenceParams('balanced'));
    expect(regions.length).toBe(1);
    expect(regions[0]!.startSec).toBeGreaterThan(0.9);
    expect(regions[0]!.endSec).toBeLessThan(2.1);
    expect(totalSilenceSec(regions)).toBeGreaterThan(0.5);
  });

  it('reports nothing for continuous loud audio', () => {
    const regions = detectSilences(fakeBuffer(tone(sr * 2, 0.5), sr), defaultSilenceParams('balanced'));
    expect(regions).toHaveLength(0);
  });

  it('aggressive mode cuts shorter gaps than conservative', () => {
    const loud = tone(sr, 0.5);
    const quiet = new Float32Array(Math.round(sr * 0.45));
    const pcm = new Float32Array(loud.length * 2 + quiet.length);
    pcm.set(loud, 0);
    pcm.set(quiet, loud.length);
    pcm.set(loud, loud.length + quiet.length);

    expect(detectSilences(fakeBuffer(pcm, sr), defaultSilenceParams('aggressive')).length).toBe(1);
    expect(detectSilences(fakeBuffer(pcm, sr), defaultSilenceParams('conservative')).length).toBe(0);
  });
});

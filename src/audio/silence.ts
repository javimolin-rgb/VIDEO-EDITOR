/**
 * Silence / low-energy detection (spec §47, §48). Pure DSP over decoded PCM —
 * no model, fully local, deterministic. Produces regions (in seconds relative
 * to the buffer) that are quiet enough to cut.
 */

export type SilenceMode = 'conservative' | 'balanced' | 'aggressive';

export interface SilenceParams {
  mode: SilenceMode;
  /** Minimum length of a silent gap to report, seconds. */
  minSilenceSec: number;
  /** Keep this much sound-adjacent padding on each side, seconds. */
  padSec: number;
}

export interface SilenceRegion {
  startSec: number;
  endSec: number;
}

const MODE_DEFAULTS: Record<SilenceMode, { thresholdDb: number; minSilenceSec: number; padSec: number }> = {
  conservative: { thresholdDb: -45, minSilenceSec: 0.9, padSec: 0.15 },
  balanced: { thresholdDb: -38, minSilenceSec: 0.6, padSec: 0.1 },
  aggressive: { thresholdDb: -32, minSilenceSec: 0.35, padSec: 0.06 },
};

export function defaultSilenceParams(mode: SilenceMode): SilenceParams {
  const d = MODE_DEFAULTS[mode];
  return { mode, minSilenceSec: d.minSilenceSec, padSec: d.padSec };
}

/**
 * RMS-per-window silence scan. `windowSec` ~20 ms gives smooth energy without
 * chopping words.
 */
export function detectSilences(
  buffer: AudioBuffer,
  params: SilenceParams,
  windowSec = 0.02,
): SilenceRegion[] {
  const sr = buffer.sampleRate;
  const windowSamples = Math.max(1, Math.round(windowSec * sr));
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  const { thresholdDb } = MODE_DEFAULTS[params.mode];
  const thresholdAmp = Math.pow(10, thresholdDb / 20);

  const regions: SilenceRegion[] = [];
  let runStart: number | null = null;

  for (let i = 0; i < length; i += windowSamples) {
    const end = Math.min(length, i + windowSamples);
    let sumSq = 0;
    let n = 0;
    for (let s = i; s < end; s++) {
      for (let c = 0; c < channels; c++) {
        const v = data[c]![s]!;
        sumSq += v * v;
        n++;
      }
    }
    const rms = Math.sqrt(sumSq / Math.max(1, n));
    const quiet = rms < thresholdAmp;

    if (quiet && runStart === null) runStart = i;
    if (!quiet && runStart !== null) {
      pushRegion(regions, runStart / sr, i / sr, params);
      runStart = null;
    }
  }
  if (runStart !== null) pushRegion(regions, runStart / sr, length / sr, params);

  return regions;
}

function pushRegion(out: SilenceRegion[], startSec: number, endSec: number, params: SilenceParams): void {
  const dur = endSec - startSec;
  if (dur < params.minSilenceSec) return;
  const s = startSec + params.padSec;
  const e = endSec - params.padSec;
  if (e - s <= 0.05) return;
  out.push({ startSec: s, endSec: e });
}

/** Total seconds that would be removed. */
export function totalSilenceSec(regions: SilenceRegion[]): number {
  return regions.reduce((sum, r) => sum + (r.endSec - r.startSec), 0);
}

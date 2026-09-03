/**
 * Shot / cut detection (spec §176). Pure frame-difference over a downscaled
 * luma histogram — no model, runs locally. Returns cut positions in seconds
 * relative to the media.
 */

export interface ShotDetectParams {
  /** 0..1; higher = fewer, stronger cuts. */
  sensitivity: number;
  /** Frames per second to sample the source at. */
  sampleFps: number;
}

export const DEFAULT_SHOT_PARAMS: ShotDetectParams = { sensitivity: 0.45, sampleFps: 4 };

const GRID = 32;
const BINS = 16;

function histogram(ctx: CanvasRenderingContext2D): Float32Array {
  const { data } = ctx.getImageData(0, 0, GRID, GRID);
  const h = new Float32Array(BINS);
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!) / 255;
    const bin = Math.min(BINS - 1, Math.floor(luma * BINS));
    h[bin] = (h[bin] ?? 0) + 1;
  }
  const total = GRID * GRID;
  for (let b = 0; b < BINS; b++) h[b]! /= total;
  return h;
}

function distance(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  return d / 2; // 0..1
}

/**
 * @param video a loaded <video> element (will be seeked; caller owns it)
 * @param startSec / endSec window within the media to scan
 */
export async function detectShots(
  video: HTMLVideoElement,
  startSec: number,
  endSec: number,
  params: ShotDetectParams = DEFAULT_SHOT_PARAMS,
): Promise<number[]> {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const step = 1 / params.sampleFps;
  const threshold = 0.12 + params.sensitivity * 0.5;
  const cuts: number[] = [];
  let prev: Float32Array | null = null;

  const seek = (t: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
      video.currentTime = t;
      setTimeout(resolve, 300);
    });

  for (let t = startSec; t < endSec; t += step) {
    await seek(t);
    if (!video.videoWidth) continue;
    ctx.drawImage(video, 0, 0, GRID, GRID);
    const hist = histogram(ctx);
    if (prev) {
      const d = distance(prev, hist);
      if (d > threshold) {
        // Avoid double-marking adjacent samples.
        if (cuts.length === 0 || t - cuts[cuts.length - 1]! > step * 1.5) cuts.push(t);
      }
    }
    prev = hist;
  }
  return cuts;
}

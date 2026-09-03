/**
 * Automated quality control for generated clips (spec §78, §137). Never blindly
 * insert output: check it decodes, matches the requested size/duration, isn't
 * all black, and isn't wildly flickering. Returns a score + issues; the UI
 * shows this and lets the user keep or regenerate.
 */

export interface QualityExpectation {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
}

export interface QualityReport {
  score: number; // 0..1
  passed: boolean;
  issues: string[];
  measured: { width: number; height: number; durationSec: number; meanLuma: number; flicker: number };
}

const SAMPLE_FRAMES = 6;

export async function assessGeneration(
  blob: Blob,
  expect: QualityExpectation,
): Promise<QualityReport> {
  const issues: string[] = [];
  if (blob.size < 1024) {
    return {
      score: 0,
      passed: false,
      issues: ['Output file is empty or corrupt.'],
      measured: { width: 0, height: 0, durationSec: 0, meanLuma: 0, flicker: 0 },
    };
  }

  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('decode failed'));
      setTimeout(() => reject(new Error('metadata timeout')), 4000);
    }).catch((e) => {
      issues.push(`Could not decode output (${String(e)}).`);
    });

    const width = video.videoWidth;
    const height = video.videoHeight;
    const durationSec = Number.isFinite(video.duration) ? video.duration : 0;

    if (width && (width !== expect.width || height !== expect.height)) {
      issues.push(`Resolution ${width}×${height} ≠ requested ${expect.width}×${expect.height}.`);
    }
    if (durationSec && Math.abs(durationSec - expect.durationSec) > Math.max(0.5, expect.durationSec * 0.25)) {
      issues.push(`Duration ${durationSec.toFixed(1)}s ≠ requested ${expect.durationSec.toFixed(1)}s.`);
    }

    // Sample frames for luma + flicker.
    let meanLuma = 0;
    let flicker = 0;
    if (width) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const cx = canvas.getContext('2d', { willReadFrequently: true })!;
      const lumas: number[] = [];
      for (let i = 0; i < SAMPLE_FRAMES; i++) {
        const t = ((i + 0.5) / SAMPLE_FRAMES) * (durationSec || 1);
        await seek(video, t);
        cx.drawImage(video, 0, 0, 64, 36);
        const { data } = cx.getImageData(0, 0, 64, 36);
        let sum = 0;
        for (let p = 0; p < data.length; p += 4) {
          sum += 0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!;
        }
        lumas.push(sum / (64 * 36) / 255);
      }
      meanLuma = lumas.reduce((a, b) => a + b, 0) / lumas.length;
      for (let i = 1; i < lumas.length; i++) flicker += Math.abs(lumas[i]! - lumas[i - 1]!);
      flicker /= lumas.length - 1;

      if (meanLuma < 0.02) issues.push('Frames are almost entirely black.');
      if (flicker > 0.35) issues.push('Severe brightness flicker between frames.');
    }

    let score = 1;
    score -= issues.length * 0.28;
    if (meanLuma < 0.05) score -= 0.3;
    score = Math.max(0, Math.min(1, score));

    return {
      score,
      passed: score >= 0.5,
      issues,
      measured: { width, height, durationSec, meanLuma, flicker },
    };
  } finally {
    // Cancel any in-flight range request before revoking, to avoid noisy 404s.
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    try {
      video.currentTime = Math.max(0, t);
    } catch {
      resolve();
    }
    setTimeout(resolve, 500);
  });
}

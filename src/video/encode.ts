/**
 * Standalone video-only frame encoder (spec §13). Used by the generative
 * engine to turn a canvas animation into a real file. Prefers WebCodecs
 * (H.264 MP4 via the bundled `mp4-muxer`); falls back to `MediaRecorder`
 * (WebM) when WebCodecs is unavailable.
 *
 * The final-render exporter (`src/export/exporter.ts`) keeps its own path
 * because it also interleaves an audio track; this helper is deliberately
 * simpler.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createLogger } from '@/lib/logger';

const log = createLogger('video');
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EncodeResult {
  blob: Blob;
  mimeType: string;
  format: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export interface EncodeOptions {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  /** 0..1 → bitrate. */
  quality: number;
  /** Draw frame `i` onto `ctx`. May be async. */
  drawFrame: (ctx: CanvasRenderingContext2D, frame: number) => void | Promise<void>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

async function pickAvcCodec(width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of ['avc1.640834', 'avc1.4D4028', 'avc1.42E01F']) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 6_000_000 });
      if (s.supported) return codec;
    } catch {
      /* next */
    }
  }
  return null;
}

function bitrateFor(width: number, height: number, quality: number): number {
  const px = Math.max(width * height, 1);
  return Math.round(((2_500_000 + quality * 10_000_000) * px) / (1920 * 1080));
}

export async function encodeCanvasSequence(opts: EncodeOptions): Promise<EncodeResult> {
  const { width, height, fps, totalFrames, quality } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');

  const durationSec = totalFrames / fps;
  const codec = await pickAvcCodec(width, height);

  if (codec) {
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      fastStart: 'in-memory',
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => log.error('VideoEncoder error', e),
    });
    encoder.configure({ codec, width, height, bitrate: bitrateFor(width, height, quality), framerate: fps });

    for (let i = 0; i < totalFrames; i++) {
      if (opts.signal?.aborted) throw new Error('Generation cancelled');
      await opts.drawFrame(ctx, i);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i / fps) * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      encoder.encode(frame, { keyFrame: i % (Math.round(fps) * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 10) await delay(4);
      opts.onProgress?.(i / totalFrames);
    }
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    return { blob, mimeType: 'video/mp4', format: 'mp4', width, height, fps, durationSec };
  }

  // WebM fallback — realtime capture.
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
    (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
  ) ?? 'video/webm';
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.max(500_000, bitrateFor(width, height, quality)),
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
  });
  recorder.start(200);
  const frameMs = 1000 / fps;
  const start = performance.now();
  for (let i = 0; i < totalFrames; i++) {
    if (opts.signal?.aborted) {
      recorder.stop();
      throw new Error('Generation cancelled');
    }
    await opts.drawFrame(ctx, i);
    opts.onProgress?.(i / totalFrames);
    const target = start + (i + 1) * frameMs;
    const wait = target - performance.now();
    if (wait > 0) await delay(wait);
  }
  recorder.stop();
  const blob = await done;
  stream.getTracks().forEach((t) => t.stop());
  return { blob, mimeType: mime, format: 'webm', width, height, fps, durationSec };
}

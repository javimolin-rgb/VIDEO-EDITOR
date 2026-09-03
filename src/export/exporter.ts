/**
 * Final render / export (spec §13, §115, §116). Preview and final render are
 * separate; the final render is frame-exact and uses the shared compositor
 * (spec §168) so it honours transform, colour, effects, transitions,
 * adjustment layers and captions.
 *
 * Two paths:
 *  - **MP4 / WebCodecs** (preferred): offline, faster-than-realtime,
 *    frame-accurate. `VideoEncoder` (H.264) + `AudioEncoder` (AAC) muxed with
 *    the bundled `mp4-muxer` (no download — spec §8).
 *  - **WebM / MediaRecorder** (fallback when WebCodecs is unavailable):
 *    real-time canvas + audio capture.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { createLogger } from '@/lib/logger';
import { framesToSeconds } from '@/lib/time';
import { clipTimelineRange, type Asset, type VideoProject } from '@/domain/types';
import { renderFrame } from '@/video/compositor';
import { ExportMediaPool } from './mediaPool';
import { renderAudioMix } from './audioMixer';

const log = createLogger('export');

export type ExportFormat = 'mp4' | 'webm';

export interface ExportOptions {
  quality: number; // 0..1
  fps?: number;
  maxDurationSec?: number;
  format?: ExportFormat;
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding-audio' | 'finalizing';
  progress: number;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  format: ExportFormat;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function webCodecsAvailable(width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null;
  for (const codec of ['avc1.640834', 'avc1.4D4028', 'avc1.42E01F']) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 8_000_000 });
      if (support.supported) return codec;
    } catch {
      /* try next */
    }
  }
  return null;
}

function contentFrames(project: VideoProject): number {
  const end = project.timeline.clips.reduce((m, c) => Math.max(m, clipTimelineRange(c).end), 0);
  return Math.max(1, end || project.timeline.durationFrames);
}

function bitrateFor(width: number, height: number, quality: number): number {
  const pixels = Math.max(width * height, 1);
  const perMp = 3_000_000 + quality * 14_000_000;
  return Math.round((perMp * pixels) / (1920 * 1080));
}

export async function exportTimeline(
  project: VideoProject,
  assets: Asset[],
  opts: ExportOptions,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const fps = opts.fps ?? project.settings.fps;
  const { width, height } = project.settings.resolution;

  const totalFrames = opts.maxDurationSec
    ? Math.min(contentFrames(project), Math.ceil(opts.maxDurationSec * fps))
    : contentFrames(project);
  const durationSec = framesToSeconds(totalFrames, project.timeline.timebase);

  onProgress({ phase: 'preparing', progress: 0, message: 'Loading media…' });

  const visualAssetIds = new Set(
    project.timeline.clips
      .filter((c) => {
        const t = project.timeline.tracks.find((x) => x.id === c.trackId);
        return t && t.kind !== 'audio';
      })
      .map((c) => c.assetId),
  );
  const pool = new ExportMediaPool();
  await pool.load(assets, visualAssetIds);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    pool.dispose();
    throw new Error('2D canvas context unavailable');
  }

  const wanted = opts.format ?? 'mp4';
  const codec = wanted === 'mp4' ? await webCodecsAvailable(width, height) : null;

  try {
    if (wanted === 'mp4' && codec) {
      return await renderMp4({
        project,
        assets,
        pool,
        ctx,
        canvas,
        codec,
        fps,
        width,
        height,
        totalFrames,
        durationSec,
        quality: opts.quality,
        onProgress,
        signal,
      });
    }
    return await renderWebm({
      project,
      assets,
      pool,
      ctx,
      canvas,
      fps,
      width,
      height,
      totalFrames,
      durationSec,
      quality: opts.quality,
      onProgress,
      signal,
    });
  } finally {
    pool.dispose();
  }
}

interface PathArgs {
  project: VideoProject;
  assets: Asset[];
  pool: ExportMediaPool;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  durationSec: number;
  quality: number;
  onProgress: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

// ─── MP4 / WebCodecs ────────────────────────────────────────────────────────

async function renderMp4(args: PathArgs & { codec: string }): Promise<ExportResult> {
  const { project, assets, pool, ctx, canvas, codec, fps, width, height, totalFrames, durationSec, quality, onProgress, signal } = args;

  const sampleRate = 48_000;
  onProgress({ phase: 'preparing', progress: 0.1, message: 'Mixing audio…' });
  const audioBuffer = await renderAudioMix(project, assets, sampleRate, durationSec);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    ...(audioBuffer ? { audio: { codec: 'aac', sampleRate, numberOfChannels: 2 } } : {}),
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => log.error('VideoEncoder error', e),
  });
  videoEncoder.configure({
    codec,
    width,
    height,
    bitrate: bitrateFor(width, height, quality),
    framerate: fps,
  });

  onProgress({ phase: 'rendering', progress: 0, message: 'Rendering frames…' });
  const grainSeed = 12345;
  for (let i = 0; i < totalFrames; i++) {
    if (signal?.aborted) throw new Error('Export cancelled');
    await renderFrame(ctx, project, i, pool, { awaitSeek: true, grainSeed });
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i / fps) * 1_000_000), duration: Math.round(1_000_000 / fps) });
    videoEncoder.encode(frame, { keyFrame: i % (Math.round(fps) * 2) === 0 });
    frame.close();
    while (videoEncoder.encodeQueueSize > 10) await delay(4);
    if (i % 6 === 0) {
      onProgress({
        phase: 'rendering',
        progress: (i / totalFrames) * 0.82,
        message: `Rendering frame ${i} / ${totalFrames}`,
      });
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();

  if (audioBuffer) {
    onProgress({ phase: 'encoding-audio', progress: 0.86, message: 'Encoding audio…' });
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => log.error('AudioEncoder error', e),
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 192_000 });

    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
    const chunk = 4096;
    for (let off = 0; off < audioBuffer.length; off += chunk) {
      const n = Math.min(chunk, audioBuffer.length - off);
      const planar = new Float32Array(n * 2);
      planar.set(ch0.subarray(off, off + n), 0);
      planar.set(ch1.subarray(off, off + n), n);
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((off / sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(data);
      data.close();
      while (audioEncoder.encodeQueueSize > 10) await delay(4);
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  onProgress({ phase: 'finalizing', progress: 0.96, message: 'Muxing MP4…' });
  muxer.finalize();
  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  log.info('MP4 export complete', { bytes: blob.size, durationSec, codec });
  return { blob, mimeType: 'video/mp4', format: 'mp4', durationSec, width, height, fps };
}

// ─── WebM / MediaRecorder (realtime fallback) ───────────────────────────────

function pickWebmMime(): string {
  for (const c of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

async function renderWebm(args: PathArgs): Promise<ExportResult> {
  const { project, assets, pool, ctx, canvas, fps, width, height, totalFrames, durationSec, quality, onProgress, signal } = args;

  onProgress({ phase: 'preparing', progress: 0.1, message: 'Mixing audio…' });
  const sampleRate = 48_000;
  const audioBuffer = await renderAudioMix(project, assets, sampleRate, durationSec);

  const AudioCtor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const actx = new AudioCtor();
  const dest = actx.createMediaStreamDestination();
  let bufferSource: AudioBufferSourceNode | null = null;
  if (audioBuffer) {
    bufferSource = actx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(dest);
  }

  const canvasStream = canvas.captureStream(fps);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mimeType = pickWebmMime();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: Math.max(600_000, bitrateFor(width, height, quality)),
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
  });

  onProgress({ phase: 'rendering', progress: 0, message: 'Rendering (real time)…' });
  recorder.start(200);
  bufferSource?.start();

  const frameMs = 1000 / fps;
  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    const step = async () => {
      if (signal?.aborted) return resolve();
      const target = Math.min(totalFrames, Math.floor((performance.now() - startedAt) / frameMs));
      await renderFrame(ctx, project, target, pool, { awaitSeek: false, grainSeed: (target % 60) + 1 });
      onProgress({
        phase: 'rendering',
        progress: Math.min(0.99, target / totalFrames),
        message: `Rendering ${target} / ${totalFrames}`,
      });
      if (target >= totalFrames) return resolve();
      requestAnimationFrame(() => void step());
    };
    void step();
  });

  onProgress({ phase: 'finalizing', progress: 0.98, message: 'Finalizing…' });
  recorder.stop();
  const blob = await done;
  bufferSource?.stop();
  void actx.close();
  canvasStream.getTracks().forEach((t) => t.stop());

  log.info('WebM export complete', { bytes: blob.size, durationSec, mimeType });
  return { blob, mimeType, format: 'webm', durationSec, width, height, fps };
}

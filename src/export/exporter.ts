/**
 * Final render / export (spec §13, §115, §116). Phase 1 implements a real,
 * non-faked real-time renderer:
 *
 *  - all visible video/image clips are composited to a canvas at project
 *    resolution, respecting track order, opacity and fades;
 *  - audio-bearing clips are mixed through a WebAudio graph with per-clip
 *    gain and fades;
 *  - the canvas + audio streams are captured by MediaRecorder → WebM.
 *
 * Not yet: effects, transitions, keyframes, colour, MP4 muxing (Phase 2 adds
 * an FFmpeg/WebCodecs path — spec §13 keeps preview and final render
 * separate). The UI labels this honestly.
 */

import { createLogger } from '@/lib/logger';
import { framesToSeconds, type Frame } from '@/lib/time';
import { clipTimelineRange, type Asset, type Clip, type VideoProject } from '@/domain/types';
import { getAssetBlob } from '@/storage/repository';

const log = createLogger('export');

export interface ExportOptions {
  /** 0..1 quality hint mapped to bitrate. */
  quality: number;
  /** Override output fps; defaults to project fps. */
  fps?: number;
  /** Hard cap so a runaway timeline can't record forever. */
  maxDurationSec?: number;
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'finalizing';
  /** 0..1 */
  progress: number;
  message: string;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

interface LoadedVideo {
  el: HTMLVideoElement;
  ready: boolean;
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
  const assetById = new Map(assets.map((a) => [a.id, a]));

  onProgress({ phase: 'preparing', progress: 0, message: 'Loading media…' });

  const videoTracks = project.timeline.tracks
    .filter((t) => (t.kind === 'video' || t.kind === 'text' || t.kind === 'adjustment') && !t.hidden)
    .sort((a, b) => b.index - a.index); // paint lowest priority first
  const audioTracks = project.timeline.tracks.filter((t) => t.kind === 'audio' && !t.muted);

  const visualClips = project.timeline.clips.filter((c) =>
    videoTracks.some((t) => t.id === c.trackId),
  );
  const audioClips = project.timeline.clips.filter((c) =>
    audioTracks.some((t) => t.id === c.trackId),
  );

  const contentEnd = project.timeline.clips.reduce(
    (max, c) => Math.max(max, clipTimelineRange(c).end),
    0,
  );
  const totalFrames = Math.max(1, contentEnd || project.timeline.durationFrames);
  const cappedFrames = opts.maxDurationSec
    ? Math.min(totalFrames, Math.ceil(opts.maxDurationSec * fps))
    : totalFrames;
  const durationSec = framesToSeconds(cappedFrames, project.timeline.timebase);

  // ── Canvas ────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');

  // ── Load unique video/image elements ─────────────────────────────────────
  const objectUrls: string[] = [];
  const videos = new Map<string, LoadedVideo>();
  const images = new Map<string, HTMLImageElement>();

  const uniqueAssetIds = new Set(visualClips.map((c) => c.assetId));
  for (const id of uniqueAssetIds) {
    const asset = assetById.get(id);
    if (!asset?.blobKey) continue;
    const blob = await getAssetBlob(asset.blobKey);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    if (asset.kind === 'image') {
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => undefined);
      images.set(id, img);
    } else {
      const el = document.createElement('video');
      el.src = url;
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      await new Promise<void>((resolve) => {
        el.onloadeddata = () => resolve();
        el.onerror = () => resolve();
      });
      videos.set(id, { el, ready: true });
    }
  }

  // ── Audio graph ──────────────────────────────────────────────────────────
  const AudioCtor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtor();
  const audioDest = audioCtx.createMediaStreamDestination();
  const decodedAudio = new Map<string, AudioBuffer>();

  for (const id of new Set(audioClips.map((c) => c.assetId))) {
    const asset = assetById.get(id);
    if (!asset?.blobKey) continue;
    const blob = await getAssetBlob(asset.blobKey);
    if (!blob) continue;
    try {
      const buf = await audioCtx.decodeAudioData(await blob.arrayBuffer());
      decodedAudio.set(id, buf);
    } catch (e) {
      log.warn('audio decode failed for export', { id, e });
    }
  }

  // ── Recorder ─────────────────────────────────────────────────────────────
  const canvasStream = canvas.captureStream(fps);
  const mixedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);
  const mimeType = pickMimeType();
  const bitrate = Math.round(
    (1_500_000 + opts.quality * 10_000_000) * (Math.max(width * height, 1) / (1920 * 1080)),
  );
  const recorder = new MediaRecorder(mixedStream, {
    mimeType,
    videoBitsPerSecond: Math.max(500_000, bitrate),
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const cleanup = () => {
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
    videos.forEach((v) => {
      v.el.pause();
      v.el.src = '';
    });
    void audioCtx.close();
    canvasStream.getTracks().forEach((t) => t.stop());
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
  });

  // ── Schedule audio ───────────────────────────────────────────────────────
  const startTime = audioCtx.currentTime + 0.12;
  for (const clip of audioClips) {
    const buf = decodedAudio.get(clip.assetId);
    if (!buf) continue;
    scheduleClipAudio(audioCtx, audioDest, buf, clip, startTime, fps);
  }

  // ── Render loop ──────────────────────────────────────────────────────────
  onProgress({ phase: 'rendering', progress: 0, message: 'Rendering…' });
  recorder.start(250);

  const frameDurationMs = 1000 / fps;
  let frame = 0;
  const renderStartedAt = performance.now();

  await new Promise<void>((resolve) => {
    const step = async () => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const elapsedMs = performance.now() - renderStartedAt;
      const targetFrame = Math.min(cappedFrames, Math.floor(elapsedMs / frameDurationMs));

      // Draw the most recent target frame.
      await drawFrame(ctx, targetFrame, {
        width,
        height,
        background: project.settings.backgroundColor,
        visualClips,
        videoTracks,
        videos,
        images,
        project,
        fps,
      });
      frame = targetFrame;
      onProgress({
        phase: 'rendering',
        progress: Math.min(0.99, frame / cappedFrames),
        message: `Rendering frame ${frame} / ${cappedFrames}`,
      });

      if (frame >= cappedFrames) {
        resolve();
        return;
      }
      requestAnimationFrame(() => void step());
    };
    void step();
  });

  onProgress({ phase: 'finalizing', progress: 0.99, message: 'Finalizing file…' });
  recorder.stop();
  const blob = await finished;
  cleanup();

  log.info('export complete', { bytes: blob.size, durationSec, mimeType });
  return { blob, mimeType, durationSec, width, height, fps };
}

interface DrawCtx {
  width: number;
  height: number;
  background: string;
  visualClips: Clip[];
  videoTracks: { id: string; index: number }[];
  videos: Map<string, LoadedVideo>;
  images: Map<string, HTMLImageElement>;
  project: VideoProject;
  fps: number;
}

async function drawFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  d: DrawCtx,
): Promise<void> {
  ctx.fillStyle = d.background;
  ctx.fillRect(0, 0, d.width, d.height);

  const active = d.visualClips
    .filter((c) => {
      const r = clipTimelineRange(c);
      return frame >= r.start && frame < r.end;
    })
    .sort((a, b) => {
      const ta = d.videoTracks.find((t) => t.id === a.trackId)?.index ?? 0;
      const tb = d.videoTracks.find((t) => t.id === b.trackId)?.index ?? 0;
      return tb - ta; // higher index first (painted under)
    });

  for (const clip of active) {
    const r = clipTimelineRange(clip);
    const localFrame = frame - r.start;
    const sourceSec =
      framesToSeconds(clip.sourceIn + Math.round(localFrame * clip.speed), d.project.timeline.timebase);

    let alpha = clip.opacity;
    if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) {
      alpha *= localFrame / clip.fadeInFrames;
    }
    const tail = r.end - frame;
    if (clip.fadeOutFrames > 0 && tail < clip.fadeOutFrames) {
      alpha *= tail / clip.fadeOutFrames;
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    const img = d.images.get(clip.assetId);
    const vid = d.videos.get(clip.assetId);
    if (img && img.naturalWidth > 0) {
      drawContain(ctx, img, img.naturalWidth, img.naturalHeight, d.width, d.height);
    } else if (vid) {
      if (Math.abs(vid.el.currentTime - sourceSec) > 0.05) {
        await seekVideo(vid.el, sourceSec);
      }
      if (vid.el.videoWidth > 0) {
        drawContain(ctx, vid.el, vid.el.videoWidth, vid.el.videoHeight, d.width, d.height);
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): void {
  const scale = Math.min(dw / sw, dh / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.drawImage(src, (dw - w) / 2, (dh - h) / 2, w, h);
}

function seekVideo(el: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      el.removeEventListener('seeked', onSeeked);
      resolve();
    };
    el.addEventListener('seeked', onSeeked);
    try {
      el.currentTime = Math.max(0, timeSec);
    } catch {
      resolve();
    }
    setTimeout(resolve, 200); // don't stall the loop if seeked never fires
  });
}

function scheduleClipAudio(
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode,
  buffer: AudioBuffer,
  clip: Clip,
  baseTime: number,
  fps: number,
): void {
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = clip.speed;

  const gain = audioCtx.createGain();
  const r = clipTimelineRange(clip);
  const clipStartSec = r.start / fps;
  const clipLenSec = (r.end - r.start) / fps;
  const offsetSec = clip.sourceIn / fps;
  const when = baseTime + clipStartSec;

  gain.gain.setValueAtTime(clip.gain, when);
  if (clip.fadeInFrames > 0) {
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(clip.gain, when + clip.fadeInFrames / fps);
  }
  if (clip.fadeOutFrames > 0) {
    const fadeStart = when + clipLenSec - clip.fadeOutFrames / fps;
    gain.gain.setValueAtTime(clip.gain, Math.max(when, fadeStart));
    gain.gain.linearRampToValueAtTime(0, when + clipLenSec);
  }

  src.connect(gain).connect(dest);
  try {
    src.start(when, Math.max(0, offsetSec), clipLenSec);
  } catch {
    // ignore invalid schedule
  }
}

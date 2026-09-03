/**
 * Sample frames from an asset for local analysis (look matching, continuity,
 * extend). All on-device; nothing is uploaded.
 */

import type { Asset } from '@/domain/types';
import { getAssetBlob } from '@/storage/repository';
import { averageStats, statsFromImageData, type LookStats } from '@/ai/style';

async function loadVideo(blob: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('video load failed'));
    setTimeout(() => reject(new Error('video load timeout')), 5000);
  });
  return { video, url };
}

function releaseVideo(video: HTMLVideoElement, url: string): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
  URL.revokeObjectURL(url);
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
    setTimeout(resolve, 400);
  });
}

const W = 64;
const H = 36;

export async function sampleLook(
  asset: Asset,
  opts: { startSec?: number; endSec?: number; frames?: number } = {},
): Promise<LookStats | null> {
  if (!asset.blobKey) return null;
  const blob = await getAssetBlob(asset.blobKey);
  if (!blob) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  if (asset.kind === 'image') {
    const bmp = await createImageBitmap(blob).catch(() => null);
    if (!bmp) return null;
    ctx.drawImage(bmp, 0, 0, W, H);
    return statsFromImageData(ctx.getImageData(0, 0, W, H).data);
  }

  const loaded = await loadVideo(blob).catch(() => null);
  if (!loaded) return null;
  const { video, url } = loaded;
  try {
    const dur = Number.isFinite(video.duration) ? video.duration : 1;
    const start = opts.startSec ?? 0;
    const end = Math.min(dur, opts.endSec ?? dur);
    const count = opts.frames ?? 5;
    const stats: LookStats[] = [];
    for (let i = 0; i < count; i++) {
      const t = start + ((i + 0.5) / count) * Math.max(0.01, end - start);
      await seek(video, t);
      if (!video.videoWidth) continue;
      ctx.drawImage(video, 0, 0, W, H);
      stats.push(statsFromImageData(ctx.getImageData(0, 0, W, H).data));
    }
    return stats.length ? averageStats(stats) : null;
  } finally {
    releaseVideo(video, url);
  }
}

/** Extract a still (`which`) of a video asset as an ImageBitmap. */
export async function extractFrame(
  asset: Asset,
  which: 'first' | 'last' | number,
): Promise<ImageBitmap | null> {
  if (!asset.blobKey) return null;
  const blob = await getAssetBlob(asset.blobKey);
  if (!blob) return null;
  if (asset.kind === 'image') return createImageBitmap(blob).catch(() => null);

  const loaded = await loadVideo(blob).catch(() => null);
  if (!loaded) return null;
  const { video, url } = loaded;
  try {
    const dur = Number.isFinite(video.duration) ? video.duration : 1;
    const t = which === 'first' ? 0.02 : which === 'last' ? Math.max(0, dur - 0.05) : which;
    await seek(video, t);
    if (!video.videoWidth) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d')!.drawImage(video, 0, 0);
    return createImageBitmap(c).catch(() => null);
  } finally {
    releaseVideo(video, url);
  }
}

/**
 * Media probing for import (spec §14, §15). Uses only browser-native APIs:
 * <video>/<img> for dimensions and duration, canvas for a poster frame,
 * WebAudio for a waveform sketch. Fields the browser cannot report honestly
 * (exact codec string, container fps) are left null rather than guessed
 * (spec §159 — no fake capabilities).
 */

import type { AssetKind, MediaMeta } from '@/domain/types';

export interface ProbeResult {
  kind: AssetKind;
  meta: MediaMeta;
  thumbnailDataUrl: string | null;
}

const THUMB_MAX = 320;

export function kindFromMime(mime: string, filename: string): AssetKind {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['wav', 'mp3', 'aac', 'm4a', 'ogg', 'flac'].includes(ext)) {
    return 'audio';
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return 'image';
  }
  if (['srt', 'vtt', 'ass'].includes(ext)) return 'caption';
  return 'video';
}

function baseMeta(file: File): MediaMeta {
  return {
    durationSec: null,
    width: null,
    height: null,
    fps: null,
    codec: null,
    audioChannels: null,
    sampleRate: null,
    rotation: null,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
  };
}

function fitThumb(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function probeImage(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = url;
    });
    const { w, h } = fitThumb(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    let thumb: string | null = null;
    if (ctx) {
      ctx.drawImage(img, 0, 0, w, h);
      thumb = canvas.toDataURL('image/jpeg', 0.72);
    }
    return {
      kind: 'image',
      meta: { ...baseMeta(file), width: img.naturalWidth, height: img.naturalHeight, durationSec: null },
      thumbnailDataUrl: thumb,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function probeVideo(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('video metadata load failed'));
    });

    const meta: MediaMeta = {
      ...baseMeta(file),
      durationSec: Number.isFinite(video.duration) ? video.duration : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    };

    // Grab a poster frame ~10% in (avoids black leader frames).
    let thumb: string | null = null;
    const seekTo = Math.min(Math.max(0.1, (meta.durationSec ?? 1) * 0.1), (meta.durationSec ?? 1) - 0.05);
    try {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', () => reject(new Error('seek failed')), { once: true });
        video.currentTime = Number.isFinite(seekTo) ? seekTo : 0;
      });
      if (video.videoWidth) {
        const { w, h } = fitThumb(video.videoWidth, video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          thumb = canvas.toDataURL('image/jpeg', 0.7);
        }
      }
    } catch {
      // Poster frame is best-effort; metadata still succeeded.
    }

    return { kind: 'video', meta, thumbnailDataUrl: thumb };
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

async function probeAudio(file: File): Promise<ProbeResult> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error('audio metadata load failed'));
    });
    const meta: MediaMeta = {
      ...baseMeta(file),
      durationSec: Number.isFinite(audio.duration) ? audio.duration : null,
    };
    return { kind: 'audio', meta, thumbnailDataUrl: null };
  } finally {
    URL.revokeObjectURL(url);
    audio.src = '';
  }
}

export async function probeMedia(file: File): Promise<ProbeResult> {
  const kind = kindFromMime(file.type, file.name);
  switch (kind) {
    case 'image':
      return probeImage(file);
    case 'audio':
      return probeAudio(file);
    case 'caption':
      return { kind: 'caption', meta: baseMeta(file), thumbnailDataUrl: null };
    case 'video':
    default:
      return probeVideo(file);
  }
}

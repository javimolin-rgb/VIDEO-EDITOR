/**
 * Preview compositor (spec §12). Separate from the final renderer (spec §13).
 *
 * Phase 1 keeps this deliberately simple and non-blocking: one pooled
 * <video>/<img> element per asset, drawn to a 2D canvas at the current
 * playhead. During playback the underlying media elements are allowed to run
 * so the user hears audio; when paused/scrubbing they are seeked frame-exact.
 * WebCodecs/WebGPU acceleration is a Phase 2 upgrade behind this same API.
 */

import { createLogger } from '@/lib/logger';
import { framesToSeconds, type Frame } from '@/lib/time';
import { clipTimelineRange, type Asset, type Clip, type Timeline } from '@/domain/types';

const log = createLogger('video');

interface Pooled {
  kind: 'video' | 'image';
  video?: HTMLVideoElement;
  image?: HTMLImageElement;
  url: string;
  hasAudio: boolean;
}

export class PreviewEngine {
  private pool = new Map<string, Pooled>();
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 1920;
  private height = 1080;
  private background = '#000';
  private playing = false;

  attachCanvas(canvas: HTMLCanvasElement, width: number, height: number, background: string): void {
    canvas.width = width;
    canvas.height = height;
    this.width = width;
    this.height = height;
    this.background = background;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  setResolution(width: number, height: number, background: string): void {
    this.width = width;
    this.height = height;
    this.background = background;
    if (this.ctx) {
      this.ctx.canvas.width = width;
      this.ctx.canvas.height = height;
    }
  }

  /** Ensure a media element exists for every asset referenced by a clip. */
  async sync(assets: Asset[], clips: Clip[], resolveBlobUrl: (asset: Asset) => Promise<string | null>): Promise<void> {
    const needed = new Set(clips.map((c) => c.assetId));
    // Drop unused.
    for (const [id, p] of this.pool) {
      if (!needed.has(id)) {
        URL.revokeObjectURL(p.url);
        p.video?.remove();
        this.pool.delete(id);
      }
    }
    // Add missing.
    for (const id of needed) {
      if (this.pool.has(id)) continue;
      const asset = assets.find((a) => a.id === id);
      if (!asset) continue;
      const url = await resolveBlobUrl(asset);
      if (!url) continue;
      if (asset.kind === 'image') {
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => undefined);
        this.pool.set(id, { kind: 'image', image, url, hasAudio: false });
      } else {
        const video = document.createElement('video');
        video.src = url;
        video.playsInline = true;
        video.preload = 'auto';
        video.muted = true;
        await new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => resolve();
        });
        const hasAudio = asset.kind === 'audio' || (asset.meta.audioChannels ?? 1) > 0;
        this.pool.set(id, { kind: 'video', video, url, hasAudio });
      }
    }
  }

  setPlaying(playing: boolean, timeline: Timeline): void {
    this.playing = playing;
    if (!playing) {
      for (const p of this.pool.values()) {
        p.video?.pause();
        if (p.video) p.video.muted = true;
      }
      return;
    }
    this.syncPlayback(timeline, timeline.playheadFrame);
  }

  /** Draw the composite at `frame`. Called from the app rAF loop. */
  render(timeline: Timeline, frame: Frame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const visualTracks = timeline.tracks
      .filter((t) => (t.kind === 'video' || t.kind === 'text') && !t.hidden)
      .sort((a, b) => b.index - a.index);

    const active = timeline.clips
      .filter((c) => visualTracks.some((t) => t.id === c.trackId))
      .filter((c) => {
        const r = clipTimelineRange(c);
        return frame >= r.start && frame < r.end;
      })
      .sort((a, b) => {
        const ia = visualTracks.find((t) => t.id === a.trackId)?.index ?? 0;
        const ib = visualTracks.find((t) => t.id === b.trackId)?.index ?? 0;
        return ib - ia;
      });

    for (const clip of active) {
      const p = this.pool.get(clip.assetId);
      if (!p) continue;
      const r = clipTimelineRange(clip);
      const localFrame = frame - r.start;
      const alpha = this.fadeAlpha(clip, localFrame, r.end - frame);
      ctx.globalAlpha = alpha;

      if (p.kind === 'image' && p.image && p.image.naturalWidth > 0) {
        this.drawContain(ctx, p.image, p.image.naturalWidth, p.image.naturalHeight);
      } else if (p.video) {
        if (!this.playing) {
          const sec = framesToSeconds(
            clip.sourceIn + Math.round(localFrame * clip.speed),
            timeline.timebase,
          );
          if (Math.abs(p.video.currentTime - sec) > 0.04) {
            try {
              p.video.currentTime = Math.max(0, sec);
            } catch {
              /* ignore */
            }
          }
        }
        if (p.video.videoWidth > 0) {
          this.drawContain(ctx, p.video, p.video.videoWidth, p.video.videoHeight);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  private syncPlayback(timeline: Timeline, frame: Frame): void {
    const activeIds = new Set(
      timeline.clips
        .filter((c) => {
          const r = clipTimelineRange(c);
          return frame >= r.start && frame < r.end;
        })
        .map((c) => c.assetId),
    );
    for (const [id, p] of this.pool) {
      if (!p.video) continue;
      const clip = timeline.clips.find(
        (c) => c.assetId === id && frame >= clipTimelineRange(c).start && frame < clipTimelineRange(c).end,
      );
      if (activeIds.has(id) && clip) {
        const r = clipTimelineRange(clip);
        const sec = framesToSeconds(clip.sourceIn + (frame - r.start), timeline.timebase);
        try {
          p.video.currentTime = Math.max(0, sec);
        } catch {
          /* ignore */
        }
        p.video.muted = !p.hasAudio;
        void p.video.play().catch(() => undefined);
      } else {
        p.video.pause();
        p.video.muted = true;
      }
    }
  }

  private fadeAlpha(clip: Clip, localFrame: number, framesToEnd: number): number {
    let a = clip.opacity;
    if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) a *= localFrame / clip.fadeInFrames;
    if (clip.fadeOutFrames > 0 && framesToEnd < clip.fadeOutFrames) {
      a *= Math.max(0, framesToEnd) / clip.fadeOutFrames;
    }
    return Math.max(0, Math.min(1, a));
  }

  private drawContain(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number): void {
    const scale = Math.min(this.width / sw, this.height / sh);
    const w = sw * scale;
    const h = sh * scale;
    ctx.drawImage(src, (this.width - w) / 2, (this.height - h) / 2, w, h);
  }

  dispose(): void {
    for (const p of this.pool.values()) {
      URL.revokeObjectURL(p.url);
      p.video?.remove();
    }
    this.pool.clear();
    log.debug('preview engine disposed');
  }
}

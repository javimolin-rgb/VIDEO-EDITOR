/**
 * Preview compositor (spec §12). Owns a pool of one <video>/<img> element per
 * asset and delegates all drawing to the shared `renderFrame` compositor
 * (spec §168 — same renderer as final export). During playback the media
 * elements run so audio is heard; when paused/scrubbing they are seeked
 * frame-exact. WebCodecs/WebGPU acceleration can replace the element pool
 * behind this same API later.
 */

import { createLogger } from '@/lib/logger';
import { framesToSeconds } from '@/lib/time';
import { clipTimelineRange, type Asset, type Clip, type VideoProject } from '@/domain/types';
import { renderFrame, type Drawable, type VisualResolver } from './compositor';

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
  private project: VideoProject | null = null;
  private playing = false;

  private latestFrame = 0;
  private rafId: number | null = null;
  private inFlight = false;
  private dirty = false;

  attachCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
    canvas.width = width;
    canvas.height = height;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  setResolution(width: number, height: number): void {
    if (this.ctx) {
      this.ctx.canvas.width = width;
      this.ctx.canvas.height = height;
    }
  }

  setProject(project: VideoProject): void {
    this.project = project;
  }

  async sync(
    assets: Asset[],
    clips: Clip[],
    resolveBlobUrl: (asset: Asset) => Promise<string | null>,
  ): Promise<void> {
    const needed = new Set(clips.map((c) => c.assetId));
    for (const [id, p] of this.pool) {
      if (!needed.has(id)) {
        // The URL comes from the shared media-URL cache; that cache owns its
        // lifecycle (revoked on project close). Only drop the element here.
        p.video?.remove();
        this.pool.delete(id);
      }
    }
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

  setPlaying(playing: boolean, project: VideoProject): void {
    this.playing = playing;
    this.project = project;
    if (!playing) {
      for (const p of this.pool.values()) {
        p.video?.pause();
        if (p.video) p.video.muted = true;
      }
      this.requestRender(project.timeline.playheadFrame);
      return;
    }
    this.syncPlayback(project, project.timeline.playheadFrame);
  }

  /** Coalesced async render request; safe to call every playhead tick. */
  requestRender(frame: number): void {
    this.latestFrame = frame;
    if (this.inFlight) {
      this.dirty = true;
      return;
    }
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      void this.draw();
    });
  }

  private async draw(): Promise<void> {
    const ctx = this.ctx;
    const project = this.project;
    if (!ctx || !project) return;
    this.inFlight = true;
    try {
      await renderFrame(ctx, project, this.latestFrame, this.resolver, {
        awaitSeek: !this.playing,
        grainSeed: this.playing ? (this.latestFrame % 60) + 1 : 7,
      });
    } catch (e) {
      log.warn('preview render failed', e);
    } finally {
      this.inFlight = false;
      if (this.dirty) {
        this.dirty = false;
        this.requestRender(this.latestFrame);
      }
    }
  }

  private resolver: VisualResolver = {
    resolve: (assetId): Drawable | null => {
      const p = this.pool.get(assetId);
      if (!p) return null;
      if (p.kind === 'image' && p.image && p.image.naturalWidth > 0) {
        return { source: p.image, width: p.image.naturalWidth, height: p.image.naturalHeight };
      }
      if (p.video && p.video.videoWidth > 0) {
        return { source: p.video, width: p.video.videoWidth, height: p.video.videoHeight };
      }
      return null;
    },
    seek: (assetId, timeSec): void => {
      if (this.playing) return;
      const p = this.pool.get(assetId);
      if (!p?.video) return;
      if (Math.abs(p.video.currentTime - timeSec) > 0.04) {
        try {
          p.video.currentTime = Math.max(0, timeSec);
        } catch {
          /* ignore */
        }
      }
    },
  };

  private syncPlayback(project: VideoProject, frame: number): void {
    const { timeline } = project;
    for (const [id, p] of this.pool) {
      if (!p.video) continue;
      const clip = timeline.clips.find(
        (c) =>
          c.assetId === id &&
          frame >= clipTimelineRange(c).start &&
          frame < clipTimelineRange(c).end,
      );
      if (clip) {
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

  dispose(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    for (const p of this.pool.values()) {
      // URL lifecycle is owned by the shared media-URL cache.
      p.video?.remove();
    }
    this.pool.clear();
    log.debug('preview engine disposed');
  }
}

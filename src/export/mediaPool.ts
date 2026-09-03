/**
 * Export-time visual resolver: one <video>/<img> per asset with frame-exact
 * awaited seeks. Backs the shared compositor during offline and realtime
 * renders.
 */

import type { Asset } from '@/domain/types';
import { getAssetBlob } from '@/storage/repository';
import type { Drawable, VisualResolver } from '@/video/compositor';

interface Entry {
  kind: 'video' | 'image';
  video?: HTMLVideoElement;
  image?: HTMLImageElement;
  url: string;
}

export class ExportMediaPool implements VisualResolver {
  private entries = new Map<string, Entry>();

  async load(assets: Asset[], assetIds: Iterable<string>): Promise<void> {
    for (const id of assetIds) {
      if (this.entries.has(id)) continue;
      const asset = assets.find((a) => a.id === id);
      if (!asset?.blobKey) continue;
      const blob = await getAssetBlob(asset.blobKey);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      if (asset.kind === 'image') {
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => undefined);
        this.entries.set(id, { kind: 'image', image, url });
      } else {
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        await new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => resolve();
        });
        this.entries.set(id, { kind: 'video', video, url });
      }
    }
  }

  resolve(assetId: string): Drawable | null {
    const e = this.entries.get(assetId);
    if (!e) return null;
    if (e.kind === 'image' && e.image && e.image.naturalWidth > 0) {
      return { source: e.image, width: e.image.naturalWidth, height: e.image.naturalHeight };
    }
    if (e.video && e.video.videoWidth > 0) {
      return { source: e.video, width: e.video.videoWidth, height: e.video.videoHeight };
    }
    return null;
  }

  seek(assetId: string, timeSec: number): Promise<void> {
    const e = this.entries.get(assetId);
    if (!e?.video) return Promise.resolve();
    if (Math.abs(e.video.currentTime - timeSec) < 0.012) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        e.video!.removeEventListener('seeked', done);
        resolve();
      };
      e.video!.addEventListener('seeked', done);
      try {
        e.video!.currentTime = Math.max(0, timeSec);
      } catch {
        resolve();
      }
      setTimeout(resolve, 250);
    });
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      URL.revokeObjectURL(e.url);
      e.video?.remove();
    }
    this.entries.clear();
  }
}

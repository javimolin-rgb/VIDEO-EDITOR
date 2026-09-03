/**
 * Process-lifetime cache of object URLs for asset blobs. Keeps us from
 * re-reading IndexedDB and re-allocating URLs on every render. Cleared when a
 * project closes.
 */

import type { Asset } from '@/domain/types';
import { getAssetBlob } from '@/storage/repository';

const urls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

export async function getMediaUrl(asset: Asset): Promise<string | null> {
  if (!asset.blobKey) return null;
  const cached = urls.get(asset.id);
  if (cached) return cached;
  const pending = inflight.get(asset.id);
  if (pending) return pending;

  const p = (async () => {
    const blob = await getAssetBlob(asset.blobKey!);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(asset.id, url);
    inflight.delete(asset.id);
    return url;
  })();
  inflight.set(asset.id, p);
  return p;
}

export function revokeMediaUrl(assetId: string): void {
  const url = urls.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(assetId);
  }
}

export function revokeAllMediaUrls(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  inflight.clear();
}

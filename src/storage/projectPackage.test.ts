import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import { saveProject, putAsset, loadProject, listAssets } from './repository';
import { createProject } from '@/domain/project';
import { buildPackage, importPackage, PACKAGE_FORMAT } from './projectPackage';
import type { Asset } from '@/domain/types';

function asset(projectId: string, id: string, blobKey: string): Asset {
  return {
    id,
    projectId,
    kind: 'image',
    role: 'source',
    name: `${id}.png`,
    blobKey,
    thumbnailDataUrl: null,
    meta: {
      durationSec: null,
      width: 2,
      height: 2,
      fps: null,
      codec: null,
      audioChannels: null,
      sampleRate: null,
      rotation: null,
      sizeBytes: 4,
      mimeType: 'image/png',
    },
    createdAt: 0,
    tags: [],
  };
}

describe('project package round-trip', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('exports a project + assets and re-imports them as a replace', async () => {
    const project = createProject({ name: 'Pkg test' });
    const a = asset(project.meta.id, 'asset_x', 'blob_x');
    project.assetIds = [a.id];
    await saveProject(project);
    await putAsset(a, new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));

    const pkg = await buildPackage(project.meta.id);
    expect(pkg?.format).toBe(PACKAGE_FORMAT);
    expect(pkg?.assets).toHaveLength(1);
    expect(pkg?.assets[0]!.blobBase64).toBeTruthy();

    await Promise.all(db.tables.map((t) => t.clear()));

    const id = await importPackage(pkg!, 'replace');
    expect(id).toBe(project.meta.id);
    const restored = await loadProject(id);
    expect(restored?.meta.name).toBe('Pkg test');
    const assets = await listAssets(id);
    expect(assets).toHaveLength(1);
    const blobRow = await db.blobs.get(assets[0]!.blobKey!);
    // jsdom's IndexedDB Blob round-trip is lossy; just assert it was stored.
    expect(blobRow).toBeTruthy();
    expect(blobRow!.projectId).toBe(id);
  });

  it('re-keys everything on a copy import', async () => {
    const project = createProject({ name: 'Copy me' });
    const a = asset(project.meta.id, 'asset_y', 'blob_y');
    project.assetIds = [a.id];
    project.timeline.clips.push({
      id: 'clip_1',
      trackId: project.timeline.tracks[0]!.id,
      assetId: a.id,
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 30,
      speed: 1,
      gain: 1,
      pan: 0,
      opacity: 1,
      fadeInFrames: 0,
      fadeOutFrames: 0,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
      color: { enabled: false, exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
      effects: [],
      keyframes: {},
      label: null,
    });
    await saveProject(project);
    await putAsset(a, new Blob([new Uint8Array([9])], { type: 'image/png' }));

    const pkg = await buildPackage(project.meta.id);
    const newId = await importPackage(pkg!, 'copy');
    expect(newId).not.toBe(project.meta.id);

    const copy = await loadProject(newId);
    expect(copy?.meta.name).toBe('Copy me copy');
    // The clip's assetId was re-mapped to the new asset id.
    const newAssetId = copy!.assetIds[0]!;
    expect(newAssetId).not.toBe('asset_y');
    expect(copy!.timeline.clips[0]!.assetId).toBe(newAssetId);
  });
});

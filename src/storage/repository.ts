/**
 * Repository: the only module that talks to Dexie directly. The rest of the
 * app depends on these functions, not on the database shape.
 */

import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { cloneProject } from '@/domain/project';
import { migrateProject } from '@/domain/migrate';
import type { Asset, ProjectVersion, VideoProject } from '@/domain/types';
import { db, type ProjectRow } from './db';

const log = createLogger('storage');

// ─── Projects ───────────────────────────────────────────────────────────────

export async function listProjects(): Promise<ProjectRow[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function loadProject(id: string): Promise<VideoProject | null> {
  const row = await db.projects.get(id);
  if (!row) return null;
  return migrateProject(row.data);
}

export async function saveProject(project: VideoProject): Promise<void> {
  const stamped: VideoProject = {
    ...project,
    meta: { ...project.meta, updatedAt: Date.now() },
  };
  const row: ProjectRow = {
    id: stamped.meta.id,
    name: stamped.meta.name,
    createdAt: stamped.meta.createdAt,
    updatedAt: stamped.meta.updatedAt,
    data: stamped,
  };
  await db.projects.put(row);
  log.debug('project saved', { id: row.id, name: row.name });
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.assets, db.blobs, db.versions, db.recovery, async () => {
    await db.projects.delete(id);
    await db.assets.where('projectId').equals(id).delete();
    await db.blobs.where('projectId').equals(id).delete();
    await db.versions.where('projectId').equals(id).delete();
    await db.recovery.delete(id);
  });
  log.info('project deleted', { id });
}

export async function duplicateProject(id: string, name: string): Promise<VideoProject | null> {
  const original = await loadProject(id);
  if (!original) return null;
  const copy = cloneProject(original);
  const newProjectId = newId('proj');
  copy.meta = {
    ...copy.meta,
    id: newProjectId,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Re-key assets and blobs so the copy is fully independent.
  const assets = await db.assets.where('projectId').equals(id).toArray();
  const remap = new Map<string, string>();
  const newAssets: Asset[] = [];
  const newBlobs: { key: string; projectId: string; blob: Blob; createdAt: number }[] = [];

  for (const a of assets) {
    const newAssetId = newId('asset');
    remap.set(a.id, newAssetId);
    let newBlobKey = a.blobKey;
    if (a.blobKey) {
      const blobRow = await db.blobs.get(a.blobKey);
      if (blobRow) {
        newBlobKey = newId('asset');
        newBlobs.push({
          key: newBlobKey,
          projectId: newProjectId,
          blob: blobRow.blob,
          createdAt: Date.now(),
        });
      }
    }
    newAssets.push({ ...a, id: newAssetId, projectId: newProjectId, blobKey: newBlobKey });
  }

  copy.assetIds = copy.assetIds.map((aid) => remap.get(aid) ?? aid);
  copy.timeline = {
    ...copy.timeline,
    clips: copy.timeline.clips.map((c) => ({ ...c, assetId: remap.get(c.assetId) ?? c.assetId })),
  };

  await db.transaction('rw', db.projects, db.assets, db.blobs, async () => {
    await db.blobs.bulkPut(newBlobs);
    await db.assets.bulkPut(newAssets);
    await saveProject(copy);
  });
  log.info('project duplicated', { from: id, to: newProjectId });
  return copy;
}

// ─── Assets & blobs ─────────────────────────────────────────────────────────

export async function listAssets(projectId: string): Promise<Asset[]> {
  return db.assets.where('projectId').equals(projectId).sortBy('createdAt');
}

export async function putAsset(asset: Asset, blob?: Blob): Promise<void> {
  await db.transaction('rw', db.assets, db.blobs, async () => {
    if (blob && asset.blobKey) {
      await db.blobs.put({
        key: asset.blobKey,
        projectId: asset.projectId,
        blob,
        createdAt: Date.now(),
      });
    }
    await db.assets.put(asset);
  });
}

export async function getAssetBlob(blobKey: string): Promise<Blob | null> {
  const row = await db.blobs.get(blobKey);
  return row ? row.blob : null;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const asset = await db.assets.get(assetId);
  if (!asset) return;
  await db.transaction('rw', db.assets, db.blobs, async () => {
    if (asset.blobKey) await db.blobs.delete(asset.blobKey);
    await db.assets.delete(assetId);
  });
}

// ─── Versions (spec §123) ───────────────────────────────────────────────────

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  return db.versions.where('projectId').equals(projectId).reverse().sortBy('createdAt');
}

export async function saveVersion(project: VideoProject, label: string): Promise<ProjectVersion> {
  const version: ProjectVersion = {
    id: newId('ver'),
    projectId: project.meta.id,
    createdAt: Date.now(),
    label,
    snapshot: cloneProject(project),
  };
  await db.versions.put(version);
  log.info('version saved', { projectId: project.meta.id, label });
  return version;
}

export async function deleteVersion(versionId: string): Promise<void> {
  await db.versions.delete(versionId);
}

// ─── Crash recovery (spec §9) ───────────────────────────────────────────────

export async function writeRecovery(project: VideoProject): Promise<void> {
  await db.recovery.put({ projectId: project.meta.id, savedAt: Date.now(), data: project });
}

export async function readRecovery(projectId: string): Promise<{ savedAt: number; data: VideoProject } | null> {
  const row = await db.recovery.get(projectId);
  return row ? { savedAt: row.savedAt, data: migrateProject(row.data) } : null;
}

export async function clearRecovery(projectId: string): Promise<void> {
  await db.recovery.delete(projectId);
}

// ─── Storage accounting (spec §92) ──────────────────────────────────────────

export interface StorageBreakdown {
  projects: number;
  assets: number;
  blobBytes: number;
  versions: number;
  quota: number | null;
  usage: number | null;
}

export async function storageBreakdown(): Promise<StorageBreakdown> {
  const [projects, assets, versions, blobs] = await Promise.all([
    db.projects.count(),
    db.assets.count(),
    db.versions.count(),
    db.blobs.toArray(),
  ]);
  const blobBytes = blobs.reduce((sum, b) => sum + (b.blob.size ?? 0), 0);
  let quota: number | null = null;
  let usage: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    quota = est.quota ?? null;
    usage = est.usage ?? null;
  }
  return { projects, assets, versions, blobBytes, quota, usage };
}

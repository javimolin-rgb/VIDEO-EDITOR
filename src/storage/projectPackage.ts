/**
 * Portable project package (spec §118). A single JSON that carries the
 * project document, every asset (metadata + media as base64), the version
 * history and the generation records. Used for local export/import and for
 * GitHub sync.
 */

import { createLogger } from '@/lib/logger';
import { newId } from '@/lib/id';
import { migrateProject } from '@/domain/migrate';
import type { Asset, ProjectVersion, VideoProject } from '@/domain/types';
import { db, type GenerationRow } from './db';
import {
  getAssetBlob,
  listAssets,
  listVersions,
  loadProject,
  putAsset,
  saveProject,
  saveVersion,
} from './repository';

export const PACKAGE_FORMAT = 'aiv-project-package' as const;
export const PACKAGE_VERSION = 1 as const;

export interface PackagedAsset {
  asset: Asset;
  /** base64 (no data: prefix); null for metadata-only assets. */
  blobBase64: string | null;
  blobType: string | null;
}

export interface ProjectPackage {
  format: typeof PACKAGE_FORMAT;
  packageVersion: typeof PACKAGE_VERSION;
  exportedAt: string;
  project: VideoProject;
  assets: PackagedAsset[];
  versions: ProjectVersion[];
  generations: GenerationRow[];
}

const log = createLogger('storage');

async function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blobArrayBuffer(blob));
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildPackage(projectId: string): Promise<ProjectPackage | null> {
  const project = await loadProject(projectId);
  if (!project) return null;

  const assets = await listAssets(projectId);
  const packagedAssets: PackagedAsset[] = [];
  for (const asset of assets) {
    let blobBase64: string | null = null;
    let blobType: string | null = null;
    if (asset.blobKey) {
      const blob = await getAssetBlob(asset.blobKey);
      if (blob) {
        blobBase64 = await blobToBase64(blob);
        blobType = blob.type || asset.meta.mimeType;
      }
    }
    packagedAssets.push({ asset, blobBase64, blobType });
  }

  const versions = await listVersions(projectId);
  const generations = await db.generations.where('projectId').equals(projectId).toArray();

  return {
    format: PACKAGE_FORMAT,
    packageVersion: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    assets: packagedAssets,
    versions,
    generations,
  };
}

export function packageBytes(pkg: ProjectPackage): number {
  return pkg.assets.reduce((n, a) => n + (a.blobBase64?.length ?? 0), 0);
}

/**
 * Write a package into local storage. `mode: 'replace'` keeps the original
 * project id (for pull/restore); `mode: 'copy'` re-keys everything so it lands
 * as a new project.
 */
export async function importPackage(
  pkg: ProjectPackage,
  mode: 'replace' | 'copy' = 'replace',
): Promise<string> {
  if (pkg.format !== PACKAGE_FORMAT) throw new Error('Not an AI Video Editor project package.');

  const project = migrateProject(pkg.project);
  const remap = new Map<string, string>();
  const remapBlob = new Map<string, string>();

  if (mode === 'copy') {
    const newProjectId = newId('proj');
    remap.set(project.meta.id, newProjectId);
    project.meta = { ...project.meta, id: newProjectId, name: `${project.meta.name} copy`, updatedAt: Date.now() };
  }

  const resolveProject = (id: string) => remap.get(id) ?? id;
  const finalProjectId = resolveProject(pkg.project.meta.id);
  project.meta.id = finalProjectId;

  // Assets + blobs.
  for (const { asset, blobBase64, blobType } of pkg.assets) {
    const newAssetId = mode === 'copy' ? newId('asset') : asset.id;
    remap.set(asset.id, newAssetId);
    let newBlobKey = asset.blobKey;
    if (asset.blobKey) {
      newBlobKey = mode === 'copy' ? newId('asset') : asset.blobKey;
      remapBlob.set(asset.blobKey, newBlobKey);
    }
    const rekeyed: Asset = {
      ...asset,
      id: newAssetId,
      projectId: finalProjectId,
      blobKey: newBlobKey,
    };
    const blob = blobBase64 ? base64ToBlob(blobBase64, blobType ?? asset.meta.mimeType) : undefined;
    await putAsset(rekeyed, blob);
  }

  if (mode === 'copy') {
    project.assetIds = project.assetIds.map((id) => remap.get(id) ?? id);
    project.timeline = {
      ...project.timeline,
      clips: project.timeline.clips.map((c) => ({ ...c, assetId: remap.get(c.assetId) ?? c.assetId })),
    };
    project.references = project.references.map((r) => ({ ...r, assetId: remap.get(r.assetId) ?? r.assetId }));
    project.storyboard = project.storyboard.map((s) => ({
      ...s,
      assetId: s.assetId ? remap.get(s.assetId) ?? s.assetId : null,
      referenceAssetIds: s.referenceAssetIds.map((id) => remap.get(id) ?? id),
    }));
  }

  await saveProject(project);

  // Versions.
  for (const v of pkg.versions) {
    if (mode === 'copy') {
      await saveVersion(project, v.label);
    } else {
      await db.versions.put(v);
    }
  }

  // Generation records.
  for (const g of pkg.generations) {
    await db.generations.put({
      ...g,
      id: mode === 'copy' ? newId('gen') : g.id,
      projectId: finalProjectId,
      assetId: remap.get(g.assetId) ?? g.assetId,
      parentId: g.parentId ? remap.get(g.parentId) ?? g.parentId : null,
    });
  }

  log.info('package imported', { id: finalProjectId, mode, assets: pkg.assets.length });
  return finalProjectId;
}

// ─── file download / upload helpers ────────────────────────────────────────

export async function downloadPackage(projectId: string, name: string): Promise<void> {
  const pkg = await buildPackage(projectId);
  if (!pkg) return;
  const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '_')}.aivproj.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function readPackageFile(file: File): Promise<ProjectPackage> {
  const text = await file.text();
  const pkg = JSON.parse(text) as ProjectPackage;
  if (pkg.format !== PACKAGE_FORMAT) throw new Error('That file is not an AI Video Editor project package.');
  return pkg;
}

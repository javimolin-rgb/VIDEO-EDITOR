/**
 * Local persistence (spec §8, §9, §244, §245). Everything lives in IndexedDB
 * via Dexie. No account, no server, no network required.
 *
 *   projects   — one row per project (full VideoProject document)
 *   assets     — asset metadata rows, indexed by project
 *   blobs      — binary media, addressed by key, referenced from assets
 *   versions   — named project snapshots for version history (spec §123)
 *   recovery   — most-recent autosave per project for crash recovery (spec §9)
 */

import Dexie, { type EntityTable } from 'dexie';
import type { Asset, GenerationMeta, ProjectVersion, VideoProject } from '@/domain/types';

export interface ProjectRow {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  data: VideoProject;
}

export interface BlobRow {
  key: string;
  projectId: string;
  blob: Blob;
  createdAt: number;
}

export interface RecoveryRow {
  projectId: string;
  savedAt: number;
  data: VideoProject;
}

/** Asset already carries `id` and `projectId`; aliased for Dexie typing clarity. */
export type AssetRow = Asset;

/** One row per generated clip (spec §124, §243) — the generation history/graph. */
export interface GenerationRow {
  id: string;
  projectId: string;
  parentId: string | null;
  kind: string;
  /** Deterministic request hash for "use existing result" (spec §173). */
  requestHash: string;
  /** The asset produced. */
  assetId: string;
  meta: GenerationMeta;
  qualityScore: number | null;
  qualityIssues: string[];
  createdAt: number;
}

class AppDatabase extends Dexie {
  projects!: EntityTable<ProjectRow, 'id'>;
  assets!: EntityTable<AssetRow, 'id'>;
  blobs!: EntityTable<BlobRow, 'key'>;
  versions!: EntityTable<ProjectVersion, 'id'>;
  recovery!: EntityTable<RecoveryRow, 'projectId'>;
  generations!: EntityTable<GenerationRow, 'id'>;

  constructor() {
    super('ai-video-editor');
    this.version(1).stores({
      projects: 'id, updatedAt, name',
      assets: 'id, projectId, kind, role, createdAt',
      blobs: 'key, projectId, createdAt',
      versions: 'id, projectId, createdAt',
      recovery: 'projectId, savedAt',
    });
    this.version(2).stores({
      generations: 'id, projectId, parentId, requestHash, createdAt',
    });
  }
}

export const db = new AppDatabase();

export type { EntityTable };

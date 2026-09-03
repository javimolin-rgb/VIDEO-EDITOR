/**
 * Debounced autosave + crash-recovery writer (spec §9). Committed saves go to
 * the `projects` table; a lighter-weight recovery snapshot is written more
 * eagerly so an unexpected reload loses at most a few seconds of work.
 */

import { createLogger } from '@/lib/logger';
import type { VideoProject } from '@/domain/types';
import { saveProject, writeRecovery } from './repository';

const log = createLogger('storage');

const SAVE_DEBOUNCE_MS = 1500;
const RECOVERY_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let pending: VideoProject | null = null;

export interface AutosaveHooks {
  onSaved?: (project: VideoProject) => void;
  onError?: (error: unknown) => void;
}

let hooks: AutosaveHooks = {};

export function configureAutosave(next: AutosaveHooks): void {
  hooks = next;
}

export function scheduleAutosave(project: VideoProject): void {
  pending = project;

  if (recoveryTimer) clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => {
    if (pending) void writeRecovery(pending).catch((e) => log.warn('recovery write failed', e));
  }, RECOVERY_DEBOUNCE_MS);

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushAutosave();
  }, SAVE_DEBOUNCE_MS);
}

export async function flushAutosave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const project = pending;
  if (!project) return;
  pending = null;
  try {
    await saveProject(project);
    hooks.onSaved?.(project);
  } catch (e) {
    log.error('autosave failed', e);
    hooks.onError?.(e);
  }
}

/** Best-effort synchronous-ish flush for `beforeunload`. */
export function flushAutosaveOnUnload(): void {
  if (pending) {
    void saveProject(pending);
    void writeRecovery(pending);
  }
}

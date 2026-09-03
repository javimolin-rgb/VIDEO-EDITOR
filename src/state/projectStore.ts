/**
 * Project + timeline state (spec §170). The single source of truth for the
 * open project. Every mutation goes through `mutate()` so it is: applied to a
 * clone, committed to snapshot history (undo/redo), and queued for autosave.
 */

import { create } from 'zustand';
import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { secondsToFrames, type Frame, type FrameRange } from '@/lib/time';
import { cloneProject, createProject, type CreateProjectOptions } from '@/domain/project';
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  commit,
  initHistory,
  redo as histRedo,
  timeline as histTimeline,
  undo as histUndo,
  type HistoryEntry,
  type HistoryEntryKind,
  type HistoryState,
} from '@/domain/history/history';
import * as tl from '@/domain/timeline/operations';
import type { Asset, AssetRole, ProjectSettings, TrackKind, VideoProject } from '@/domain/types';
import { probeMedia } from '@/video/probe';
import { configureAutosave, flushAutosave, scheduleAutosave } from '@/storage/autosave';
import {
  clearRecovery,
  listAssets,
  loadProject,
  putAsset,
  deleteAsset as repoDeleteAsset,
  saveProject,
  saveVersion,
  listVersions,
} from '@/storage/repository';
import type { ProjectVersion } from '@/domain/types';

const log = createLogger('domain');

export type ProjectStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ImportProgress {
  total: number;
  done: number;
  currentName: string | null;
}

interface ProjectState {
  status: ProjectStatus;
  project: VideoProject | null;
  assets: Asset[];
  history: HistoryState<VideoProject> | null;
  dirty: boolean;
  lastSavedAt: number | null;
  importProgress: ImportProgress | null;
  error: string | null;

  // lifecycle
  newProject: (opts?: CreateProjectOptions) => Promise<string>;
  openProject: (id: string) => Promise<void>;
  openSnapshot: (project: VideoProject) => void;
  closeProject: () => Promise<void>;
  saveNow: () => Promise<void>;

  // history
  mutate: (recipe: (draft: VideoProject) => void, label: string, kind?: HistoryEntryKind) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  activityLog: () => HistoryEntry<VideoProject>[];

  // timeline
  setPlayhead: (frame: Frame) => void;
  setSelectionRange: (range: FrameRange | null) => void;
  addClipFromAsset: (assetId: string, trackId: string, atFrame: Frame) => void;
  moveClip: (clipId: string, trackId: string, atFrame: Frame) => void;
  trimClip: (clipId: string, edge: tl.TrimEdge, toFrame: Frame) => void;
  splitAtPlayhead: (clipIds: string[]) => void;
  removeClips: (clipIds: string[]) => void;
  rippleDelete: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  addMarkerAtPlayhead: () => void;
  addTrack: (kind: TrackKind) => void;
  updateTrack: (trackId: string, patch: Parameters<typeof tl.updateTrack>[2]) => void;
  removeTrack: (trackId: string) => void;

  // assets
  importFiles: (files: FileList | File[]) => Promise<void>;
  removeAsset: (assetId: string) => Promise<void>;
  renameAsset: (assetId: string, name: string) => Promise<void>;
  setAssetRole: (assetId: string, role: AssetRole) => Promise<void>;

  // project meta / settings
  renameProject: (name: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;
  setAiInstructions: (text: string) => void;

  // versions
  createVersion: (label: string) => Promise<void>;
  listProjectVersions: () => Promise<ProjectVersion[]>;
}

configureAutosave({
  onSaved: (project) => {
    useProjectStore.setState((s) =>
      s.project?.meta.id === project.meta.id
        ? { dirty: false, lastSavedAt: Date.now() }
        : s,
    );
  },
  onError: (e) => {
    useProjectStore.setState({ error: `Autosave failed: ${String(e)}` });
  },
});

function applyTimeline(
  project: VideoProject,
  next: ReturnType<typeof tl.setPlayhead>,
): void {
  project.timeline = next;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  status: 'idle',
  project: null,
  assets: [],
  history: null,
  dirty: false,
  lastSavedAt: null,
  importProgress: null,
  error: null,

  async newProject(opts) {
    const project = createProject(opts);
    await saveProject(project);
    set({
      status: 'ready',
      project,
      assets: [],
      history: initHistory(project, 'Project created'),
      dirty: false,
      lastSavedAt: Date.now(),
      error: null,
    });
    log.info('new project', { id: project.meta.id });
    return project.meta.id;
  },

  async openProject(id) {
    set({ status: 'loading', error: null });
    const project = await loadProject(id);
    if (!project) {
      set({ status: 'error', error: 'Project not found.' });
      return;
    }
    const assets = await listAssets(id);
    set({
      status: 'ready',
      project,
      assets,
      history: initHistory(project, 'Project opened'),
      dirty: false,
      lastSavedAt: project.meta.updatedAt,
    });
    log.info('opened project', { id, assets: assets.length });
  },

  openSnapshot(project) {
    set({
      status: 'ready',
      project,
      history: initHistory(project, 'Recovered snapshot'),
      dirty: true,
    });
    scheduleAutosave(project);
  },

  async closeProject() {
    await flushAutosave();
    set({ status: 'idle', project: null, assets: [], history: null, dirty: false });
  },

  async saveNow() {
    const { project } = get();
    if (!project) return;
    await saveProject(project);
    set({ dirty: false, lastSavedAt: Date.now() });
  },

  mutate(recipe, label, kind = 'edit') {
    const { project, history } = get();
    if (!project || !history) return;
    const draft = cloneProject(project);
    recipe(draft);
    draft.meta.updatedAt = Date.now();
    const nextHistory = commit(history, draft, label, kind);
    set({ project: draft, history: nextHistory, dirty: true });
    scheduleAutosave(draft);
  },

  undo() {
    const { history } = get();
    if (!history || !histCanUndo(history)) return;
    const next = histUndo(history);
    const project = cloneProject(next.present.snapshot);
    set({ history: next, project, dirty: true });
    scheduleAutosave(project);
  },

  redo() {
    const { history } = get();
    if (!history || !histCanRedo(history)) return;
    const next = histRedo(history);
    const project = cloneProject(next.present.snapshot);
    set({ history: next, project, dirty: true });
    scheduleAutosave(project);
  },

  canUndo() {
    const { history } = get();
    return !!history && histCanUndo(history);
  },

  canRedo() {
    const { history } = get();
    return !!history && histCanRedo(history);
  },

  activityLog() {
    const { history } = get();
    return history ? histTimeline(history) : [];
  },

  // ─── timeline ─────────────────────────────────────────────────────────────

  setPlayhead(frame) {
    // Playhead moves are frequent and non-undoable; mutate without a history entry.
    const { project } = get();
    if (!project) return;
    const next = cloneProject(project);
    applyTimeline(next, tl.setPlayhead(next.timeline, frame));
    set({ project: next });
  },

  setSelectionRange(range) {
    const { project } = get();
    if (!project) return;
    const next = cloneProject(project);
    applyTimeline(next, tl.setSelectionRange(next.timeline, range));
    set({ project: next });
  },

  addClipFromAsset(assetId, trackId, atFrame) {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset) return;
    const project = get().project;
    if (!project) return;
    const fps = project.settings.fps;
    const durSec = asset.meta.durationSec ?? (asset.kind === 'image' ? 5 : 5);
    const sourceOut = Math.max(1, secondsToFrames(durSec, { fps, dropFrame: false }));
    get().mutate((draft) => {
      const res = tl.addClip(draft.timeline, {
        trackId,
        assetId,
        timelineStart: atFrame,
        sourceIn: 0,
        sourceOut,
        label: asset.name,
      });
      draft.timeline = res.timeline;
    }, `Add ${asset.name}`);
  },

  moveClip(clipId, trackId, atFrame) {
    get().mutate((draft) => {
      draft.timeline = tl.moveClip(draft.timeline, { clipId, trackId, timelineStart: atFrame });
    }, 'Move clip');
  },

  trimClip(clipId, edge, toFrame) {
    get().mutate((draft) => {
      draft.timeline = tl.trimClip(draft.timeline, { clipId, edge, toFrame });
    }, 'Trim clip');
  },

  splitAtPlayhead(clipIds) {
    const project = get().project;
    if (!project) return;
    const at = project.timeline.playheadFrame;
    get().mutate((draft) => {
      for (const id of clipIds) {
        draft.timeline = tl.splitClip(draft.timeline, { clipId: id, atFrame: at }).timeline;
      }
    }, 'Split clip');
  },

  removeClips(clipIds) {
    if (clipIds.length === 0) return;
    get().mutate((draft) => {
      for (const id of clipIds) draft.timeline = tl.removeClip(draft.timeline, id);
      draft.timeline = tl.setSelectionRange(draft.timeline, null);
    }, clipIds.length > 1 ? `Delete ${clipIds.length} clips` : 'Delete clip');
  },

  rippleDelete(clipId) {
    get().mutate((draft) => {
      draft.timeline = tl.rippleDeleteClip(draft.timeline, clipId);
    }, 'Ripple delete');
  },

  duplicateClip(clipId) {
    get().mutate((draft) => {
      draft.timeline = tl.duplicateClip(draft.timeline, clipId).timeline;
    }, 'Duplicate clip');
  },

  addMarkerAtPlayhead() {
    get().mutate((draft) => {
      draft.timeline = tl.addMarker(draft.timeline, draft.timeline.playheadFrame);
    }, 'Add marker');
  },

  addTrack(kind) {
    get().mutate((draft) => {
      draft.timeline = tl.addTrack(draft.timeline, kind).timeline;
    }, `Add ${kind} track`);
  },

  updateTrack(trackId, patch) {
    get().mutate((draft) => {
      draft.timeline = tl.updateTrack(draft.timeline, trackId, patch);
    }, 'Update track');
  },

  removeTrack(trackId) {
    get().mutate((draft) => {
      draft.timeline = tl.removeTrack(draft.timeline, trackId);
    }, 'Remove track');
  },

  // ─── assets ───────────────────────────────────────────────────────────────

  async importFiles(files) {
    const project = get().project;
    if (!project) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    set({ importProgress: { total: list.length, done: 0, currentName: null } });

    const added: Asset[] = [];
    for (const file of list) {
      set({ importProgress: { total: list.length, done: added.length, currentName: file.name } });
      try {
        const probe = await probeMedia(file);
        const blobKey = newId('asset');
        const asset: Asset = {
          id: newId('asset'),
          projectId: project.meta.id,
          kind: probe.kind,
          role: 'source',
          name: file.name,
          blobKey,
          thumbnailDataUrl: probe.thumbnailDataUrl,
          meta: probe.meta,
          createdAt: Date.now(),
          tags: [],
        };
        await putAsset(asset, file);
        added.push(asset);
      } catch (e) {
        log.error('import failed', { name: file.name, error: e });
        set({ error: `Could not import "${file.name}": ${String(e)}` });
      }
    }

    if (added.length > 0) {
      set((s) => ({ assets: [...s.assets, ...added] }));
      get().mutate((draft) => {
        draft.assetIds = [...draft.assetIds, ...added.map((a) => a.id)];
      }, added.length > 1 ? `Import ${added.length} files` : `Import ${added[0]!.name}`, 'import');
    }
    set({ importProgress: null });
  },

  async removeAsset(assetId) {
    await repoDeleteAsset(assetId);
    set((s) => ({ assets: s.assets.filter((a) => a.id !== assetId) }));
    get().mutate((draft) => {
      draft.assetIds = draft.assetIds.filter((id) => id !== assetId);
      draft.timeline = {
        ...draft.timeline,
        clips: draft.timeline.clips.filter((c) => c.assetId !== assetId),
      };
    }, 'Remove asset');
  },

  async renameAsset(assetId, name) {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset) return;
    const updated = { ...asset, name };
    await putAsset(updated);
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) }));
  },

  async setAssetRole(assetId, role) {
    const asset = get().assets.find((a) => a.id === assetId);
    if (!asset) return;
    const updated = { ...asset, role };
    await putAsset(updated);
    set((s) => ({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) }));
  },

  // ─── meta / settings ──────────────────────────────────────────────────────

  renameProject(name) {
    get().mutate((draft) => {
      draft.meta.name = name.trim() || draft.meta.name;
    }, 'Rename project');
  },

  updateSettings(patch) {
    get().mutate((draft) => {
      draft.settings = { ...draft.settings, ...patch };
      if (patch.fps) draft.timeline.timebase = { ...draft.timeline.timebase, fps: patch.fps };
    }, 'Update settings');
  },

  setAiInstructions(text) {
    get().mutate((draft) => {
      draft.meta.aiInstructions = text;
    }, 'Edit AI instructions');
  },

  // ─── versions ─────────────────────────────────────────────────────────────

  async createVersion(label) {
    const { project } = get();
    if (!project) return;
    await flushAutosave();
    await saveVersion(project, label);
  },

  async listProjectVersions() {
    const { project } = get();
    if (!project) return [];
    return listVersions(project.meta.id);
  },
}));

/** Discard the recovery snapshot once the user has resolved the prompt. */
export async function dismissRecovery(projectId: string): Promise<void> {
  await clearRecovery(projectId);
}

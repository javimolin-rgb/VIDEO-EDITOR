/**
 * Project + timeline state (spec §170). The single source of truth for the
 * open project. Every mutation goes through `mutate()` so it is: applied to a
 * clone, committed to snapshot history (undo/redo), and queued for autosave.
 */

import { create } from 'zustand';
import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { framesToSeconds, secondsToFrames, type Frame, type FrameRange } from '@/lib/time';
import { cloneProject, createProject, type CreateProjectOptions } from '@/domain/project';
import { migrateProject } from '@/domain/migrate';
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
import type {
  AnimatableParam,
  Asset,
  AssetRole,
  CaptionCue,
  CaptionStyle,
  Clip,
  ProjectSettings,
  ReferenceAsset,
  ReferencePriority,
  ReferenceRole,
  StoryboardShot,
  TrackKind,
  TransitionType,
  VideoProject,
} from '@/domain/types';
import * as sb from '@/domain/storyboard';
import { currentParamValue, sampleParam } from '@/domain/keyframes';
import { clipTimelineRange } from '@/domain/types';
import { parseCaptions } from '@/video/captions';
import { decodeAssetAudio, makeMonoBuffer, sliceMono, toMono } from '@/audio/decode';
import { defaultSilenceParams, detectSilences, totalSilenceSec, type SilenceMode } from '@/audio/silence';
import { detectShots } from '@/video/shots';
import { getMediaUrl } from '@/state/mediaUrls';
import { localRuntime } from '@/ai/local/runtime';
import { transcriptToCues } from '@/ai/local/transcriptToCaptions';
import type { TranscriptResult } from '@/ai/local/types';
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

  // clip render properties (Phase 2)
  patchClip: (clipId: string, recipe: (clip: Clip) => void, label: string) => void;
  toggleKeyframe: (clipId: string, param: AnimatableParam) => void;
  clearKeyframes: (clipId: string, param: AnimatableParam) => void;

  // transitions (Phase 2)
  addTransition: (
    fromClipId: string,
    toClipId: string,
    type: TransitionType,
    durationFrames: number,
  ) => void;
  updateTransition: (id: string, patch: Parameters<typeof tl.updateTransition>[2]) => void;
  removeTransition: (id: string) => void;

  // captions (Phase 2)
  importCaptionsText: (text: string, sourceName: string) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  updateCaptionStyle: (patch: Partial<CaptionStyle>) => void;
  updateCaptionCue: (id: string, patch: Partial<Pick<CaptionCue, 'text' | 'startFrame' | 'endFrame'>>) => void;
  removeCaptionCue: (id: string) => void;

  // local AI (Phase 3)
  transcript: TranscriptResult | null;
  localJob: { kind: string; progress: number; message: string } | null;
  removeSilences: (clipId: string, mode: SilenceMode) => Promise<{ removedSec: number; cuts: number } | null>;
  detectShotsForClip: (clipId: string, sensitivity: number) => Promise<number>;
  transcribeClip: (
    clipId: string,
    modelId: string,
    language: string | null,
    alsoCaptions: boolean,
  ) => Promise<void>;
  applyTranscriptAsCaptions: () => void;
  clearTranscript: () => void;

  // assets
  importFiles: (files: FileList | File[]) => Promise<void>;
  removeAsset: (assetId: string) => Promise<void>;
  renameAsset: (assetId: string, name: string) => Promise<void>;
  setAssetRole: (assetId: string, role: AssetRole) => Promise<void>;
  /** Register a clip produced by the generative engine (spec §205). */
  addGeneratedAsset: (asset: Asset, blob: Blob) => Promise<void>;

  // reference board (spec §23)
  addReference: (assetId: string, role: ReferenceRole, priority: ReferencePriority) => void;
  updateReference: (assetId: string, patch: Partial<Omit<ReferenceAsset, 'assetId'>>) => void;
  removeReference: (assetId: string) => void;

  // storyboard (spec §38)
  addStoryboardShot: (partial?: Partial<StoryboardShot>) => void;
  updateStoryboardShot: (id: string, patch: Partial<Omit<StoryboardShot, 'id'>>) => void;
  /** Non-undoable shot update, for generation state transitions. */
  setStoryboardShotState: (id: string, patch: Partial<Omit<StoryboardShot, 'id'>>) => void;
  removeStoryboardShot: (id: string) => void;
  moveStoryboardShot: (id: string, dir: -1 | 1) => void;

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
  transcript: null,
  localJob: null,

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
    const migrated = migrateProject(project);
    set({
      status: 'ready',
      project: migrated,
      history: initHistory(migrated, 'Recovered snapshot'),
      dirty: true,
    });
    scheduleAutosave(migrated);
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

  // ─── clip render properties (Phase 2) ─────────────────────────────────────

  patchClip(clipId, recipe, label) {
    get().mutate((draft) => {
      const clip = draft.timeline.clips.find((c) => c.id === clipId);
      if (clip) recipe(clip);
    }, label);
  },

  toggleKeyframe(clipId, param) {
    const project = get().project;
    if (!project) return;
    const clip = project.timeline.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const localFrame = Math.max(0, project.timeline.playheadFrame - clipTimelineRange(clip).start);

    get().mutate((draft) => {
      const target = draft.timeline.clips.find((c) => c.id === clipId);
      if (!target) return;
      const list = [...(target.keyframes[param] ?? [])];
      const existingIdx = list.findIndex((k) => k.frame === localFrame);
      if (existingIdx >= 0) {
        list.splice(existingIdx, 1);
      } else {
        const current = sampleParam(target, param, localFrame) ?? currentParamValue(target, param);
        list.push({ frame: localFrame, value: current, easing: 'ease-in-out' });
        list.sort((a, b) => a.frame - b.frame);
      }
      if (list.length === 0) delete target.keyframes[param];
      else target.keyframes[param] = list;
    }, `Keyframe ${param}`);
  },

  clearKeyframes(clipId, param) {
    get().mutate((draft) => {
      const target = draft.timeline.clips.find((c) => c.id === clipId);
      if (target) delete target.keyframes[param];
    }, `Clear ${param} keyframes`);
  },

  // ─── transitions (Phase 2) ───────────────────────────────────────────────

  addTransition(fromClipId, toClipId, type, durationFrames) {
    get().mutate((draft) => {
      const res = tl.addTransition(draft.timeline, { fromClipId, toClipId, type, durationFrames });
      draft.timeline = res.timeline;
    }, `Add ${type} transition`);
  },

  updateTransition(id, patch) {
    get().mutate((draft) => {
      draft.timeline = tl.updateTransition(draft.timeline, id, patch);
    }, 'Update transition');
  },

  removeTransition(id) {
    get().mutate((draft) => {
      draft.timeline = tl.removeTransition(draft.timeline, id);
    }, 'Remove transition');
  },

  // ─── captions (Phase 2) ──────────────────────────────────────────────────

  importCaptionsText(text, sourceName) {
    const project = get().project;
    if (!project) return;
    const { cues, format } = parseCaptions(text, project.settings.fps);
    if (cues.length === 0) {
      set({ error: `No caption cues found in "${sourceName}".` });
      return;
    }
    get().mutate((draft) => {
      draft.timeline.captionLayer = {
        ...draft.timeline.captionLayer,
        enabled: true,
        cues,
        sourceName,
      };
    }, `Import ${cues.length} captions (${format})`, 'import');
  },

  setCaptionsEnabled(enabled) {
    get().mutate((draft) => {
      draft.timeline.captionLayer.enabled = enabled;
    }, enabled ? 'Enable captions' : 'Disable captions');
  },

  updateCaptionStyle(patch) {
    get().mutate((draft) => {
      draft.timeline.captionLayer.style = { ...draft.timeline.captionLayer.style, ...patch };
    }, 'Update caption style');
  },

  updateCaptionCue(id, patch) {
    get().mutate((draft) => {
      draft.timeline.captionLayer.cues = draft.timeline.captionLayer.cues.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      );
    }, 'Edit caption');
  },

  removeCaptionCue(id) {
    get().mutate((draft) => {
      draft.timeline.captionLayer.cues = draft.timeline.captionLayer.cues.filter((c) => c.id !== id);
    }, 'Delete caption');
  },

  // ─── local AI (Phase 3) ──────────────────────────────────────────────────

  async removeSilences(clipId, mode) {
    const state = get();
    const project = state.project;
    if (!project) return null;
    const clip = project.timeline.clips.find((c) => c.id === clipId);
    const asset = clip && state.assets.find((a) => a.id === clip.assetId);
    if (!clip || !asset?.blobKey) {
      set({ error: 'That clip has no decodable audio.' });
      return null;
    }

    set({ localJob: { kind: 'silence', progress: 0.2, message: 'Decoding audio…' } });
    const buffer = await decodeAssetAudio(asset.blobKey);
    if (!buffer) {
      set({ localJob: null, error: 'Could not decode the clip audio.' });
      return null;
    }

    const fps = project.settings.fps;
    const mono = toMono(buffer);
    const windowPcm = sliceMono(mono, buffer.sampleRate, clip.sourceIn / fps, clip.sourceOut / fps);
    set({ localJob: { kind: 'silence', progress: 0.6, message: 'Scanning for silence…' } });

    const regions = detectSilences(
      makeMonoBuffer(windowPcm, buffer.sampleRate),
      defaultSilenceParams(mode),
    );
    if (regions.length === 0) {
      set({ localJob: null });
      return { removedSec: 0, cuts: 0 };
    }

    // Silence seconds are relative to the clip's source window → timeline frames.
    const clipRange = clipTimelineRange(clip);
    const silentTimelineRanges: FrameRange[] = regions
      .map((r) => ({
        start: clipRange.start + Math.round((r.startSec * fps) / clip.speed),
        end: clipRange.start + Math.round((r.endSec * fps) / clip.speed),
      }))
      .filter((r) => r.start > clipRange.start && r.end < clipRange.end && r.end > r.start);

    get().mutate((draft) => {
      const res = tl.removeSilencesFromClip(draft.timeline, clipId, silentTimelineRanges);
      draft.timeline = res.timeline;
    }, `Remove ${regions.length} silences`, 'ai');

    set({ localJob: null });
    return { removedSec: totalSilenceSec(regions), cuts: silentTimelineRanges.length };
  },

  async detectShotsForClip(clipId, sensitivity) {
    const state = get();
    const project = state.project;
    if (!project) return 0;
    const clip = project.timeline.clips.find((c) => c.id === clipId);
    const asset = clip && state.assets.find((a) => a.id === clip.assetId);
    if (!clip || !asset || asset.kind !== 'video' || !asset.blobKey) {
      set({ error: 'Shot detection needs a video clip.' });
      return 0;
    }

    set({ localJob: { kind: 'shots', progress: 0.1, message: 'Loading video…' } });
    const url = await getMediaUrl(asset);
    if (!url) {
      set({ localJob: null });
      return 0;
    }
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    await new Promise<void>((r) => {
      video.onloadeddata = () => r();
      video.onerror = () => r();
    });

    const fps = project.settings.fps;
    const startSec = clip.sourceIn / fps;
    const endSec = clip.sourceOut / fps;
    set({ localJob: { kind: 'shots', progress: 0.5, message: 'Analysing frames…' } });
    const cutSecs = await detectShots(video, startSec, endSec, { sensitivity, sampleFps: 4 });
    video.src = '';

    const clipRange = clipTimelineRange(clip);
    const frames = cutSecs.map(
      (s) => clipRange.start + Math.round(((s - startSec) * fps) / clip.speed),
    );
    get().mutate((draft) => {
      for (const f of frames) draft.timeline = tl.addMarker(draft.timeline, f, 'Shot');
    }, `Detect ${frames.length} shots`, 'ai');

    set({ localJob: null });
    return frames.length;
  },

  async transcribeClip(clipId, modelId, language, alsoCaptions) {
    const state = get();
    const project = state.project;
    if (!project) return;
    const clip = project.timeline.clips.find((c) => c.id === clipId);
    const asset = clip && state.assets.find((a) => a.id === clip.assetId);
    if (!clip || !asset?.blobKey) {
      set({ error: 'That clip has no audio to transcribe.' });
      return;
    }
    if (!localRuntime.isInstalled(modelId)) {
      set({ error: 'That speech model is not installed. Open AI Setup to download it.' });
      return;
    }

    try {
      set({ localJob: { kind: 'transcribe', progress: 0.05, message: 'Decoding audio…' } });
      const buffer = await decodeAssetAudio(asset.blobKey);
      if (!buffer) throw new Error('audio decode failed');
      const fps = project.settings.fps;
      const mono = sliceMono(toMono(buffer), buffer.sampleRate, clip.sourceIn / fps, clip.sourceOut / fps);

      const result = await localRuntime.transcribe(mono, buffer.sampleRate, {
        modelId,
        language,
        onProgress: (p, message) => set({ localJob: { kind: 'transcribe', progress: p, message } }),
      });

      set({ transcript: result, localJob: null });

      if (alsoCaptions) {
        const offsetSec = framesToSeconds(clipTimelineRange(clip).start, project.timeline.timebase);
        const cues = transcriptToCues(result, {
          offsetSec,
          fps,
          maxCharsPerLine: project.timeline.captionLayer.style.maxCharsPerLine,
        });
        get().mutate((draft) => {
          draft.timeline.captionLayer = {
            ...draft.timeline.captionLayer,
            enabled: true,
            cues,
            sourceName: `transcribed (${modelId})`,
          };
        }, `Transcribe → ${cues.length} captions`, 'ai');
      }
    } catch (e) {
      set({ localJob: null, error: `Transcription failed: ${String(e)}` });
    }
  },

  applyTranscriptAsCaptions() {
    const { project, transcript } = get();
    if (!project || !transcript) return;
    const cues = transcriptToCues(transcript, {
      offsetSec: 0,
      fps: project.settings.fps,
      maxCharsPerLine: project.timeline.captionLayer.style.maxCharsPerLine,
    });
    get().mutate((draft) => {
      draft.timeline.captionLayer = {
        ...draft.timeline.captionLayer,
        enabled: true,
        cues,
        sourceName: 'transcript',
      };
    }, `Transcript → ${cues.length} captions`, 'ai');
  },

  clearTranscript() {
    set({ transcript: null });
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

  async addGeneratedAsset(asset, blob) {
    await putAsset(asset, blob);
    set((s) => ({ assets: [...s.assets, asset] }));
    get().mutate((draft) => {
      draft.assetIds = [...draft.assetIds, asset.id];
    }, `Generated ${asset.name}`, 'ai');
  },

  addReference(assetId, role, priority) {
    get().mutate((draft) => {
      draft.references = [
        ...draft.references.filter((r) => r.assetId !== assetId),
        { assetId, role, priority },
      ];
    }, 'Add reference');
  },

  updateReference(assetId, patch) {
    get().mutate((draft) => {
      draft.references = draft.references.map((r) =>
        r.assetId === assetId ? { ...r, ...patch } : r,
      );
    }, 'Update reference');
  },

  removeReference(assetId) {
    get().mutate((draft) => {
      draft.references = draft.references.filter((r) => r.assetId !== assetId);
    }, 'Remove reference');
  },

  addStoryboardShot(partial) {
    get().mutate((draft) => {
      draft.storyboard = sb.addShot(draft.storyboard, partial);
    }, 'Add shot');
  },

  updateStoryboardShot(id, patch) {
    get().mutate((draft) => {
      draft.storyboard = sb.updateShot(draft.storyboard, id, patch);
    }, 'Edit shot');
  },

  setStoryboardShotState(id, patch) {
    const { project } = get();
    if (!project) return;
    const next = cloneProject(project);
    next.storyboard = sb.updateShot(next.storyboard, id, patch);
    set({ project: next });
    scheduleAutosave(next);
  },

  removeStoryboardShot(id) {
    get().mutate((draft) => {
      draft.storyboard = sb.removeShot(draft.storyboard, id);
    }, 'Remove shot');
  },

  moveStoryboardShot(id, dir) {
    get().mutate((draft) => {
      draft.storyboard = sb.moveShot(draft.storyboard, id, dir);
    }, 'Reorder shots');
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

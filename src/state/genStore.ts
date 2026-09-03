/**
 * Generation state (spec §170 — kept separate from project / UI / timeline).
 * Owns the Studio draft, drives the job queue, runs quality control on every
 * result, writes the generation record, and turns the output into a normal
 * project asset (spec §205).
 */

import { create } from 'zustand';
import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import type { Asset, GenerationMeta } from '@/domain/types';
import type { ReferenceInput } from '@/ai/provider';
import { getProvider, route } from '@/ai/orchestrator';
import { generationQueue, type GenJob, type GenKind } from '@/ai/gen/queue';
import { clipTimelineRange } from '@/domain/types';
import { clipsOnTrack, gapAt } from '@/domain/timeline/operations';
import { orderedShots } from '@/domain/storyboard';
import { extractVisualConcepts } from '@/ai/director/broll';
import { searchProject } from '@/ai/search';
import { ASPECT_PRESETS as ASPECTS } from '@/domain/project';
import { framesToSeconds, secondsToFrames } from '@/lib/time';
import { extractFrame, sampleLook } from '@/video/sampleFrames';
import { autoReframe } from '@/video/reframe';
import { matchLook as computeLookMatch } from '@/ai/style';
import { analyzeSequence, type ContinuityReport } from '@/ai/continuity';
import { getMediaUrl } from '@/state/mediaUrls';
import type { AspectRatioId } from '@/domain/types';
import { DEFAULT_STRUCTURED, buildRequest, enhance, type StructuredPrompt } from '@/ai/gen/prompt';
import { requestHash } from '@/ai/providers/procedural/proceduralProvider';
import { assessGeneration } from '@/ai/gen/quality';
import {
  buildGraph,
  findByRequestHash,
  listGenerations,
  recordGeneration,
  type GenerationNode,
} from '@/ai/gen/history';
import type { GenerationRow } from '@/storage/db';
import { useProjectStore } from './projectStore';

const log = createLogger('ai');

generationQueue.configure(getProvider, 1);

interface Draft {
  raw: string;
  structured: StructuredPrompt;
  durationSec: number;
  seed: number | null;
  seedLocked: boolean;
  firstFrameAssetId: string | null;
  quality: number;
}

interface ReuseOffer {
  row: GenerationRow;
  proceed: () => void;
}

export type StudioView = 'generate' | 'storyboard' | 'director';

interface GenState {
  mode: GenKind;
  studioView: StudioView;
  draft: Draft;
  jobs: GenJob[];
  history: GenerationRow[];
  graph: GenerationNode[];
  reuseOffer: ReuseOffer | null;
  lastResultAssetId: string | null;
  /** Progress for non-queue ops (auto-reframe render). */
  opJob: { kind: string; progress: number; message: string } | null;
  continuity: ContinuityReport | null;

  setMode: (m: GenKind) => void;
  setStudioView: (v: StudioView) => void;
  setRaw: (raw: string) => void;
  patchStructured: (patch: Partial<StructuredPrompt>) => void;
  setDuration: (sec: number) => void;
  setSeed: (seed: number | null) => void;
  toggleSeedLock: () => void;
  setFirstFrame: (assetId: string | null) => void;
  setQuality: (q: number) => void;

  generate: () => Promise<void>;
  fillGap: () => Promise<boolean>;
  makeVariations: (rowId: string, n: number) => Promise<void>;
  regenerate: (rowId: string) => Promise<void>;
  cancel: (jobId: string) => void;
  clearFinishedJobs: () => void;
  addToTimeline: (rowId: string) => void;
  refreshHistory: () => Promise<void>;
  dismissReuse: () => void;

  // Phase 5 — advanced generation
  extendClip: (clipId: string, addSec: number) => Promise<void>;
  autoReframeClip: (clipId: string, target: AspectRatioId) => Promise<void>;
  matchLook: (clipId: string, referenceAssetId: string, strength: number) => Promise<boolean>;
  generateShot: (shotId: string) => Promise<void>;
  generateAllShots: () => Promise<void>;
  /** Generative B-roll for caption cues (spec §43): search local first, else generate. */
  generateBroll: () => Promise<{ matched: number; generated: number }>;
  /** Resolves once every storyboard shot is `ready` or `failed`. */
  awaitStoryboardSettled: (timeoutMs?: number) => Promise<void>;
  assembleStoryboard: () => void;
  analyzeContinuity: () => Promise<void>;
}

const processed = new Set<string>();

function activeProject() {
  return useProjectStore.getState().project;
}

function referenceInputs(): ReferenceInput[] {
  const p = activeProject();
  if (!p) return [];
  return p.references.map((r) => ({ assetId: r.assetId, role: r.role, priority: r.priority }));
}

export const useGenStore = create<GenState>((set, get) => {
  generationQueue.subscribe((jobs) => {
    set({ jobs });
    for (const job of jobs) {
      if (processed.has(job.id)) continue;
      if (job.status.phase === 'ready' && job.result?.output) {
        processed.add(job.id);
        void finishJob(job, () => void get().refreshHistory(), set);
      } else if ((job.status.phase === 'failed' || job.status.phase === 'cancelled') && job.storyboardShotId) {
        processed.add(job.id);
        useProjectStore.getState().setStoryboardShotState(job.storyboardShotId, { state: 'failed' });
      } else if (job.status.phase === 'generating' && job.storyboardShotId) {
        const shot = useProjectStore.getState().project?.storyboard.find((s) => s.id === job.storyboardShotId);
        if (shot && shot.state !== 'generating') {
          useProjectStore.getState().setStoryboardShotState(job.storyboardShotId, { state: 'generating' });
        }
      }
    }
  });

  return {
    mode: 'text-to-video',
    draft: {
      raw: '',
      structured: { ...DEFAULT_STRUCTURED },
      durationSec: 5,
      seed: null,
      seedLocked: false,
      firstFrameAssetId: null,
      quality: 0.6,
    },
    jobs: [],
    history: [],
    graph: [],
    reuseOffer: null,
    lastResultAssetId: null,
    studioView: 'generate',
    opJob: null,
    continuity: null,

    setMode: (mode) => set({ mode }),
    setStudioView: (studioView) => set({ studioView }),
    setRaw: (raw) => set((s) => ({ draft: { ...s.draft, raw, structured: enhance(raw).structured } })),
    patchStructured: (patch) =>
      set((s) => ({ draft: { ...s.draft, structured: { ...s.draft.structured, ...patch } } })),
    setDuration: (durationSec) =>
      set((s) => ({ draft: { ...s.draft, durationSec: Math.min(20, Math.max(1, durationSec)) } })),
    setSeed: (seed) => set((s) => ({ draft: { ...s.draft, seed } })),
    toggleSeedLock: () => set((s) => ({ draft: { ...s.draft, seedLocked: !s.draft.seedLocked } })),
    setFirstFrame: (firstFrameAssetId) => set((s) => ({ draft: { ...s.draft, firstFrameAssetId } })),
    setQuality: (quality) => set((s) => ({ draft: { ...s.draft, quality } })),

    async generate() {
      const project = activeProject();
      if (!project) return;
      const { mode, draft } = get();
      const r = route(mode);
      if (!r.provider) return;
      if (mode === 'image-to-video' && !draft.firstFrameAssetId) {
        useProjectStore.setState({ error: 'Pick a first-frame image for Image → Video.' });
        return;
      }

      const seed =
        draft.seedLocked && draft.seed != null ? draft.seed : Math.floor(Math.random() * 2 ** 31);
      const aspect = project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio;
      const request = {
        ...buildRequest(project.meta.id, {
          structured: draft.structured,
          durationSec: draft.durationSec,
          fps: project.settings.fps,
          resolution: project.settings.resolution,
          aspectRatio: aspect,
          seed,
          references: referenceInputs(),
          advanced: { quality: draft.quality },
        }),
        ...(mode === 'image-to-video' && draft.firstFrameAssetId
          ? { firstFrameAssetId: draft.firstFrameAssetId }
          : {}),
      };

      const hash = requestHash(r.provider.id, mode, request);
      const enqueue = () => {
        set({ reuseOffer: null });
        generationQueue.enqueue({
          projectId: project.meta.id,
          kind: mode,
          label: draft.raw.slice(0, 40) || (mode === 'text-to-video' ? 'Text → Video' : 'Image → Video'),
          providerId: r.provider!.id,
          parentGenerationId: null,
          placement: null,
          storyboardShotId: null,
          request,
        });
      };

      const existing = await findByRequestHash(project.meta.id, hash);
      if (existing) set({ reuseOffer: { row: existing, proceed: enqueue } });
      else enqueue();
    },

    async fillGap() {
      const project = activeProject();
      if (!project) return false;
      const r = route('text-to-video');
      if (!r.provider) return false;

      const videoTrack = project.timeline.tracks.find((t) => t.kind === 'video');
      if (!videoTrack) return false;
      const gap = gapAt(project.timeline, videoTrack.id, project.timeline.playheadFrame);
      if (!gap) {
        useProjectStore.setState({ error: 'Put the playhead in a gap between two clips on a video track.' });
        return false;
      }

      const fps = project.settings.fps;
      const durationSec = Math.max(1, Math.min(20, framesToSeconds(gap.end - gap.start, project.timeline.timebase)));
      const { structured } = enhance(
        `${project.meta.aiInstructions || 'cinematic bridge shot'}, matching the surrounding footage`,
      );
      const aspect = project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio;

      generationQueue.enqueue({
        projectId: project.meta.id,
        kind: 'text-to-video',
        label: 'Fill gap',
        providerId: r.provider.id,
        parentGenerationId: null,
        placement: { trackId: videoTrack.id, atFrame: gap.start },
        storyboardShotId: null,
        request: buildRequest(project.meta.id, {
          structured,
          durationSec,
          fps,
          resolution: project.settings.resolution,
          aspectRatio: aspect,
          seed: Math.floor(Math.random() * 2 ** 31),
          references: referenceInputs(),
          advanced: { quality: get().draft.quality },
        }),
      });
      return true;
    },

    async makeVariations(rowId, n) {
      const project = activeProject();
      if (!project) return;
      const parent = get().history.find((x) => x.id === rowId);
      if (!parent) return;
      const r = route(parent.kind as GenKind);
      if (!r.provider) return;

      for (let i = 0; i < n; i++) {
        generationQueue.enqueue({
          projectId: project.meta.id,
          kind: parent.kind as GenKind,
          label: `Variation · ${parent.meta.prompt.slice(0, 24)}`,
          providerId: r.provider.id,
          parentGenerationId: rowId,
          placement: null,
          storyboardShotId: null,
          request: {
            projectId: project.meta.id,
            prompt: parent.meta.prompt,
            negativePrompt: parent.meta.negativePrompt ?? undefined,
            durationSec: parent.meta.durationSec,
            fps: parent.meta.fps,
            resolution: parent.meta.resolution,
            aspectRatio:
              project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio,
            seed: Math.floor(Math.random() * 2 ** 31),
            references: parent.meta.referenceAssetIds.map((assetId) => ({
              assetId,
              role: 'style' as const,
              priority: 'medium' as const,
            })),
            advanced: { quality: get().draft.quality },
          },
        });
      }
    },

    async regenerate(rowId) {
      await get().makeVariations(rowId, 1);
    },

    cancel: (jobId) => generationQueue.cancel(jobId),
    clearFinishedJobs: () => {
      generationQueue.clearFinished();
    },

    addToTimeline(rowId) {
      const project = activeProject();
      const row = get().history.find((h) => h.id === rowId);
      if (!project || !row) return;
      const store = useProjectStore.getState();
      const asset = store.assets.find((a) => a.id === row.assetId);
      const videoTrack = project.timeline.tracks.find((t) => t.kind === 'video');
      if (!asset || !videoTrack) return;
      store.addClipFromAsset(asset.id, videoTrack.id, project.timeline.playheadFrame);
    },

    async refreshHistory() {
      const project = activeProject();
      if (!project) {
        set({ history: [], graph: [] });
        return;
      }
      const history = await listGenerations(project.meta.id);
      set({ history, graph: buildGraph(history) });
    },

    dismissReuse: () => set({ reuseOffer: null }),

    // ─── Phase 5 — advanced generation ───────────────────────────────────────

    async extendClip(clipId, addSec) {
      const project = activeProject();
      if (!project) return;
      const store = useProjectStore.getState();
      const clip = project.timeline.clips.find((c) => c.id === clipId);
      const asset = clip && store.assets.find((a) => a.id === clip.assetId);
      if (!clip || !asset) return;
      const r = route('image-to-video');
      if (!r.provider) return;

      const bmp = await extractFrame(asset, 'last');
      if (!bmp) {
        useProjectStore.setState({ error: 'Could not read the clip’s final frame.' });
        return;
      }
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);

      const aspect =
        project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio;
      const { structured } = enhance(
        `${clip.label ?? 'shot'} continues, ${project.meta.aiInstructions || 'matching motion and light'}`,
      );

      generationQueue.enqueue({
        projectId: project.meta.id,
        kind: 'image-to-video',
        label: `Extend · ${clip.label ?? asset.name}`,
        providerId: r.provider.id,
        parentGenerationId: clip.assetId ? null : null,
        placement: {
          trackId: clip.trackId,
          atFrame: clipTimelineRange(clip).end,
        },
        storyboardShotId: null,
        request: {
          ...buildRequest(project.meta.id, {
            structured,
            durationSec: Math.min(20, Math.max(1, addSec)),
            fps: project.settings.fps,
            resolution: project.settings.resolution,
            aspectRatio: aspect,
            seed: Math.floor(Math.random() * 2 ** 31),
            references: referenceInputs(),
            advanced: { quality: get().draft.quality },
          }),
          firstFrameDataUrl: dataUrl,
        },
      });
    },

    async autoReframeClip(clipId, target) {
      const project = activeProject();
      if (!project) return;
      const store = useProjectStore.getState();
      const clip = project.timeline.clips.find((c) => c.id === clipId);
      const asset = clip && store.assets.find((a) => a.id === clip.assetId);
      if (!clip || !asset || asset.kind !== 'video' || !asset.blobKey) {
        useProjectStore.setState({ error: 'Auto-reframe needs a video clip.' });
        return;
      }
      const dst = target === 'custom' ? project.settings.resolution : ASPECTS[target];
      const src = { w: asset.meta.width ?? 1920, h: asset.meta.height ?? 1080 };

      set({ opJob: { kind: 'reframe', progress: 0.05, message: 'Loading clip…' } });
      const url = await getMediaUrl(asset);
      if (!url) {
        set({ opJob: null });
        return;
      }
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      await new Promise<void>((res) => {
        video.onloadeddata = () => res();
        video.onerror = () => res();
      });

      const fps = project.settings.fps;
      const startSec = clip.sourceIn / fps;
      const durSec = (clip.sourceOut - clip.sourceIn) / fps;
      const totalFrames = Math.max(1, Math.round(durSec * fps));

      const seek = (t: number) =>
        new Promise<void>((resolve) => {
          const done = () => {
            video.removeEventListener('seeked', done);
            resolve();
          };
          video.addEventListener('seeked', done);
          video.currentTime = Math.max(0, t);
          setTimeout(resolve, 300);
        });

      set({ opJob: { kind: 'reframe', progress: 0.1, message: 'Reframing…' } });
      const result = await autoReframe({
        srcWidth: src.w,
        srcHeight: src.h,
        dstWidth: dst.width,
        dstHeight: dst.height,
        fps,
        totalFrames,
        quality: get().draft.quality,
        drawSource: async (sctx, frame) => {
          await seek(startSec + frame / fps);
          if (video.videoWidth) sctx.drawImage(video, 0, 0, src.w, src.h);
        },
        onProgress: (f) => set({ opJob: { kind: 'reframe', progress: 0.1 + f * 0.85, message: `Frame ${Math.round(f * totalFrames)} / ${totalFrames}` } }),
      });
      video.src = '';

      const assetId = newId('asset');
      const blobKey = newId('asset');
      const ext = result.format;
      const newAsset: Asset = {
        id: assetId,
        projectId: project.meta.id,
        kind: 'video',
        role: 'generated',
        name: `${asset.name} · ${target}.${ext}`,
        blobKey,
        thumbnailDataUrl: null,
        meta: {
          durationSec: result.durationSec,
          width: result.width,
          height: result.height,
          fps,
          codec: ext === 'mp4' ? 'h264' : 'vp9',
          audioChannels: 0,
          sampleRate: null,
          rotation: null,
          sizeBytes: result.blob.size,
          mimeType: result.mimeType,
        },
        createdAt: Date.now(),
        tags: ['auto-reframe', target],
      };
      await store.addGeneratedAsset(newAsset, result.blob);
      set({ opJob: null, lastResultAssetId: assetId });
    },

    async matchLook(clipId, referenceAssetId, strength) {
      const project = activeProject();
      if (!project) return false;
      const store = useProjectStore.getState();
      const clip = project.timeline.clips.find((c) => c.id === clipId);
      const srcAsset = clip && store.assets.find((a) => a.id === clip.assetId);
      const refAsset = store.assets.find((a) => a.id === referenceAssetId);
      if (!clip || !srcAsset || !refAsset) return false;

      set({ opJob: { kind: 'look', progress: 0.3, message: 'Sampling frames…' } });
      const [srcLook, tgtLook] = await Promise.all([sampleLook(srcAsset), sampleLook(refAsset)]);
      if (!srcLook || !tgtLook) {
        set({ opJob: null });
        useProjectStore.setState({ error: 'Could not sample one of the clips.' });
        return false;
      }
      const grade = computeLookMatch(srcLook, tgtLook, strength);
      store.patchClip(clipId, (c) => {
        c.color = grade;
      }, 'Match look');
      set({ opJob: null });
      return true;
    },

    async generateShot(shotId) {
      const project = activeProject();
      if (!project) return;
      const shots = orderedShots(project.storyboard);
      const shot = shots.find((s) => s.id === shotId);
      if (!shot) return;
      const store = useProjectStore.getState();

      // Continuity: carry the previous ready shot's last frame (spec §40).
      let firstFrameDataUrl: string | undefined;
      const prev = shots[shot.order - 1];
      if (shot.carryContinuity && prev?.assetId) {
        const prevAsset = store.assets.find((a) => a.id === prev.assetId);
        const bmp = prevAsset ? await extractFrame(prevAsset, 'last') : null;
        if (bmp) {
          const c = document.createElement('canvas');
          c.width = bmp.width;
          c.height = bmp.height;
          c.getContext('2d')!.drawImage(bmp, 0, 0);
          firstFrameDataUrl = c.toDataURL('image/jpeg', 0.85);
        }
      }
      const kind: GenKind = firstFrameDataUrl ? 'image-to-video' : 'text-to-video';
      const r = route(kind);
      if (!r.provider) return;

      const { structured } = enhance(
        `${shot.prompt || shot.title}, ${shot.camera} camera, ${shot.style} style`,
      );
      const aspect =
        project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio;

      store.setStoryboardShotState(shot.id, { state: "queued" });
      generationQueue.enqueue({
        projectId: project.meta.id,
        kind,
        label: shot.title,
        providerId: r.provider.id,
        parentGenerationId: null,
        placement: null,
        storyboardShotId: shot.id,
        request: {
          ...buildRequest(project.meta.id, {
            structured,
            durationSec: shot.durationSec,
            fps: project.settings.fps,
            resolution: project.settings.resolution,
            aspectRatio: aspect,
            seed: Math.floor(Math.random() * 2 ** 31),
            references: shot.referenceAssetIds.map((assetId) => ({
              assetId,
              role: 'style' as const,
              priority: 'high' as const,
            })),
            advanced: { quality: get().draft.quality },
          }),
          ...(firstFrameDataUrl ? { firstFrameDataUrl } : {}),
        },
      });
    },

    async generateAllShots() {
      const project = activeProject();
      if (!project) return;
      for (const shot of orderedShots(project.storyboard)) {
        if (shot.state !== 'ready') await get().generateShot(shot.id);
      }
    },

    async generateBroll() {
      const project = activeProject();
      if (!project) return { matched: 0, generated: 0 };
      const store = useProjectStore.getState();
      const cues = project.timeline.captionLayer.cues;
      if (cues.length === 0) {
        useProjectStore.setState({ error: 'Generate captions first — B-roll works from the caption/transcript lines.' });
        return { matched: 0, generated: 0 };
      }
      const r = route('text-to-video');
      if (!r.provider) return { matched: 0, generated: 0 };

      // B-roll goes on the top video track (V2 by convention).
      const brollTrack =
        [...project.timeline.tracks].filter((t) => t.kind === 'video').sort((a, b) => a.index - b.index)[0];
      if (!brollTrack) return { matched: 0, generated: 0 };

      const aspect =
        project.settings.aspectRatio === 'custom' ? '16:9' : project.settings.aspectRatio;
      let matched = 0;
      let generated = 0;

      for (const cue of cues) {
        const concepts = extractVisualConcepts(cue.text);
        if (concepts.length === 0) continue;
        const hits = searchProject(project, store.assets, store.transcript ?? null, concepts[0]!);
        const assetHit = hits.find((h) => h.kind === 'asset' && h.assetId);
        if (assetHit?.assetId) {
          store.addClipFromAsset(assetHit.assetId, brollTrack.id, cue.startFrame);
          matched++;
          continue;
        }
        const durSec = Math.max(
          1,
          Math.min(8, (cue.endFrame - cue.startFrame) / project.settings.fps),
        );
        const { structured } = enhance(`${concepts.join(', ')}, b-roll, ${project.meta.aiInstructions || 'documentary'}`);
        generationQueue.enqueue({
          projectId: project.meta.id,
          kind: 'text-to-video',
          label: `B-roll · ${concepts[0]}`,
          providerId: r.provider.id,
          parentGenerationId: null,
          placement: { trackId: brollTrack.id, atFrame: cue.startFrame },
          storyboardShotId: null,
          request: buildRequest(project.meta.id, {
            structured,
            durationSec: durSec,
            fps: project.settings.fps,
            resolution: project.settings.resolution,
            aspectRatio: aspect,
            seed: Math.floor(Math.random() * 2 ** 31),
            references: referenceInputs(),
            advanced: { quality: get().draft.quality },
          }),
        });
        generated++;
      }
      return { matched, generated };
    },

    async awaitStoryboardSettled(timeoutMs = 180_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const sb = useProjectStore.getState().project?.storyboard ?? [];
        if (sb.length === 0) return;
        if (sb.every((s) => s.state === 'ready' || s.state === 'failed')) return;
        await new Promise((r) => setTimeout(r, 400));
      }
    },

    assembleStoryboard() {
      const project = activeProject();
      if (!project) return;
      const store = useProjectStore.getState();
      const track = project.timeline.tracks.find((t) => t.kind === 'video');
      if (!track) return;
      const shots = orderedShots(project.storyboard).filter((s) => s.assetId);
      let at = clipsOnTrack(project.timeline, track.id).reduce(
        (m, c) => Math.max(m, clipTimelineRange(c).end),
        project.timeline.playheadFrame,
      );
      for (const shot of shots) {
        const asset = store.assets.find((a) => a.id === shot.assetId);
        if (!asset) continue;
        store.addClipFromAsset(asset.id, track.id, at);
        at += secondsToFrames(asset.meta.durationSec ?? shot.durationSec, project.timeline.timebase);
      }
    },

    async analyzeContinuity() {
      const project = activeProject();
      if (!project) {
        set({ continuity: null });
        return;
      }
      if (continuityRunning) return;
      continuityRunning = true;
      try {
      const store = useProjectStore.getState();
      const track = project.timeline.tracks.find((t) => t.kind === 'video');
      if (!track) {
        set({ continuity: null });
        return;
      }
      const clips = clipsOnTrack(project.timeline, track.id);
      const items = [];
      for (const c of clips) {
        const asset = store.assets.find((a) => a.id === c.assetId);
        const look = asset
          ? await sampleLook(asset, {
              startSec: c.sourceIn / project.settings.fps,
              endSec: c.sourceOut / project.settings.fps,
              frames: 3,
            })
          : null;
        items.push({ id: c.id, label: c.label ?? c.assetId, look });
      }
      set({ continuity: analyzeSequence(items) });
      } finally {
        continuityRunning = false;
      }
    },
  };
});

let continuityRunning = false;

async function finishJob(
  job: GenJob,
  afterHistory: () => void,
  set: (partial: Partial<GenState>) => void,
): Promise<void> {
  const out = job.result?.output;
  if (!out) return;
  const project = useProjectStore.getState().project;
  if (!project || project.meta.id !== job.projectId) return;

  const report = await assessGeneration(out.blob, {
    width: job.request.resolution.width,
    height: job.request.resolution.height,
    durationSec: job.request.durationSec,
    fps: job.request.fps,
  });

  const ext = out.mimeType.includes('mp4') ? 'mp4' : 'webm';
  const assetId = newId('asset');
  const blobKey = newId('asset');
  const genId = newId('gen');
  const name = `${job.label || 'generation'} · ${new Date(job.createdAt).toLocaleTimeString()}.${ext}`;

  const meta: GenerationMeta = {
    generationId: genId,
    parentId: job.parentGenerationId,
    providerId: job.providerId,
    modelId: job.result!.modelId,
    modelVersion: job.result!.modelVersion,
    prompt: job.request.prompt,
    negativePrompt: job.request.negativePrompt ?? null,
    referenceAssetIds: (job.request.references ?? []).map((r) => r.assetId),
    seed: job.result!.seed,
    params: {
      quality: Number(job.request.advanced?.quality ?? 0.6),
      durationSec: job.request.durationSec,
    },
    durationSec: out.durationSec,
    resolution: job.request.resolution,
    fps: job.request.fps,
    createdAt: Date.now(),
    qualityScore: report.score,
  };

  const asset: Asset = {
    id: assetId,
    projectId: project.meta.id,
    kind: 'video',
    role: 'generated',
    name,
    blobKey,
    thumbnailDataUrl: await posterFrame(out.blob),
    meta: {
      durationSec: out.durationSec,
      width: job.request.resolution.width,
      height: job.request.resolution.height,
      fps: job.request.fps,
      codec: ext === 'mp4' ? 'h264' : 'vp9',
      audioChannels: 0,
      sampleRate: null,
      rotation: null,
      sizeBytes: out.blob.size,
      mimeType: out.mimeType,
    },
    createdAt: Date.now(),
    generation: meta,
    tags: [],
  };

  await useProjectStore.getState().addGeneratedAsset(asset, out.blob);

  const row: GenerationRow = {
    id: genId,
    projectId: project.meta.id,
    parentId: job.parentGenerationId,
    kind: job.kind,
    requestHash: requestHash(job.providerId, job.kind, job.request),
    assetId,
    meta,
    qualityScore: report.score,
    qualityIssues: report.issues,
    createdAt: Date.now(),
  };
  await recordGeneration(row);

  if (job.placement) {
    const store = useProjectStore.getState();
    if (store.assets.some((a) => a.id === assetId)) {
      store.addClipFromAsset(assetId, job.placement.trackId, job.placement.atFrame);
    }
  }

  if (job.storyboardShotId) {
    useProjectStore.getState().setStoryboardShotState(job.storyboardShotId, {
      assetId,
      lastGenerationId: genId,
      state: 'ready',
    });
  }

  log.info('generation finished', { id: genId, score: report.score, issues: report.issues.length });
  set({ lastResultAssetId: assetId });
  afterHistory();
}

async function posterFrame(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new Error('load'));
      setTimeout(res, 2000);
    });
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = Math.min(0.2, (video.duration || 1) / 2);
      setTimeout(res, 800);
    });
    if (!video.videoWidth) return null;
    const c = document.createElement('canvas');
    const scale = 320 / Math.max(video.videoWidth, video.videoHeight);
    c.width = Math.round(video.videoWidth * scale);
    c.height = Math.round(video.videoHeight * scale);
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

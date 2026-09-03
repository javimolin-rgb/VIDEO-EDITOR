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
import { gapAt } from '@/domain/timeline/operations';
import { framesToSeconds } from '@/lib/time';
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

interface GenState {
  mode: GenKind;
  draft: Draft;
  jobs: GenJob[];
  history: GenerationRow[];
  graph: GenerationNode[];
  reuseOffer: ReuseOffer | null;
  lastResultAssetId: string | null;

  setMode: (m: GenKind) => void;
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
      if (job.status.phase === 'ready' && job.result?.output && !processed.has(job.id)) {
        processed.add(job.id);
        void finishJob(job, () => void get().refreshHistory(), set);
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

    setMode: (mode) => set({ mode }),
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
  };
});

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
    URL.revokeObjectURL(url);
    video.src = '';
  }
}

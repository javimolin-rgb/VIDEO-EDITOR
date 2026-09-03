/**
 * Automation engine (spec §87, §82, §141, §182). Stores reusable recipes and
 * brand templates, runs a recipe step by step against the project (reusing the
 * Phase 2–6 operations), and repurposes a project into social variants.
 */

import { create } from 'zustand';
import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import { db } from '@/storage/db';
import type { AspectRatioId, CaptionPreset } from '@/domain/types';
import { clipsOnTrack } from '@/domain/timeline/operations';
import { renderAudioMix } from '@/export/audioMixer';
import { rmsDbFromBuffer, gainForTarget } from '@/automation/normalize';
import { autoColorGrade } from '@/automation/autocolor';
import { buildContentPack, type ContentPack } from '@/automation/contentPack';
import { sampleLook } from '@/video/sampleFrames';
import { localRuntime } from '@/ai/local/runtime';
import {
  STEP_DEFS,
  stepDef,
  type BrandTemplate,
  type Recipe,
  type RecipeRun,
  type RecipeRunStep,
  type RecipeStep,
  type RecipeStepKind,
} from '@/automation/types';
import { useProjectStore, setOnImportComplete } from './projectStore';
import { useGenStore } from './genStore';
import type { SilenceMode } from '@/audio/silence';

const log = createLogger('runtime');

const PLATFORMS: Array<{ id: string; label: string; aspect: AspectRatioId }> = [
  { id: 'reel', label: 'Instagram Reel', aspect: '9:16' },
  { id: 'tiktok', label: 'TikTok', aspect: '9:16' },
  { id: 'story', label: 'Story', aspect: '9:16' },
  { id: 'short', label: 'YouTube Short', aspect: '9:16' },
  { id: 'square', label: 'Square post', aspect: '1:1' },
  { id: 'portrait', label: 'Portrait 4:5', aspect: '4:5' },
  { id: 'landscape', label: 'YouTube 16:9', aspect: '16:9' },
];

interface AutomationState {
  recipes: Recipe[];
  brandTemplates: BrandTemplate[];
  run: RecipeRun | null;
  contentPack: ContentPack | null;
  platforms: typeof PLATFORMS;

  load: () => Promise<void>;

  createRecipe: (name: string) => Promise<string>;
  updateRecipe: (id: string, patch: Partial<Omit<Recipe, 'id'>>) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  addStep: (recipeId: string, kind: RecipeStepKind) => Promise<void>;
  updateStep: (recipeId: string, stepId: string, params: RecipeStep['params']) => Promise<void>;
  removeStep: (recipeId: string, stepId: string) => Promise<void>;
  moveStep: (recipeId: string, stepId: string, dir: -1 | 1) => Promise<void>;

  runRecipe: (id: string) => Promise<void>;

  saveBrandTemplate: (name: string) => Promise<void>;
  deleteBrandTemplate: (id: string) => Promise<void>;
  applyBrandTemplate: (id: string) => void;

  repurpose: (platformIds: string[]) => Promise<void>;
  buildPack: () => void;
}

let running = false;

export const useAutomationStore = create<AutomationState>((set, get) => ({
  recipes: [],
  brandTemplates: [],
  run: null,
  contentPack: null,
  platforms: PLATFORMS,

  async load() {
    const [recipes, brandTemplates] = await Promise.all([
      db.recipes.orderBy('updatedAt').reverse().toArray(),
      db.brandTemplates.orderBy('createdAt').reverse().toArray(),
    ]);
    set({ recipes, brandTemplates });
  },

  async createRecipe(name) {
    const recipe: Recipe = {
      id: newId('action'),
      name: name.trim() || 'New recipe',
      trigger: 'manual',
      importKinds: [],
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
    };
    await db.recipes.put(recipe);
    await get().load();
    return recipe.id;
  },

  async updateRecipe(id, patch) {
    const cur = await db.recipes.get(id);
    if (!cur) return;
    await db.recipes.put({ ...cur, ...patch, id, updatedAt: Date.now() });
    await get().load();
  },

  async deleteRecipe(id) {
    await db.recipes.delete(id);
    await get().load();
  },

  async addStep(recipeId, kind) {
    const r = await db.recipes.get(recipeId);
    if (!r) return;
    const params: RecipeStep['params'] = {};
    for (const p of stepDef(kind).params) params[p.key] = p.default;
    r.steps.push({ id: newId('action'), kind, params });
    await db.recipes.put({ ...r, updatedAt: Date.now() });
    await get().load();
  },

  async updateStep(recipeId, stepId, params) {
    const r = await db.recipes.get(recipeId);
    if (!r) return;
    r.steps = r.steps.map((s) => (s.id === stepId ? { ...s, params } : s));
    await db.recipes.put({ ...r, updatedAt: Date.now() });
    await get().load();
  },

  async removeStep(recipeId, stepId) {
    const r = await db.recipes.get(recipeId);
    if (!r) return;
    r.steps = r.steps.filter((s) => s.id !== stepId);
    await db.recipes.put({ ...r, updatedAt: Date.now() });
    await get().load();
  },

  async moveStep(recipeId, stepId, dir) {
    const r = await db.recipes.get(recipeId);
    if (!r) return;
    const i = r.steps.findIndex((s) => s.id === stepId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= r.steps.length) return;
    [r.steps[i], r.steps[j]] = [r.steps[j]!, r.steps[i]!];
    await db.recipes.put({ ...r, updatedAt: Date.now() });
    await get().load();
  },

  async runRecipe(id) {
    const recipe = get().recipes.find((r) => r.id === id) ?? (await db.recipes.get(id));
    if (!recipe || running) return;
    running = true;

    const runSteps: RecipeRunStep[] = recipe.steps.map((s) => ({
      stepId: s.id,
      kind: s.kind,
      title: stepDef(s.kind).label,
      status: 'pending',
    }));
    set({ run: { recipeId: id, startedAt: Date.now(), steps: runSteps, done: false } });

    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i]!;
      set((s) => ({
        run: s.run && { ...s.run, steps: patch(s.run.steps, step.id, { status: 'running' }) },
      }));
      try {
        const result = await executeStep(step);
        set((s) => ({
          run:
            s.run &&
            { ...s.run, steps: patch(s.run.steps, step.id, { status: result.status, result: result.message }) },
        }));
      } catch (e) {
        set((s) => ({
          run:
            s.run &&
            { ...s.run, steps: patch(s.run.steps, step.id, { status: 'failed', result: String((e as Error).message ?? e) }) },
        }));
        break;
      }
    }

    set((s) => ({ run: s.run && { ...s.run, done: true } }));
    running = false;
    void useGenStore.getState().refreshHistory();
  },

  async saveBrandTemplate(name) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const t: BrandTemplate = {
      id: newId('action'),
      name: name.trim() || 'Brand',
      captionStyle: { ...project.timeline.captionLayer.style },
      colors: [...project.brandKit.colors],
      fonts: [...project.brandKit.fonts],
      primaryAspect: project.settings.aspectRatio,
      createdAt: Date.now(),
    };
    await db.brandTemplates.put(t);
    await get().load();
  },

  async deleteBrandTemplate(id) {
    await db.brandTemplates.delete(id);
    await get().load();
  },

  applyBrandTemplate(id) {
    const t = get().brandTemplates.find((x) => x.id === id);
    const store = useProjectStore.getState();
    if (!t || !store.project) return;
    store.mutate((draft) => {
      draft.timeline.captionLayer.style = { ...t.captionStyle };
      draft.brandKit.colors = [...t.colors];
      draft.brandKit.fonts = [...t.fonts];
    }, `Apply brand: ${t.name}`, 'ai');
  },

  async repurpose(platformIds) {
    const store = useProjectStore.getState();
    const gen = useGenStore.getState();
    const project = store.project;
    if (!project) return;
    const track = project.timeline.tracks.find((t) => t.kind === 'video');
    const firstClip = track && clipsOnTrack(project.timeline, track.id)[0];
    if (!firstClip) {
      useProjectStore.setState({ error: 'Add a video clip to the timeline before repurposing.' });
      return;
    }

    for (const pid of platformIds) {
      const plat = PLATFORMS.find((p) => p.id === pid);
      if (!plat || plat.aspect === project.settings.aspectRatio) continue;
      await gen.autoReframeClip(firstClip.id, plat.aspect);
    }
    get().buildPack();
  },

  buildPack() {
    const store = useProjectStore.getState();
    const project = store.project;
    if (!project) return;
    const lines =
      project.timeline.captionLayer.cues.map((c) => c.text) ??
      store.transcript?.segments.map((s) => s.text) ??
      [];
    set({ contentPack: buildContentPack(lines.length ? lines : [project.meta.name]) });
  },
}));

// ─── step execution ─────────────────────────────────────────────────────────

function patch(steps: RecipeRunStep[], id: string, p: Partial<RecipeRunStep>): RecipeRunStep[] {
  return steps.map((s) => (s.stepId === id ? { ...s, ...p } : s));
}

async function executeStep(step: RecipeStep): Promise<{ status: RecipeRunStep['status']; message: string }> {
  const store = useProjectStore.getState;
  const gen = useGenStore.getState;
  const project = store().project;
  if (!project) return { status: 'failed', message: 'No project.' };

  const videoTrack = project.timeline.tracks.find((t) => t.kind === 'video');
  const audioTracks = project.timeline.tracks.filter((t) => t.kind === 'audio');
  const videoClips = videoTrack ? clipsOnTrack(project.timeline, videoTrack.id) : [];
  const allClips = project.timeline.clips;

  log.info('recipe step', { kind: step.kind });

  switch (step.kind) {
    case 'remove-silences': {
      const mode = (step.params.mode as SilenceMode) ?? 'balanced';
      let cuts = 0;
      for (const c of allClips) {
        const asset = store().assets.find((a) => a.id === c.assetId);
        if (!asset || (asset.meta.audioChannels ?? 0) === 0) continue;
        const res = await store().removeSilences(c.id, mode);
        cuts += res?.cuts ?? 0;
      }
      return { status: 'done', message: `Removed ${cuts} silent span(s).` };
    }

    case 'detect-shots': {
      let n = 0;
      for (const c of videoClips) n += await store().detectShotsForClip(c.id, Number(step.params.sensitivity ?? 0.45));
      return { status: 'done', message: `Added ${n} shot marker(s).` };
    }

    case 'generate-captions': {
      const model = String(step.params.model ?? 'whisper-tiny-en');
      if (!localRuntime.isInstalled(model)) {
        return { status: 'skipped', message: `${model} not installed — open AI Setup to download it.` };
      }
      const target =
        allClips.find((c) => {
          const asset = store().assets.find((a) => a.id === c.assetId);
          return asset && (asset.kind === 'audio' || (asset.meta.audioChannels ?? 0) > 0);
        }) ?? allClips[0];
      if (!target) return { status: 'skipped', message: 'No audio clip to transcribe.' };
      await store().transcribeClip(target.id, model, null, true);
      const cues = store().project?.timeline.captionLayer.cues.length ?? 0;
      return { status: 'done', message: `Transcribed → ${cues} caption cue(s).` };
    }

    case 'caption-style': {
      store().updateCaptionStyle({ preset: (step.params.preset as CaptionPreset) ?? 'bold' });
      return { status: 'done', message: `Caption style set to ${step.params.preset}.` };
    }

    case 'normalize-audio': {
      if (audioTracks.length === 0) return { status: 'skipped', message: 'No audio tracks.' };
      const dur = Math.max(1, project.timeline.durationFrames / project.settings.fps);
      const buffer = await renderAudioMix(project, store().assets, 44100, dur);
      if (!buffer) return { status: 'skipped', message: 'No audio in the mix.' };
      const currentDb = rmsDbFromBuffer(buffer);
      const gainMul = gainForTarget(currentDb, Number(step.params.targetDb ?? -16));
      for (const t of audioTracks) store().updateTrack(t.id, { gain: Math.max(0, Math.min(4, t.gain * gainMul)) });
      return {
        status: 'done',
        message: `Mix was ${currentDb.toFixed(1)} dBFS → gain ×${gainMul.toFixed(2)}.`,
      };
    }

    case 'auto-color': {
      const strength = Number(step.params.strength ?? 0.6);
      let graded = 0;
      for (const c of videoClips) {
        const asset = store().assets.find((a) => a.id === c.assetId);
        if (!asset) continue;
        const look = await sampleLook(asset, {
          startSec: c.sourceIn / project.settings.fps,
          endSec: c.sourceOut / project.settings.fps,
          frames: 3,
        });
        if (!look) continue;
        const grade = autoColorGrade(look, strength);
        store().patchClip(c.id, (cl) => {
          cl.color = grade;
        }, 'Auto colour');
        graded++;
      }
      return { status: 'done', message: `Graded ${graded} clip(s).` };
    }

    case 'auto-reframe': {
      if (!videoClips[0]) return { status: 'skipped', message: 'No video clip.' };
      await gen().autoReframeClip(videoClips[0].id, (step.params.aspect as AspectRatioId) ?? '9:16');
      return { status: 'done', message: `Reframed to ${step.params.aspect}.` };
    }

    case 'add-broll': {
      const res = await gen().generateBroll();
      return { status: 'done', message: `${res.matched} matched, ${res.generated} generated.` };
    }

    case 'apply-brand': {
      const id = String(step.params.templateId ?? '');
      const t = useAutomationStore.getState().brandTemplates.find((x) => x.id === id);
      if (!t) return { status: 'skipped', message: 'Brand template not found.' };
      useAutomationStore.getState().applyBrandTemplate(id);
      return { status: 'done', message: `Applied brand “${t.name}”.` };
    }

    case 'export':
      return {
        status: 'skipped',
        message: `Ready to export ${step.params.format}/${step.params.aspect} — run it from the Export dialog.`,
      };

    default:
      return { status: 'skipped', message: 'Unknown step.' };
  }
}

// ─── on-import trigger (spec §87) ───────────────────────────────────────────

setOnImportComplete((kinds) => {
  const st = useAutomationStore.getState();
  const recipe = st.recipes.find(
    (r) =>
      r.enabled &&
      r.trigger === 'on-import' &&
      (r.importKinds.length === 0 || r.importKinds.some((k) => kinds.includes(k))),
  );
  if (recipe) {
    log.info('on-import recipe firing', { recipe: recipe.name });
    void st.runRecipe(recipe.id);
  }
});

export { STEP_DEFS };

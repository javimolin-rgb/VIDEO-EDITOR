/**
 * AI Director state + executor (spec §80, §126, §194, §195). The plan is
 * built by the deterministic planners; this store shows it, gates it by the
 * autonomy level, runs each step against the existing capabilities, and
 * records a plain-language outcome per step (spec §120).
 */

import { create } from 'zustand';
import { createLogger } from '@/lib/logger';
import { clipsOnTrack, contentEndFrame } from '@/domain/timeline/operations';
import { createShot } from '@/domain/storyboard';
import { clipTimelineRange, type CaptionCue, type StoryboardShot } from '@/domain/types';
import { sampleLook } from '@/video/sampleFrames';
import { inferBrief } from '@/ai/director/brief';
import { planFromBrief, planFromScript } from '@/ai/director/planner';
import {
  AUTONOMY_LABEL,
  DEFAULT_BRIEF,
  type AutonomyLevel,
  type CreativeBrief,
  type DirectorPlan,
  type PlanStep,
} from '@/ai/director/types';
import { newId } from '@/lib/id';
import { useProjectStore } from './projectStore';
import { useGenStore } from './genStore';

const log = createLogger('ai');

export type DirectorInput = 'brief' | 'script';

interface DirectorState {
  input: DirectorInput;
  brief: CreativeBrief;
  script: string;
  autonomy: AutonomyLevel;
  plan: DirectorPlan | null;
  running: boolean;
  currentStepId: string | null;
  log: string[];

  setInput: (v: DirectorInput) => void;
  patchBrief: (patch: Partial<CreativeBrief>) => void;
  setScript: (s: string) => void;
  setAutonomy: (a: AutonomyLevel) => void;

  buildPlan: () => void;
  editShotPrompt: (index: number, prompt: string) => void;
  removePlanStep: (id: string) => void;
  discardPlan: () => void;

  /** Approve + run (semi-auto / auto / full-auto). */
  runPlan: () => Promise<void>;
  /** Assisted mode: run one pending step. */
  runStep: (id: string) => Promise<void>;
}

function patchStep(plan: DirectorPlan, id: string, patch: Partial<PlanStep>): DirectorPlan {
  return { ...plan, steps: plan.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export const useDirectorStore = create<DirectorState>((set, get) => ({
  input: 'brief',
  brief: { ...DEFAULT_BRIEF },
  script: '',
  autonomy: 'semi-auto',
  plan: null,
  running: false,
  currentStepId: null,
  log: [],

  setInput: (input) => set({ input }),
  patchBrief: (patch) => set((s) => ({ brief: { ...s.brief, ...patch } })),
  setScript: (script) => set({ script }),
  setAutonomy: (autonomy) => set({ autonomy }),

  buildPlan: () => {
    const { input, brief, script } = get();
    const plan =
      input === 'script'
        ? planFromScript(script, brief.style)
        : planFromBrief(inferBrief(brief.objective || 'Showcase the product', brief.product) );
    set({ plan, log: [`Plan built: ${plan.goal}`], currentStepId: null });
  },

  editShotPrompt: (index, prompt) =>
    set((s) =>
      s.plan
        ? { plan: { ...s.plan, shots: s.plan.shots.map((sh, i) => (i === index ? { ...sh, prompt } : sh)) } }
        : s,
    ),

  removePlanStep: (id) =>
    set((s) => (s.plan ? { plan: { ...s.plan, steps: s.plan.steps.filter((st) => st.id !== id) } } : s)),

  discardPlan: () => set({ plan: null, log: [], currentStepId: null }),

  async runStep(id) {
    const plan = get().plan;
    if (!plan || get().running) return;
    const stepIndex = plan.steps.findIndex((s) => s.id === id);
    if (stepIndex < 0) return;
    set({ running: true, currentStepId: id });
    await executeStep(plan, stepIndex, set, get);
    set({ running: false, currentStepId: null });
  },

  async runPlan() {
    const { plan, autonomy } = get();
    if (!plan || get().running) return;
    set({ running: true, log: [...get().log, `Running plan (${AUTONOMY_LABEL[autonomy].split(' —')[0]})…`] });

    for (let i = 0; i < get().plan!.steps.length; i++) {
      const step = get().plan!.steps[i]!;
      if (step.status === 'done' || step.status === 'skipped') continue;
      if (step.kind === 'export-variants' && autonomy !== 'full-auto') {
        set((s) => ({
          plan: patchStep(s.plan!, step.id, { status: 'skipped', result: 'Left for you to run from Export.' }),
        }));
        continue;
      }
      set({ currentStepId: step.id });
      const ok = await executeStep(get().plan!, i, set, get);
      if (!ok && autonomy !== 'full-auto') break;
    }

    set({ running: false, currentStepId: null, log: [...get().log, 'Plan finished.'] });
    void useGenStore.getState().refreshHistory();
  },
}));

// ─── step execution ─────────────────────────────────────────────────────────

type SetFn = (partial: Partial<DirectorState> | ((s: DirectorState) => Partial<DirectorState>)) => void;
type GetFn = () => DirectorState;

async function executeStep(plan: DirectorPlan, index: number, set: SetFn, get: GetFn): Promise<boolean> {
  const step = plan.steps[index]!;
  const project = useProjectStore.getState().project;
  if (!project) return false;
  const gen = useGenStore.getState;
  const proj = useProjectStore.getState;

  const finish = (status: PlanStep['status'], result: string) => {
    set((s) => ({
      plan: s.plan ? patchStep(s.plan, step.id, { status, result }) : s.plan,
      log: [...s.log, `${step.title}: ${result}`],
    }));
  };
  set((s) => ({ plan: s.plan ? patchStep(s.plan, step.id, { status: 'running' }) : s.plan }));
  log.info('director step', { kind: step.kind });

  try {
    switch (step.kind) {
      case 'analyze': {
        const refs = project.references
          .map((r) => proj().assets.find((a) => a.id === r.assetId))
          .filter(Boolean);
        let sampled = 0;
        for (const a of refs) {
          if (a && (await sampleLook(a))) sampled++;
        }
        finish('done', sampled ? `Sampled ${sampled} reference(s) for a style profile.` : 'No references — using brief defaults.');
        return true;
      }

      case 'build-storyboard': {
        const shots: StoryboardShot[] = get().plan!.shots.map((d, i) =>
          createShot({
            order: i,
            title: d.title,
            prompt: d.prompt,
            camera: d.camera,
            style: d.style,
            durationSec: d.durationSec,
            carryContinuity: d.carryContinuity,
          }),
        );
        proj().setStoryboard(shots);
        finish('done', `Created ${shots.length} shots in the storyboard.`);
        return true;
      }

      case 'generate-shots': {
        await gen().generateAllShots();
        await gen().awaitStoryboardSettled();
        const sb = proj().project?.storyboard ?? [];
        const ready = sb.filter((s) => s.state === 'ready').length;
        finish(ready ? 'done' : 'failed', `${ready}/${sb.length} shots generated.`);
        return ready > 0;
      }

      case 'qc-retry': {
        const history = gen().history;
        const sb = proj().project?.storyboard ?? [];
        let retried = 0;
        for (const shot of sb) {
          const rec = history.find((h) => h.id === shot.lastGenerationId);
          if (rec && (rec.qualityScore ?? 1) < 0.55) {
            await gen().generateShot(shot.id);
            retried++;
          }
        }
        if (retried) await gen().awaitStoryboardSettled();
        finish('done', retried ? `Regenerated ${retried} weak shot(s).` : 'All shots passed quality control.');
        return true;
      }

      case 'assemble': {
        const before = contentEndFrame(proj().project!.timeline);
        gen().assembleStoryboard();
        const after = contentEndFrame(proj().project!.timeline);
        finish('done', `Placed shots on the timeline (+${Math.max(0, after - before)} frames).`);
        return true;
      }

      case 'color-match': {
        const p = proj().project!;
        const track = p.timeline.tracks.find((t) => t.kind === 'video');
        if (!track) return finish('skipped', 'No video track.'), true;
        const clips = clipsOnTrack(p.timeline, track.id);
        const first = clips[0];
        if (!first || clips.length < 2) return finish('skipped', 'Not enough clips to match.'), true;
        let graded = 0;
        for (const c of clips.slice(1)) {
          if (await gen().matchLook(c.id, first.assetId, 0.7)) graded++;
        }
        finish('done', `Graded ${graded} clip(s) toward the opening shot.`);
        return true;
      }

      case 'captions': {
        const lines = get().plan!.captionLines;
        const p = proj().project!;
        const track = p.timeline.tracks.find((t) => t.kind === 'video');
        if (!track || lines.length === 0) return finish('skipped', 'No script lines to caption.'), true;
        const clips = clipsOnTrack(p.timeline, track.id);
        const cues: CaptionCue[] = [];
        for (let i = 0; i < lines.length && i < clips.length; i++) {
          const r = clipTimelineRange(clips[i]!);
          cues.push({ id: newId('marker'), startFrame: r.start, endFrame: r.end, text: lines[i]! });
        }
        proj().mutate((draft) => {
          draft.timeline.captionLayer = {
            ...draft.timeline.captionLayer,
            enabled: true,
            cues,
            sourceName: 'AI Director script',
          };
        }, 'Director captions', 'ai');
        finish('done', `Added ${cues.length} caption cue(s) from the script.`);
        return true;
      }

      case 'broll': {
        const res = await gen().generateBroll();
        finish(
          'done',
          `${res.matched} clip(s) matched from your media, ${res.generated} generated as B-roll.`,
        );
        return true;
      }

      case 'music':
      case 'sound-design':
        finish('skipped', 'No local model for this in the current build.');
        return true;

      case 'export-variants': {
        finish('skipped', `Ready to export ${get().plan!.exportAspects.join(' / ')} from the Export dialog.`);
        return true;
      }

      default:
        finish('skipped', 'Unknown step.');
        return true;
    }
  } catch (e) {
    finish('failed', String((e as Error).message ?? e));
    return false;
  }
}

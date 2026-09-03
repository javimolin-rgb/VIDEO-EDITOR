# AI Director

**No LLM.** The Director is a deterministic planner + executor that turns a
brief or a script into an editable, numbered plan, then runs it against the
capabilities the app already has. Every step reports, in plain language, what
it did (spec §18, §80, §120, §126, §194, §195).

```
brief / script
      │  planFromBrief · planFromScript · inferBrief
      ▼
DirectorPlan { goal, shots[], captionLines[], exportAspects[], steps[] }
      │  approve (autonomy level gates this)
      ▼
executor (state/directorStore.ts) — step by step:
  analyse → build-storyboard → generate-shots → qc-retry → assemble
          → captions → broll → color-match → music/sfx(skip) → export-variants
      │  reuses the Phase 4/5 queue, QC, storyboard, look-match, caption engine
      ▼
timeline (normal clips) + AI activity log
```

## Modules

| File | Role |
| --- | --- |
| `ai/director/types.ts` | `DirectorPlan`, `PlanStep`, `CreativeBrief`, `AutonomyLevel`. |
| `ai/director/brief.ts` | `inferBrief(objective, product)` — style / platform / duration / mood / shot-count from free text (spec §183). `briefSummary`. |
| `ai/director/planner.ts` | `planFromBrief`, `planFromScript`, `splitScriptBeats`. |
| `ai/director/broll.ts` | `extractVisualConcepts(line)` — concrete noun phrases for B-roll (spec §43). |
| `state/directorStore.ts` | plan state, autonomy, `buildPlan` / `runPlan` / `runStep` / `editShotPrompt` / `removePlanStep`, and `executeStep`. |
| `state/genStore.ts` | `generateBroll`, `awaitStoryboardSettled` (used by the executor). |
| `ui/editor/studio/DirectorView.tsx` | the third Studio view. |

## Autonomy levels (spec §195)

| Level | Behaviour |
| --- | --- |
| `assisted` | Build the plan; a **Run** button per pending step. Nothing auto-runs. |
| `semi-auto` | Approve once → run every step to completion; `export-variants` is left for the user. |
| `auto` | Same as semi-auto but with no approval dialog. |
| `full-auto` | Run everything, including `export-variants`. |

## What the executor reuses

- **build-storyboard** → `projectStore.setStoryboard` (from the plan's shots)
- **generate-shots** → `genStore.generateAllShots` + `awaitStoryboardSettled`
  (I2V carry-continuity from the previous shot's last frame)
- **qc-retry** → regenerate any shot whose generation record scored < 0.55
- **assemble** → `genStore.assembleStoryboard`
- **captions** → caption cues from the script beats, timed to the assembled clips
- **broll** → `genStore.generateBroll` (search local media first, else generate)
- **color-match** → `genStore.matchLook` each clip toward the opening clip
- **music / sound-design** → `skipped` — needs a local model this build lacks
- **export-variants** → prepared; run from the Export dialog (or auto in full-auto)

## Not the Director's job (yet)

Multi-concept ad generation (§130) = run the plan a few times with prompt
variations. Moodboard image generation (§184) needs a local image model.
Campaign packaging (§81) is Phase 7 automation.

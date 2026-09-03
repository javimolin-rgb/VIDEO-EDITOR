# Generation engine

The generative side is built entirely against the model-agnostic
`VideoGenerationProvider` interface (spec §4, §201). Removing every adapter but
`local` still compiles; the procedural generator needs nothing installed, so
Text→Video and Image→Video are never dead ends.

```
Studio UI ──► genStore ──► prompt engine ──► GenerationQueue ──► provider
   ▲                                              │                 │
   │                                     phases / cancel     synthesised MP4
   └──────── generation history ◄── QC ◄── asset (role: generated) ◄┘
```

## Pieces

| Module | Role |
| --- | --- |
| `ai/gen/prompt.ts` | Free text → `StructuredPrompt` (subject/camera/style/motion/colour/constraints), heuristic **enhancer** (never discards user text), `composePrompt`, `buildRequest`. |
| `ai/gen/queue.ts` | `GenerationQueue` — jobs with real phases (`queued → preparing → generating → quality-check → ready`), `AbortController` cancel, concurrency cap (1 by default so a GPU backend is never double-booked). |
| `ai/providers/procedural/` | `ProceduralVideoProvider` — a **real** local generator: seeded frame synthesis (`synth.ts`) from the prompt's palette / motion / camera, encoded via `video/encode.ts` (WebCodecs MP4, WebM fallback). Not a diffusion model, clearly labelled, not a placeholder. `requestHash` for dedup. |
| `ai/providers/local/localProvider.ts` | Native diffusion runtime client — registered, `capabilities` all-false until a service + model exist. |
| `ai/orchestrator.ts` | `route(task)` picks the first provider whose `capabilities` cover it (native ahead of procedural once present), or explains why none can. |
| `ai/gen/quality.ts` | `assessGeneration(blob, expect)` — decodes the output, checks size / resolution / duration / not-all-black / flicker → `{ score, passed, issues }` (spec §78). Never insert blindly. |
| `ai/gen/history.ts` + Dexie `generations` | One row per generated clip: prompt / model / seed / params / **parentId** → `buildGraph` forms the variation tree (spec §75, §124, §125). `findByRequestHash` powers "use existing result" (spec §173). |
| `state/genStore.ts` | Orchestrates: draft → `generate()` / `makeVariations()` / `regenerate()` / `fillGap()`; on a finished job runs QC, writes the record, creates a `generated`-role `Asset` (with poster frame) via `projectStore.addGeneratedAsset`, optionally drops it straight onto the timeline. |
| `domain/types.ts` `references` + `gapAt()` | Project-level reference board (role + priority, spec §23); `gapAt` finds the empty span between two clips for "Fill gap with AI" (spec §41, §208). |

## What "generation" produces

A normal project asset (spec §205): `kind: 'video'`, `role: 'generated'`, with
`generation` metadata attached. From there it trims, colours, takes effects,
transitions and captions, and exports like any other clip.

## Replacing the backend

Implement `VideoGenerationProvider` in `ai/providers/<name>/`, `registerProvider(x, /*front*/ true)`
from an opt-in screen, ship it disabled by default. The queue, prompt engine,
QC, history, reference board and Studio UI are unchanged — capabilities drive
which modes light up.

## Not yet (Phase 5+)

Video→Video, Extend, Region edit, Generative fill / background, storyboard →
video, AI Director. Each is an interface method already declared; the Studio
shows them disabled until a provider implements them.

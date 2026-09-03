# Architecture

The codebase is split into layers with a strict dependency direction. Each
layer may depend only on the layers below it.

```
┌─────────────────────────────────────────────────────────────┐
│ UI            src/ui, src/app        React components only   │
├─────────────────────────────────────────────────────────────┤
│ STATE         src/state              zustand stores          │
│               projectStore · uiStore                         │
├─────────────────────────────────────────────────────────────┤
│ DOMAIN        src/domain             pure, framework-free    │
│   types · project · timeline/operations · history            │
├───────────────┬───────────────┬───────────────┬─────────────┤
│ STORAGE       │ VIDEO         │ EXPORT        │ AI          │
│ src/storage   │ src/video     │ src/export    │ src/ai      │
│ Dexie / IDB   │ probe·preview │ renderer      │ provider ·  │
│               │               │               │ registry ·  │
│               │               │               │ router ·    │
│               │               │               │ providers/  │
├─────────────────────────────────────────────────────────────┤
│ LIB           src/lib                id · time · result · log │
└─────────────────────────────────────────────────────────────┘
```

Rules enforced by review (and, where possible, by module boundaries):

- `domain/*` imports nothing from `react`, `zustand`, `dexie`, or the DOM. It is
  plain data + pure functions and is the unit-test surface.
- `ai/*` never imports an external provider SDK into anything but an adapter
  under `ai/providers/<name>/`. `ai/orchestrator.ts` only knows the
  `VideoGenerationProvider` interface.
- Only `storage/repository.ts` touches Dexie directly.

## State (spec §170)

Two stores, deliberately small and separate:

| Store | Owns | Persisted? |
| --- | --- | --- |
| `projectStore` | the open `VideoProject`, its `assets`, snapshot `history`, dirty/lastSaved | yes — via `storage/autosave` → Dexie |
| `uiStore` | selection, active workspace/panels, zoom, transport, toasts, palette | no |

Every project mutation goes through `projectStore.mutate(recipe, label, kind)`:

1. structural-clone the project,
2. run the recipe (mutating the clone),
3. `commit` a snapshot to `history` with a label + kind (`edit` / `import` /
   `ai` / `system`),
4. `scheduleAutosave` (debounced 1.5 s committed save, 0.5 s recovery snapshot).

Playhead / selection changes bypass history (frequent, non-undoable).

Undo/redo swap the `history.present` snapshot back into `projectStore.project`.
Because AI actions are committed with `kind: 'ai'`, "undo AI change" and the
activity log (spec §19, §121, §122) fall out of the same mechanism.

## Domain model (spec §9, §11, §286)

- Canonical time unit is the **frame** on the project timebase; seconds are
  derived (`lib/time.ts`).
- `VideoProject` = `meta` + `settings` + `timeline` + `brandKit` + `assetIds`.
  It is JSON-serializable; **no binary data** lives in it.
- `Asset` carries a `role` (`source` / `generated` / `reference` / `brand` /
  `output`) and, when generated, model-agnostic `GenerationMeta`
  (`providerId` / `modelId` / `modelVersion` / prompt / seed / params …).
- `Clip` is a non-destructive placement of `sourceIn..sourceOut` of an asset at
  `timelineStart` on a track, with `speed` / `gain` / `opacity` / fades.
- Timeline operations in `domain/timeline/operations.ts` are all
  `(Timeline, params) -> Timeline` pure functions. The UI and (later) the AI
  intent executor call the *same* primitives — natural language is never
  executed directly (spec §18).

## Storage (spec §8, §9, §244, §245)

Dexie DB `ai-video-editor`, tables: `projects`, `assets`, `blobs`
(binary media, referenced by `blobKey`), `versions`, `recovery`. Everything is
local; `navigator.storage.estimate()` feeds the storage breakdown (spec §92).

## Video (spec §12)

- `video/probe.ts` — import-time metadata + poster frame using `<video>` /
  `<img>` / `<audio>`. Fields the browser can't report honestly (exact codec,
  container fps) stay `null`.
- `video/previewEngine.ts` — a pooled-media-element canvas compositor. One
  `<video>`/`<img>` per asset, drawn at the playhead. During playback the
  elements run so audio is heard; when paused they're seeked frame-exact. This
  is intentionally simple; a WebCodecs/WebGPU implementation can replace it
  behind the same class API (Phase 2).

## Export (spec §13)

`export/exporter.ts` keeps **preview and final render separate**. Phase 1 does a
real-time render: composite all visible visual clips (track order, opacity,
fades) to a canvas, mix audio-bearing clips through a WebAudio graph
(per-clip gain + fades), capture `canvas.captureStream()` + the audio
destination with `MediaRecorder` → WebM. Phase 2 adds an offline
WebCodecs/FFmpeg path with effects, transitions, keyframes and MP4 muxing.

## AI (spec §4, §5, §94, §99, §100, §201)

```
ai/
  provider.ts             VideoGenerationProvider + ProviderCapabilities + Job types
  registry.ts             local model catalogue + install state
  hardware.ts             browser hardware profile → recommended generation profile
  orchestrator.ts         route(task) → best available provider, or an explanation
  providers/
    local/localProvider.ts  default + fallback; capabilities all-false until a
                            local model + inference service are present
```

- The UI reasons about `capabilities`, not provider names. `StudioPanel` and
  the command palette light up modes purely from `route(task).provider`.
- `localProvider` is always registered and always first. External adapters
  would be added under `ai/providers/<name>/` and registered explicitly; the
  core must still compile with that folder deleted (spec §265).
- Phase 1 ships **no** generation. Controls are disabled with the real reason
  (spec §159, §160, §283).

## What a future local runtime plugs into

The Phase 3 local service (`GET /health`, `GET /models`, `POST /generate/*`,
`GET /jobs/:id` …) becomes the transport inside `localProvider`. Nothing above
`ai/` changes: `registry` gains real install state, `capabilities` flips on,
and the existing routing surfaces the modes.

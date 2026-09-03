# Roadmap

Phased build per the master spec (§256). Each phase must compile, run, persist,
recover and pass its acceptance tests before the next begins (§258, §259).

| Phase | Theme | Status |
| --- | --- | --- |
| **1** | Foundation | **done** |
| 2 | Professional editing | next |
| 3 | Local AI (runtime, transcription, vision, search, TTS) | planned |
| 4 | Generative video (T2V/I2V, queue, model mgmt, history) | planned |
| 5 | Advanced generation (V2V, extend, region edit, bg, fill, camera, storyboard) | planned |
| 6 | AI Director (script→storyboard→video, auto-edit, B-roll, continuity, campaign) | planned |
| 7 | Automation (recipes, AI plans, autonomous workflows, social repurposing) | planned |
| 8 | Polish (perf, a11y, i18n, errors, docs, packaging, installer) | planned |

## Phase 1 — Foundation ✅

Delivered: project system + IndexedDB persistence + autosave/crash recovery +
version history; media import with real probing; frame-accurate multi-track
timeline data model; timeline editing (add/move/trim/split/delete/ripple/
duplicate/snap/zoom/markers/tracks); canvas preview compositor + transport;
snapshot undo/redo + activity log; inspector (clip + asset); real-time WebM
export with audio mix + social presets; ⌘K command palette; AI provider
abstraction + capability router + local provider (fallback) + model registry +
hardware detection; AI Studio / AI Setup screens with honest disabled states.

Acceptance (spec §260, §264, §265, §266, §276, §277):

- [x] Import → trim → split → move → ripple → delete → export produces a
      playable file.
- [x] Editing works with no network (all local; no external calls in the core).
- [x] Deleting `src/ai/providers/*` beyond `local/` does not break the build
      (only `local` exists; router has no brand branches).
- [x] No "Seedance"/provider credit concepts anywhere in the codebase.
- [x] AI mutation → Undo restores prior state.
- [x] Close & reopen a project restores timeline, assets, versions, settings.

## Phase 2 — Professional editing (next)

Trim modes (slip/slide/roll), transitions (dissolve/wipe/zoom/…), stackable
effects, keyframes (position/scale/opacity/blur/volume/color) with easing,
audio engine (gain/EQ/compression/noise reduction/ducking), caption engine
(SRT/VTT + styled + karaoke), colour engine (curves/HSL/LUTs/shot match),
adjustment layers, compound clips, proxy generation, offline WebCodecs/FFmpeg
export path with MP4.

## Phase 3 — Local AI

Local inference service (`/health`, `/models`, `/models/install`,
`/generate/*`, `/transcribe`, `/analyze/*`, `/jobs/:id`), model download with
checksum/resume, Whisper-compatible transcription, vision analysis
(shots/faces/objects/embeddings), semantic asset search, Piper TTS.
`localProvider` gains a real transport; `capabilities` flips on from installed
models.

## Phases 4–8

Follow the master spec sections §20–§255. Every new capability appears in the UI
only when it actually works; otherwise it stays a labelled disabled state
(§257).

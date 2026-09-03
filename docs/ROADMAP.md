# Roadmap

Phased build per the master spec (§256). Each phase must compile, run, persist,
recover and pass its acceptance tests before the next begins (§258, §259).

| Phase | Theme | Status |
| --- | --- | --- |
| **1** | Foundation | **done** |
| **2** | Professional editing | **done** |
| **3** | Local AI (on-device runtime, transcription, cleanup, search) | **done** |
| **4** | Generative video (T2V/I2V, queue, QC, history, references) | **done** |
| 5 | Advanced generation (V2V, extend, region edit, bg, fill, camera, storyboard) | next |
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

## Phase 2 — Professional editing ✅

Delivered:

- **Shared frame compositor** (`src/video/compositor.ts`) used by both preview
  and final render — one renderer, no drift (spec §168).
- **Transform** per visual clip: position / scale / rotation / anchor
  (spec §110), all keyframeable.
- **Colour grade** per clip: exposure / contrast / saturation / temperature /
  tint (spec §63); exposure/contrast/saturation keyframeable.
- **Effects stack** (spec §107): gaussian-blur, sharpen (SVG convolution),
  vignette, film grain, grayscale, sepia, hue-rotate, brightness, invert —
  reorderable, per-instance params, catalogue in `domain/effects/registry.ts`.
- **Keyframe system** (spec §106): per-parameter curves, frames relative to the
  clip, linear / ease-in / ease-out / ease-in-out / hold; evaluator with tests.
- **Transitions** (spec §108): dissolve, fade-to-colour, wipe (4 directions),
  slide, zoom. `addTransition` creates the overlap by rippling; transitions
  survive split (reassigned) and are dropped when a clip is deleted.
- **Adjustment layers** (spec §112): a clip on an `adjustment` track grades /
  effects everything composited below it in its time range.
- **Caption engine** (spec §50–§52): SRT + WebVTT parser (incl. inline word
  timings), single caption layer, styles minimal / bold / boxed / karaoke,
  rendered by the compositor in preview and export.
- **Audio**: per-clip pan + keyframeable gain + fades; per-track gain / pan /
  mute mixer; offline mix via `OfflineAudioContext` (`src/export/audioMixer.ts`).
- **Export**: offline **MP4 (H.264/AAC)** via WebCodecs + bundled `mp4-muxer`
  (frame-exact, faster-than-realtime), with the real-time **WebM** path kept as
  automatic fallback. Both honour transform / colour / effects / transitions /
  adjustment layers / captions.
- **Schema v2 + migration** (`src/domain/migrate.ts`) — v1 projects load and
  upgrade transparently (spec §241).

Deferred to Phase 2.5: slip/slide/roll trims, magnetic mode, parametric EQ /
compressor / automatic ducking, colour curves / HSL / LUTs / shot-match,
compound clips, proxy generation, configurable shortcut map.

### Phase 2 acceptance (spec §260, §106, §108)

- [x] Add / trim / split / ripple / move plus effects, transitions, keyframes,
      colour, captions, audio mix all round-trip through save/load.
- [x] Preview and export render byte-for-byte the same pipeline.
- [x] A v1 project on disk opens, migrates to v2, and stays editable.
- [x] MP4 export produces a real, playable H.264/AAC file (verified 1920×1080,
      4.5 MB); WebM fallback path intact.
- [x] Transition survives splitting the outgoing clip; disappears with its clips.

## Phase 3 — Local AI ✅

Delivered — everything runs **on-device**, no server, no API key:

- **On-device runtime** (`src/ai/local/runtime.ts`): lazily loads
  `@xenova/transformers` (its own code-split chunk, never in the main bundle).
  Model weights download from the HF hub **only on an explicit Download click**
  in AI Setup and are cached by the browser; installed models then work
  offline. Install / Remove / progress wired to the catalogue
  (`src/ai/local/types.ts`: Whisper Tiny EN, Whisper Base multilingual).
- **Transcription** (spec §45, §46): decode → resample to 16 kHz → Whisper →
  word timings → `TranscriptResult`. Feeds the Phase 2 caption engine
  (`transcriptToCaptions.ts`) with per-word timings for the karaoke style.
  Non-speech audio honestly yields zero cues (spec §159).
- **Transcript panel** (RightDock): segment list, click-to-seek, "Use as
  captions".
- **Silence removal** (spec §47, §48): pure WebAudio RMS DSP
  (`src/audio/silence.ts`) — conservative / balanced / aggressive — mapped to
  timeline frames and applied via `removeSilencesFromClip` (split + ripple),
  one undoable step. No model.
- **Shot detection** (spec §176): downscaled luma-histogram frame diff
  (`src/video/shots.ts`) → shot markers. No model.
- **Local search** (spec §16, §174): `searchProject` over assets, markers,
  caption cues and the transcript, surfaced in the ⌘K palette (jump to time or
  select asset). Embedding/visual search is the next opt-in model.
- AI activity log records transcription / silence / shot ops as `ai` kind
  (undoable, spec §19, §121).

Deferred: native local inference *service* for large video/image models
(spec §149–§151), neural TTS file render (SpeechT5), CLIP visual-embedding
search, object/face detection models — all plug into the same runtime +
registry with no editor changes.

### Phase 3 acceptance (spec §261, §264)

- [x] Download a speech model in AI Setup → it installs and persists; Remove works.
- [x] Transcribe a clip → transcript populates, captions generated with word
      timings; empty audio → zero cues, never fabricated.
- [x] Remove silences turns one clip into packed keep-segments and closes the
      gap; single undo restores it.
- [x] Everything except the one-time model download runs with no network.

## Phase 4 — Generative video ✅

Delivered — see `GENERATION_ENGINE.md`:

- **Prompt engine** (`ai/gen/prompt.ts`, spec §132–§134): free text →
  structured prompt, heuristic enhancer that never discards user intent,
  constraint extraction, `buildRequest`.
- **Job queue** (`ai/gen/queue.ts`, spec §89, §90, §148): real phases,
  `AbortController` cancel, concurrency cap.
- **Procedural provider** (`ai/providers/procedural/`, spec §232): a genuine
  local generator — seeded frame synthesis from the prompt's palette / motion /
  camera, encoded to real MP4 (WebCodecs) / WebM. Text→Video and Image→Video
  (Ken-Burns). Not a diffusion model, labelled as such, not a placeholder
  (spec §159). `requestHash` for dedup (spec §173).
- **Model router** (`ai/orchestrator.ts`): capability-based; a native diffusion
  adapter routes ahead of procedural once connected. `localProvider` stays the
  disabled native client.
- **Quality control** (`ai/gen/quality.ts`, spec §78): decode / size / duration
  / black-frame / flicker checks → score + issues; never insert blindly.
- **Generation history + graph** (`ai/gen/history.ts` + Dexie `generations`,
  spec §75, §124, §125): prompt / model / seed / params / parent per clip;
  variation tree; `findByRequestHash`.
- **Reference board** (`project.references`, spec §23, §24, §135): per-project
  references with role + priority; schema **v3** + migration.
- **AI Video Studio** (`ui/editor/StudioPanel.tsx` + `studio/`, spec §146,
  §147): mode bar, prompt form (simple + advanced), reference board, live
  preview of the result, job list with phases/cancel, generation history with
  Add-to-timeline / Regenerate / Variations.
- **Generation ↔ timeline** (spec §205, §206, §41, §208): every result is a
  normal `generated`-role asset; `gapAt` + "Fill gap with AI" drop a bridge
  clip straight into a timeline gap.

### Phase 4 acceptance (spec §262, §270, §275, §276)

- [x] Text→Video and Image→Video produce a real, playable clip that becomes a
      timeline-ready asset. (verified: 1920×1080 MP4, 5.1 MB, QC 100%)
- [x] Job shows phases and can be cancelled; concurrency capped at 1.
- [x] Variations branch under their parent in the history graph; restore/parent
      links hold.
- [x] Deleting every non-`local` provider still compiles; no brand-name
      branching in business logic.
- [x] Nothing is faked — modes without a backend are disabled with a reason.

## Phases 5–8

Follow the master spec sections §20–§255. Every new capability appears in the UI
only when it actually works; otherwise it stays a labelled disabled state
(§257).

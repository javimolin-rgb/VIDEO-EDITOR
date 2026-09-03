# Roadmap

Phased build per the master spec (§256). Each phase must compile, run, persist,
recover and pass its acceptance tests before the next begins (§258, §259).

| Phase | Theme | Status |
| --- | --- | --- |
| **1** | Foundation | **done** |
| **2** | Professional editing | **done** |
| **3** | Local AI (on-device runtime, transcription, cleanup, search) | **done** |
| **4** | Generative video (T2V/I2V, queue, QC, history, references) | **done** |
| **5** | Advanced generation (storyboard, extend, look-match, auto-reframe, continuity) | **done** |
| **6** | AI Director (brief/script → plan → run: storyboard, generate, assemble, colour, captions, B-roll) | **done** |
| **7** | Automation (recipes, on-import triggers, social repurposing, brand templates, content pack) | **done** |
| **8** | Polish (perf, a11y, i18n, structured errors, diagnostics, docs, Tauri scaffold) | **done** |

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

## Phase 5 — Advanced generation ✅

Delivered — all local, all real:

- **Storyboard mode** (`domain/storyboard.ts` + `ui/editor/studio/StoryboardView.tsx`,
  spec §38, §203, §204): shot list on the project (schema **v4** + migration),
  add / edit / reorder / remove, per-shot Generate through the Phase 4 queue,
  "Generate all", "Assemble → timeline" (places ready shots end-to-end).
- **Continuity engine** (`ai/continuity.ts`, spec §40): palette/luma distance
  between consecutive clips → per-pair + overall score, jarring-cut flags;
  a shot with **carry continuity** is seeded with the previous shot's final
  frame (I2V) so looks track forward.
- **Extend Video** (`genStore.extendClip`, spec §74): grabs the clip's last
  frame → procedural I2V continuation → dropped onto the same track right after
  the clip.
- **Look / shot match** (`ai/style.ts` + `sampleFrames.ts`, spec §64, §185,
  §226): samples frames of source + reference, measures luma / contrast /
  saturation / white balance, derives a `ColorGrade` (strength slider),
  applies it to the clip. Pure measurement, tested.
- **Auto-reframe** (`video/reframe.ts`, spec §83): edge-energy saliency
  centroid + temporal smoothing → animated crop from one aspect to another →
  new clip. Face model can later replace the saliency estimate.
- Per-clip ops live in the Inspector's **AI** section; storyboard + continuity
  in the Studio's **Storyboard** view; all also in the ⌘K palette.

### Phase 5 acceptance (spec §262, §271, §278)

- [x] Build a storyboard, generate a shot, assemble to the timeline. (verified:
      shot generated a real 1920×1080 MP4, warm-golden look from the prompt,
      assembled onto V2)
- [x] Shot N with carry-continuity is seeded from shot N-1's last frame.
- [x] Look-match produces a `ColorGrade` that moves the source toward the
      reference, scaled by strength.
- [x] Auto-reframe produces a new clip at the target aspect with the subject
      kept in frame.

## Phase 6 — AI Director ✅

There is no LLM — the Director is a **deterministic planner** that composes
the tools the app already has into an editable, numbered plan, shows it for
approval, then runs it with a plain-language outcome per step (spec §18, §120,
§194).

- `ai/director/planner.ts` — `planFromBrief` (hook → product beats → CTA close,
  export aspects from the platform) and `planFromScript` (`splitScriptBeats`
  → one shot + one caption line per beat, CTA detection). `ai/director/brief.ts`
  — `inferBrief` reads style / platform / duration from free text (spec §183).
- `ai/director/broll.ts` — `extractVisualConcepts` pulls concrete noun phrases
  from a narration line for generative B-roll (spec §43).
- `state/directorStore.ts` — the executor. Steps: **analyse → build-storyboard
  → generate-shots → qc-retry → assemble → captions → broll → color-match →
  music/sfx (skipped honestly) → export-variants**. Reuses the Phase 4/5 queue,
  QC, storyboard, look-match and caption engine — no new generation code.
- **Autonomy levels** (spec §195): assisted (run each step), semi-auto
  (approve, then run to completion, export left manual), auto (no confirm),
  full-auto (everything incl. export).
- `genStore.generateBroll` — for each caption cue: extract concepts → search
  local media first (`searchProject`), place a match; otherwise generate a
  short procedural B-roll clip onto the top video track at the cue's time
  (spec §43). Also a ⌘K command.
- UI: `ui/editor/studio/DirectorView.tsx` — a third Studio view. Brief form or
  script box → **Build plan** → editable shot prompts + numbered steps with
  live status and outcomes → **Approve & run** / **Discard**.

### Phase 6 acceptance (spec §80, §126, §194, §263)

- [x] A brief produces an editable plan; approving it builds a storyboard,
      generates every shot, QC-checks, assembles the timeline and colour-matches
      — each step reporting what it did. (verified live: "12s Aero X teaser" →
      3 shots generated, assembled to the timeline, 4 clips colour-graded,
      music step skipped honestly)
- [x] A script produces one scene + one caption line per beat.
- [x] Autonomy: assisted runs step-by-step; semi-auto runs to completion and
      leaves export.
- [x] Steps with no backend (music, SFX) are `skipped` with a reason, never
      faked.

## Phase 7 — Automation ✅

- **Recipe engine** (`automation/types.ts`, `state/automationStore.ts`,
  spec §87): a recipe is an ordered list of typed steps stored globally (Dexie
  `recipes`, db v3) so it is reusable. Steps: remove-silences, detect-shots,
  generate-captions (gated on a speech model), caption-style, normalize-audio,
  auto-color, auto-reframe, add-broll, apply-brand, export. Each step reuses a
  Phase 2–6 operation; no new capability code. The executor runs sequentially
  with a plain-language outcome per step; missing capabilities are `skipped`
  with a reason.
- **Triggers** (spec §87 "WHEN video imported"): `manual` and `on-import`.
  `projectStore.importFiles` calls a registered hook; `automationStore` fires
  the first matching enabled `on-import` recipe.
- **normalize-audio** (`automation/normalize.ts`): renders the mix
  (`OfflineAudioContext`), measures RMS dBFS, sets audio-track gains toward a
  target (clamped). **auto-color** (`automation/autocolor.ts`): samples each
  clip and grades it toward a neutral target with the look-match maths.
- **Social repurposing** (spec §82): pick platforms → auto-reframe the first
  video clip to each platform aspect (subject-tracked) + draft an **AI content
  pack** (title / description / tags / CTA / heuristic hook note,
  `automation/contentPack.ts`, spec §182, §84) from the captions / transcript.
- **Brand templates** (spec §86, §141): save the current caption style +
  colours (Dexie `brandTemplates`), apply to any project, use as a recipe step.
- UI: an **Automation** workspace (`ui/editor/AutomationPanel.tsx`) — recipe
  list + step editor, run log, repurpose panel, brand templates. ⌘K exposes
  "Run recipe: …" per saved recipe.

### Phase 7 acceptance (spec §87, §164, §278, §281)

- [x] Build a recipe (caption style → auto colour → normalize audio), run it —
      every step reports what it did. (verified live: caption style set, 5 clips
      graded, mix measured −26.7 dBFS → gain ×3.44)
- [x] `on-import` recipe fires when media is imported.
- [x] Repurpose produces a reframed clip per platform + a content-pack draft.
- [x] A brand template round-trips: save from a project, apply to another.
- [x] Steps needing a model (transcription) are `skipped` with a reason.

## Phase 8 — Polish ✅

- **Structured errors** (spec §119): `lib/errors.ts` catalogue (`makeError`) →
  every entry has message / cause / fix; `ErrorDialog` shows why / what /
  how-to-fix + a stable code. Wired at the import and model-not-installed sites.
- **Diagnostics** (spec §246, §247): `lib/diagnostics.ts` → one JSON with the
  hardware profile, model states, generation queue, storage breakdown, preview
  FPS (`lib/fps.ts`) and recent logs — no media. `Settings → Diagnostics`
  panel + **Export diagnostics** button.
- **Appearance / accessibility** (spec §143): `state/settingsStore.ts` +
  `AppSettings` — theme (dark / high-contrast / light, CSS-variable driven),
  UI scale, `prefers-reduced-motion` (setting or OS; disables transitions and
  freezes preview grain), `:focus-visible` outlines. Persisted to localStorage,
  applied to `<html>`.
- **i18n** (spec §144): `src/i18n/` — `translate` / `t` / `useT`, `en` is the
  source, `es` falls back per key, `{var}` interpolation. Language switch;
  chrome (top bar, project browser, errors, settings) translated.
- **Performance** (spec §171, §172): vite `manualChunks` split the app bundle
  (478 KB → 241 KB + react / dexie / muxer vendor chunks; `transformers` stays
  lazy). Content-addressable look-sample cache in `sampleFrames.ts`. Cheaper
  `PreviewPane` render signature (no whole-timeline `JSON.stringify`).
- **First-run** (spec §253): "Open a sample project" — a pre-sketched storyboard
  + caption layer so the idea → generate → edit → export loop is visible on
  first open.
- **Telemetry** (spec §248): none, stated in Settings — nothing to send.
- **Desktop** (spec §249, §250): `src-tauri/` scaffold (thin shell over the web
  app), `npm run tauri`, `docs/PACKAGING.md`.
- **Docs** (spec §167): added `MODELS.md`, `CONTRIBUTING.md`,
  `TROUBLESHOOTING.md`, `PACKAGING.md` (with README, ARCHITECTURE, ROADMAP,
  LOCAL_AI, PROVIDERS, RENDERING, TIMELINE, GENERATION_ENGINE, AI_DIRECTOR,
  AUTOMATION).

### Phase 8 acceptance (spec §119, §143, §144, §246, §264)

- [x] A failed import shows a why / what / how-to-fix dialog, not a stack.
      (verified live with a deliberately broken `.mkv`)
- [x] Theme switches to high-contrast / light and persists.
- [x] Language switches to Spanish; missing keys fall back to English.
- [x] Diagnostics export downloads a JSON with no media.
- [x] The bundle is split; only the lazy `transformers` chunk exceeds 500 KB.
- [x] Editing still works fully offline.

## Remaining beyond the 8 phases

Still deferred until a native diffusion runtime exists (declared
`VideoGenerationProvider` methods, disabled): true Video→Video (environment /
clothing / character swap), region-mask object replacement / inpainting,
generative background replacement. Also open: worker-thread offload for
decode/analysis, proxy media, a native installer wrapper (welcome → hardware
check → model select → test → first project) on top of the existing web
onboarding, thumbnail generation (§85), auto-highlights / chapters
(§179, §180), animated lower-thirds.

**Phases 1–8 of the master specification are implemented.**

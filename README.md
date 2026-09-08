# ZURY

A **local-first** professional video editor with an **extensible local generative-AI engine**.

> No account. No mandatory cloud. No required external AI API. The editor is fully
> usable offline; generative features are optional adapters over local models.

**All 8 phases of the [master specification](docs/ROADMAP.md) are implemented** —
Foundation, Professional editing, Local AI, Generative video, Advanced
generation, AI Director, Automation, Polish. What still needs a native
diffusion runtime (true V2V swap, region inpainting, generative backgrounds)
stays a declared, disabled interface method — never faked.

---

## What works today

| Area | Status |
| --- | --- |
| Project system | ✅ create / open / duplicate / delete, IndexedDB persistence, schema v2 + migration |
| Autosave + crash recovery | ✅ debounced autosave, recovery snapshot prompt on reload |
| Version history | ✅ named snapshots, restore into editor |
| Media import | ✅ drag-drop / picker, real metadata + poster-frame probing |
| Multi-track timeline | ✅ video / audio / text / adjustment / caption tracks, frame-accurate |
| Timeline editing | ✅ add, move (cross-track), trim, split, delete, ripple-delete, duplicate, snap, zoom, markers |
| Transitions | ✅ dissolve · fade-to-colour · wipe · slide · zoom |
| Effects | ✅ blur · sharpen · vignette · grain · grayscale · sepia · hue-rotate · brightness · invert (stackable) |
| Transform / Colour | ✅ position / scale / rotation / anchor · exposure / contrast / saturation / temperature / tint |
| Keyframes | ✅ opacity / gain / transform.\* / colour.\* with easing |
| Adjustment layers | ✅ grade + effect everything below, in range |
| Captions | ✅ SRT + WebVTT import (+ word timings), minimal / bold / boxed / karaoke |
| Audio | ✅ per-clip gain / pan / fades (gain keyframeable), per-track mixer, offline mix |
| Preview + final render | ✅ one shared compositor — WYSIWYG |
| Export | ✅ offline **MP4 (H.264/AAC)** via WebCodecs + `mp4-muxer`; real-time **WebM** fallback |
| Undo / redo | ✅ snapshot history, per-entry activity log (incl. `ai` ops) |
| Command palette + search | ✅ ⌘K commands **and** project search (captions / transcript / markers / assets) |
| **On-device transcription** | ✅ Whisper (Tiny EN / Base) in-browser → captions with word timings; opt-in download, then offline |
| **Silence removal** | ✅ on-device RMS DSP, conservative / balanced / aggressive, undoable |
| **Shot detection** | ✅ on-device histogram frame-diff → shot markers |
| AI Setup | ✅ real on-device model download / remove / progress; native-runtime catalogue listed (disabled) |
| AI provider abstraction | ✅ capability-based, model router; procedural generator + disabled native client |
| **Generative video** | ✅ **Text→Video** & **Image→Video** — procedural seeded frame synthesis (no model, no download) **or** a real local diffusion model via the **ComfyUI backend** (opt-in, [`docs/COMFYUI.md`](docs/COMFYUI.md)) |
| **Generation pipeline** | ✅ prompt engine · job queue (phases/cancel) · quality control · history graph · variations · reference board |
| **Generation ↔ timeline** | ✅ result is a normal asset; "Fill gap with AI" drops a bridge clip into a timeline gap |
| **Storyboard mode** | ✅ shot list → per-shot generate → assemble to timeline; carry-continuity seeds each shot from the previous shot's last frame |
| **Extend / look-match / auto-reframe** | ✅ continuation from last frame; colour-grade a clip to match a reference; subject-tracked crop to a new aspect |
| **Continuity engine** | ✅ palette/luma score between adjacent clips, jarring-cut flags |
| **AI Director** | ✅ brief or script → editable numbered plan → run: storyboard, generate, QC, assemble, captions, B-roll, colour-match; autonomy levels; per-step outcomes; honest skips |
| **Generative B-roll** | ✅ per caption line: search local media first, else generate a short clip onto the B-roll track |
| **Automation** | ✅ reusable recipes (10 step types), `on-import` trigger, run log; steps reuse the existing ops; missing capabilities skipped with a reason |
| **Social repurposing** | ✅ auto-reframe per platform + AI content pack (title / description / tags / CTA / hook note) |
| **Brand templates** | ✅ save caption style + colours, apply to any project, use as a recipe step |
| AI Studio | ✅ Generate / Storyboard / Director views; **honest disabled states** for unbuilt modes |
| **Errors** | ✅ every failure shows why / what happened / how to fix it, plus a stable code (spec §119) |
| **Accessibility** | ✅ dark / high-contrast / light themes, UI scale, reduced-motion (setting or OS), focus outlines |
| **Languages** | ✅ English + Spanish, per-key fallback |
| **Diagnostics** | ✅ Settings → Diagnostics: FPS, model states, queue, storage, logs; one-click JSON export (no media) |
| **Desktop app** | ✅ Tauri v2 shell — `npm run app:build` → native `.app` / `.dmg` (needs Rust once); [`docs/PACKAGING.md`](docs/PACKAGING.md) |
| **Cloud sync** | ✅ optional — push a portable project package to a GitHub repo you own (your token, `api.github.com` only), manual or auto-on-save; [`docs/CLOUD_SYNC.md`](docs/CLOUD_SYNC.md) |

### Not yet (later phases — surfaced as disabled states, never faked)

Slip/slide/roll trims, parametric EQ / compressor / ducking, colour curves /
HSL / LUTs, compound clips, proxies; neural TTS file render, visual-embedding
search; true diffusion Video→Video (environment/clothing/character swap),
region-mask object replacement, generative background replacement — these stay
declared, disabled interface methods until a diffusion runtime that can do them
is wired in (the ComfyUI backend covers Text→Video / Image→Video today). See the
roadmap.

---

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. Create a project, drag in some video/images, build a
timeline, hit **Export**.

```bash
npm test          # unit tests (timeline ops, history, time model)
npm run typecheck # strict TS, no emit
npm run build     # production build
npm run lint
```

Requires Node 20+. A recent Chromium-based browser is recommended for the
preview/export pipeline (`MediaRecorder`, `captureStream`, WebAudio).

### As a desktop app

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # once
npm run app:dev      # hot-reload native window
npm run app:build    # → src-tauri/target/release/bundle/  (.app + .dmg on macOS)
```

### Real diffusion generation (optional)

Run a local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) with a video
model, then **AI Setup → ComfyUI backend**: paste an API-format workflow and map
its prompt / size / seed inputs. See [`docs/COMFYUI.md`](docs/COMFYUI.md).
Without it, generation uses the built-in procedural generator (abstract motion,
not photoreal).

---

## Architecture (short version)

```
UI (React)  ──►  State (zustand: project | ui)  ──►  Domain (pure, framework-free)
                                                       ├─ project / timeline / assets
                                                       └─ history (snapshot undo/redo)
        ├──►  Storage (Dexie / IndexedDB: projects, assets, blobs, versions, recovery)
        ├──►  Video (probe, preview compositor)
        ├──►  Export (shared compositor → WebCodecs MP4, or WebM fallback)
        └──►  AI  (provider abstraction · model registry · router · local provider)
                  └─ providers/local  ← default + fallback, never bypassed by an external API
```

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Design commitments

- **Model-agnostic.** Business logic branches on `provider.capabilities.*`,
  never on a provider id or brand name. Deleting an adapter must not break the
  build.
- **No provider credits / quotas** in the core. The only real limits are
  hardware, storage, model capability and time.
- **Non-destructive.** Source media is never modified; edits are instructions,
  generated media is a new asset.
- **Honest UI.** A control that cannot do something yet is disabled with a
  reason — no placeholder renders, no fake progress.

## License

Application code: see [`LICENSE`](LICENSE). AI models are **not** bundled; each
has its own license shown in AI Setup before any download.

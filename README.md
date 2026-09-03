# AI Video Editor

A **local-first** professional video editor with an **extensible local generative-AI engine**.

> No account. No mandatory cloud. No required external AI API. The editor is fully
> usable offline; generative features are optional adapters over local models.

This repository is being built in phases against
[`docs/ROADMAP.md`](docs/ROADMAP.md). **Phase 1 (Foundation) is implemented.**

---

## What works today (Phase 1)

| Area | Status |
| --- | --- |
| Project system | ✅ create / open / duplicate / delete, IndexedDB persistence |
| Autosave + crash recovery | ✅ debounced autosave, recovery snapshot prompt on reload |
| Version history | ✅ named snapshots, restore into editor |
| Media import | ✅ drag-drop / picker, real metadata + poster-frame probing (video/audio/image/caption) |
| Multi-track timeline | ✅ video/audio/text/adjustment/caption tracks, frame-accurate model |
| Timeline editing | ✅ add, move (cross-track), trim (both edges), split, delete, ripple-delete, duplicate, snapping, zoom, markers |
| Preview | ✅ canvas compositor synced to the playhead, transport, spacebar, audio during playback |
| Undo / redo | ✅ snapshot history, per-entry activity log (edit / import / ai) |
| Inspector | ✅ per-clip opacity / gain / speed / fades / label; asset role + metadata |
| Export | ✅ real-time canvas + WebAudio composite → **WebM (VP9/Opus)**, social presets |
| Command palette | ✅ ⌘K, editing commands |
| AI provider abstraction | ✅ capability-based interface, model router, **local provider is the default & fallback** |
| Local model registry | ✅ catalogue (LTX-Video, Wan 2.1, HunyuanVideo, Whisper, Piper) with license / hardware data |
| Hardware detection | ✅ OS / GPU vendor / cores / WebGPU / WebCodecs → recommended profile |
| AI Studio & AI Setup | ✅ full layout with **honest disabled states** — nothing faked (spec §159/§160) |

### Not yet (later phases — surfaced as disabled states, never faked)

Effects, transitions, keyframes, colour grading, caption styling, MP4/FFmpeg
export, transcription, semantic search, TTS, and all generative video
(T2V/I2V/V2V/extend/region-edit/AI Director). See the roadmap.

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

---

## Architecture (short version)

```
UI (React)  ──►  State (zustand: project | ui)  ──►  Domain (pure, framework-free)
                                                       ├─ project / timeline / assets
                                                       └─ history (snapshot undo/redo)
        ├──►  Storage (Dexie / IndexedDB: projects, assets, blobs, versions, recovery)
        ├──►  Video (probe, preview compositor)
        ├──►  Export (real-time renderer → WebM)
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

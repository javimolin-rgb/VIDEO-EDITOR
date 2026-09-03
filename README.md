# AI Video Editor

A **local-first** professional video editor with an **extensible local generative-AI engine**.

> No account. No mandatory cloud. No required external AI API. The editor is fully
> usable offline; generative features are optional adapters over local models.

This repository is being built in phases against
[`docs/ROADMAP.md`](docs/ROADMAP.md). **Phases 1 (Foundation) and 2
(Professional editing) are implemented.**

---

## What works today (Phases 1–2)

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
| Undo / redo | ✅ snapshot history, per-entry activity log |
| Command palette | ✅ ⌘K |
| AI provider abstraction | ✅ capability-based, model router, **local provider is default & fallback** |
| Local model registry + hardware detection | ✅ catalogue with licenses; OS / GPU / WebGPU / WebCodecs profile |
| AI Studio & AI Setup | ✅ full layout, **honest disabled states** — nothing faked (spec §159/§160) |

### Not yet (later phases — surfaced as disabled states, never faked)

Slip/slide/roll trims, parametric EQ / compressor / ducking, colour curves /
HSL / LUTs / shot-match, compound clips, proxies; transcription, semantic
search, TTS; all generative video (T2V/I2V/V2V/extend/region-edit/AI Director).
See the roadmap.

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

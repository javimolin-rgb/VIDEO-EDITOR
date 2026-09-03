# Local AI

The core application never requires an external AI API. All AI capability is
provided by local models behind the provider abstraction.

## Two tiers

### 1. On-device (in-browser) — **working now (Phase 3)**

`src/ai/local/` runs models directly in the browser via
`@xenova/transformers` (WASM / WebGPU, code-split so it is never in the main
bundle).

- `types.ts` — the in-browser model catalogue (Whisper Tiny EN, Whisper Base).
- `runtime.ts` — `localRuntime`: `install(id, onProgress)` downloads weights
  from the HF hub **only on explicit request** and caches them; `isInstalled`,
  `remove`, and `transcribe(pcm, sampleRate, opts)` → segments + word timings.
  ORT WASM binaries load from a pinned jsDelivr path.
- Used by: `state/projectStore` (`transcribeClip`, `removeSilences`,
  `detectShotsForClip`), `ui/editor/OnDeviceModels.tsx` (AI Setup),
  `ui/editor/panels/TranscribeControls.tsx`, `ui/editor/RightDock` transcript
  tab, `ui/CommandPalette` search.
- Zero-model helpers that pair with it: `src/audio/silence.ts` (RMS silence
  detection), `src/video/shots.ts` (histogram cut detection),
  `src/ai/search.ts` (local project search).

### 2. Native runtime (separate process) — **scaffolding only**

- `src/ai/registry.ts` — catalogue of large open-weight video/image models
  with license, size, VRAM/RAM, modes, hardware.
- `src/ai/hardware.ts` — browser hardware profile → `recommendedProfile`.
- `src/ai/providers/local/localProvider.ts` — client for a local service at
  `http://127.0.0.1:8787`; `health()` reports it absent. `capabilities` are
  all-false until that service + a model exist.

## Phase 3 plan — the local inference service (spec §149–§155)

A separate local process (native Python / Diffusers, or a ComfyUI backend, or a
llama.cpp-style server) exposing:

```
GET  /health
GET  /models
POST /models/install        { id }            → streamed progress
DELETE /models/:id
POST /generate/video        { mode, prompt, references, duration, … } → jobId
POST /transcribe            { assetRef }       → jobId
POST /analyze/video         { assetRef }       → jobId
GET  /jobs/:id
POST /jobs/:id/cancel
```

Constraints:

- localhost binding only, origin check, local auth token, filesystem sandbox
  (spec §152).
- Large media passes by file reference, not JSON (spec §153).
- GPU backend abstraction: CUDA / Metal(MPS) / CPU fallback; a model that needs
  NVIDIA must degrade gracefully, never crash the editor (spec §154, §155,
  §267).

When this exists, `localProvider` gains the transport and `capabilities` turns
on from installed models. No code above `src/ai/` changes.

## Candidate first video model

Chosen at implementation time by benchmarking (spec §232–§234). Current
catalogue leans toward **LTX-Video 2B** (fast, runs on ≤12 GB VRAM / Apple
Silicon) as the default, **Wan 2.1 1.3B** (Apache-2.0) as the permissive
option, **HunyuanVideo** for NVIDIA-class machines wanting maximum quality.

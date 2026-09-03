# Local AI

The core application never requires an external AI API. All AI capability is
provided by local models behind the provider abstraction.

## Status

Phase 1 ships the *scaffolding* only:

- `src/ai/registry.ts` — catalogue of installable open-weight models with
  license, size, VRAM/RAM needs, supported modes, hardware, speed/quality
  estimates. Nothing is bundled or downloaded.
- `src/ai/hardware.ts` — browser hardware profile (OS, GPU vendor via
  `WEBGL_debug_renderer_info`, cores, `deviceMemory`, WebGPU/WebCodecs) →
  `recommendedProfile` of `fast` / `balanced` / `quality`.
- `src/ai/providers/local/localProvider.ts` — talks to a local service at
  `http://127.0.0.1:8787` (not present yet); reports `health()` accordingly.

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

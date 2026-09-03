# Models

Nothing is bundled. Every model is downloaded on request, with its size and
licence shown first (spec §7, §97), and is cached locally afterwards.

## On-device (in-browser) — working

Run via `@xenova/transformers` (WASM / WebGPU). Managed in **AI Setup →
On-device speech models**. Catalogue: `src/ai/local/types.ts`.

| id | hub | task | ~size | licence | note |
| --- | --- | --- | --- | --- | --- |
| `whisper-tiny-en` | `Xenova/whisper-tiny.en` | transcribe | 40 MB | MIT | English only, fastest |
| `whisper-base` | `Xenova/whisper-base` | transcribe | 145 MB | MIT | 99 languages, auto-detect |

Used by: caption generation, the `generate-captions` recipe step. After
install they run fully offline.

## Native runtime (separate process) — catalogue only

Larger video / image models need a local inference service (spec §149–§151)
that is **not part of this build**. Listed for planning in **AI Setup → Native
runtime models**, with real licence / VRAM / hardware data
(`src/ai/registry.ts`):

| id | family | licence | VRAM | modes | notes |
| --- | --- | --- | --- | --- | --- |
| `ltx-video-2b` | LTX-Video | OpenRAIL-M | ≥12 GB | t2v, i2v | fastest practical local T2V/I2V |
| `wan-2-1-t2v-1-3b` | Wan 2.1 | Apache-2.0 | ≥8 GB | t2v | permissive; runs on modest GPUs |
| `hunyuan-video` | HunyuanVideo | Tencent Community | ≥45 GB | t2v | highest quality, NVIDIA-class only |
| `whisper-base` | Whisper | MIT | 0 | transcribe | native variant |
| `piper-tts` | Piper | MIT | 0 (CPU) | tts | fully local neural TTS |

## Generative video today

The **procedural generator** (`src/ai/providers/procedural/`) needs no model
and no download — it synthesises frames from the structured prompt. It powers
Text→Video, Image→Video, storyboard shots, Extend, Fill-gap and B-roll. It is
clearly labelled "no model" and is not a diffusion model; a diffusion adapter
routes ahead of it once a native runtime is connected (see `PROVIDERS.md`).

## Choosing a first diffusion model

Decided at implementation time by benchmarking (spec §232–§234): current lean
is LTX-Video 2B (fast, ≤12 GB / Apple Silicon), Wan 2.1 1.3B (Apache-2.0),
HunyuanVideo for NVIDIA-class machines wanting maximum quality.

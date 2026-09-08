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

Two backends, chosen automatically by capability (`src/ai/orchestrator.ts`):

Router order (`src/ai/orchestrator.ts`): `local → comfyui → fal → pollinations
→ procedural`. Every optional backend reports `NO_CAPABILITIES` until enabled,
so the procedural generator always covers the task offline.

1. **ComfyUI backend** (`src/ai/providers/comfyui/`) — *real diffusion*, opt-in,
   free + unlimited if you have a GPU (local, or a free cloud/Colab ComfyUI).
   Run the server, paste an API-format workflow, map its prompt / size / seed
   inputs. Setup: `COMFYUI.md`.
2. **fal.ai backend** (`src/ai/providers/hosted/falProvider.ts`) — *real
   image/text-to-video diffusion* (LTX, Kling, Wan…), opt-in, **your own API
   key**. This is the path for animating a reference image into an actual
   video. Billed per generation by fal — there is no unlimited free tier. Key
   is stored in `localStorage`, sent only to `*.fal.run`. **AI Setup → Online
   generation**.
3. **Pollinations backend** (`src/ai/providers/hosted/pollinationsProvider.ts`)
   — keyless, free. Renders **one** photographic still from the prompt
   (`image.pollinations.ai`) and animates it with a camera move. Not a
   video-diffusion model (no construction sequences), but a real image instead
   of abstract shapes. Pollinations rate-limits by domain and may `403` browser
   origins; on failure this falls back to the procedural synth. Opt-in.
4. **Procedural generator** (`src/ai/providers/procedural/`) — the always-on
   fallback. No model, no download, no network; synthesises frames from the
   structured prompt. It is **not** a diffusion model — output is abstract
   motion, not photoreal scenes, and it ignores reference images. The Studio
   shows a prominent warning when this is the active backend.

## Choosing a first diffusion model

Decided at implementation time by benchmarking (spec §232–§234): current lean
is LTX-Video 2B (fast, ≤12 GB / Apple Silicon), Wan 2.1 1.3B (Apache-2.0),
HunyuanVideo for NVIDIA-class machines wanting maximum quality.

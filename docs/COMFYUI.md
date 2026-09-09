# ComfyUI backend — real local video generation

The built-in **procedural generator** synthesises frames from the prompt with
no model. It is deterministic and instant, but it is **not a diffusion model** —
"a 360° shot of my house" comes out as abstract motion, not a house.

For real text-to-video / image-to-video, connect a local **ComfyUI** server.
ComfyUI is a separate process you run; this app drives its HTTP API with *your*
workflow. Nothing is sent anywhere else, and if ComfyUI is not set up the app
behaves exactly as before (the adapter's capabilities are all `false`).

Code: [`src/ai/providers/comfyui/`](../src/ai/providers/comfyui/) —
`config.ts` (workflow + field map, `localStorage` key `aiv.comfyui`),
`client.ts` (HTTP/WS: `/prompt`, `/ws`, `/history/{id}`, `/view`,
`/upload/image`, `/system_stats`, `/interrupt`), `comfyProvider.ts`
(implements `VideoGenerationProvider`).

---

## 1. Install ComfyUI + a video model

Follow the ComfyUI install for your OS, then add a video model. Pick by VRAM:

| model | VRAM | licence | notes |
| --- | --- | --- | --- |
| **LTX-2** ([github.com/Lightricks/LTX-2](https://github.com/Lightricks/LTX-2)) | 12–24 GB depending on variant | open weights (LTX Open) | **recommended** — current Lightricks open T2V/I2V, strong image-to-video; free and unlimited on your own GPU |
| **LTX-Video 2B / 13B v0.9.x** | ~12 GB (runs on Apple Silicon) | OpenRAIL-M | previous LTX line, lighter |
| **Wan 2.1 / 2.2** | ~8 GB (1.3B) | Apache-2.0 | most permissive, modest GPUs |
| **HunyuanVideo** | 45 GB+ | Tencent Community | highest quality, NVIDIA-class only |

The ComfyUI "workflow templates" browser ships a ready graph for LTX-2 and the
others (search "LTX"). Load one and confirm it renders a clip inside ComfyUI
**before** wiring it here. No GPU? The same LTX-2 model is on fal.ai — enable
the **fal.ai** backend in AI Setup instead (pay-as-you-go, your key).

## 2. Start ComfyUI so the browser can reach it

```bash
python main.py --listen 127.0.0.1 --port 8188 --enable-cors-header "*"
```

`--enable-cors-header "*"` is required — without it the browser blocks the
requests. Keep this running while you generate.

## 3. Point the app at it

**AI Setup → ComfyUI backend (real video generation)**:

1. **Server URL** — default `http://127.0.0.1:8188`. Click **Test**; it should
   report `ComfyUI up · <device>`.
2. In ComfyUI, with your working graph open: **Workflow → Export (API)** (older
   builds: enable *Settings → Dev Mode*, then *Save (API Format)*). This yields
   `{ "3": { "class_type": "...", "inputs": { ... } }, ... }` — **not** the
   normal "Save" (that format is rejected with a message).
3. Paste that JSON into **Text → Video workflow (API format)**. On blur it
   parses and a toast confirms the node count.
4. **Map the fields.** For each row pick the node, then the input on it:

   | field | typical node → input |
   | --- | --- |
   | Positive prompt | `CLIPTextEncode` (positive) → `text` |
   | Negative prompt | `CLIPTextEncode` (negative) → `text` |
   | Width / Height | `EmptyLTXVLatentVideo` / `EmptyHunyuanLatentVideo` → `width` / `height` |
   | Frame count | same latent node → `length` (or `num_frames`) |
   | FPS | the save/encode node → `fps` (optional) |
   | Seed | `KSampler` → `seed` (or `noise_seed`) |
   | Steps / CFG | `KSampler` → `steps` / `cfg` (optional — else the panel defaults) |

   Only literal (string/number) inputs are offered; wired inputs (arrays like
   `["4", 0]`) are left alone.
5. Click **Validate T2V mapping** — it dry-runs `applyMap` and confirms every
   mapped node/input exists.
6. (Optional) do the same in **Image → Video workflow**; also map **First-frame
   image** to your `LoadImage` node's `image` input. The app uploads the source
   frame via `/upload/image` and injects the returned filename.
7. Tick **"Use ComfyUI for generation when reachable"**.

## 4. Generate

**AI Studio → Generate → Text → Video**. The pill now reads **"ComfyUI backend
· local diffusion"**. Prompt, size, duration and seed come from the Studio form;
progress is the real sampler step count over the websocket; **Cancel** calls
`/interrupt`. The result is downloaded and becomes a normal asset — trim it,
grade it, drop it on the timeline.

## How routing works

`src/ai/orchestrator.ts` holds `providers = [local, comfyui, procedural]` and
`route(task)` returns the **first** provider whose `capabilities` cover the
task. `comfyProvider.capabilities` returns `NO_CAPABILITIES` unless the adapter
is enabled **and** the relevant workflow is configured, so ComfyUI only wins
when it is actually ready; otherwise the procedural generator handles it and
generative modes are never dead. Business logic never checks `provider.id ===
'comfyui'` (spec §201) — only capabilities.

## Troubleshooting

| symptom | cause / fix |
| --- | --- |
| Test says "not reachable" | ComfyUI not running, wrong port, or `--enable-cors-header "*"` missing |
| "not an API-format workflow" | you pasted the normal save; use **Export (API)** / *Save (API Format)* |
| "ComfyUI rejected the workflow (400)" | a mapped value hit an incompatible input, or the graph references a missing model/node — run the graph once in ComfyUI first |
| "ran but saved no video/image" | the workflow has no `SaveAnimatedWEBP` / `VHS_VideoCombine` / `SaveImage` output node |
| progress stalls at "loading model" | first run loads weights into VRAM — normal; watch the ComfyUI console |
| output is a WEBP/GIF, not MP4 | fine — it is imported as-is; add a video-combine node for MP4 |

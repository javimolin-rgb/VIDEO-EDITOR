# Troubleshooting

Every in-app error also gives a **why / what / how-to-fix** (spec §119). This
is the longer form.

## Export produces a 0-byte or missing file

- **MP4**: needs `VideoEncoder` (WebCodecs). Available in Chrome/Edge, not in
  Safari/Firefox yet. The dialog says so and offers WebM.
- **WebM**: `MediaRecorder` + `canvas.captureStream` need a real GPU/compositor.
  In headless / heavily sandboxed browsers it can return empty. Use MP4, or run
  in a normal browser window.

## "That feature needs a local model that is not installed"

Open **AI Setup → On-device speech models** and click Download (~40 MB). It
runs offline afterwards. Weights come from the Hugging Face hub on first use.

## Model download fails / `registerBackend` is undefined

`@xenova/transformers` needs a single `onnxruntime` instance and its WASM
files. This build sets `vite optimizeDeps.include: ['@xenova/transformers']`
and `env.backends.onnx.wasm.wasmPaths` to a pinned jsDelivr URL. If you fork:
keep both. A blocked CDN or offline machine will fail the first download only.

## Preview is black

- The playhead is in a gap (no clip at that frame).
- A track is hidden (the `H` toggle in its header).
- A clip's opacity is 0, or a fade covers the whole clip.
- Check **Settings → Diagnostics** for the preview FPS and recent logs.

## Generation is slow

The procedural generator renders every frame in JS. A 5 s / 1080p clip is
~150 frames; on a low-end GPU expect tens of seconds. Lower the render quality
in the Studio's Advanced panel, or the resolution in project Settings.

## The app forgot my project

Projects live in the browser's IndexedDB for this origin. Private windows,
"clear site data", a different browser or profile, or aggressive storage
eviction will lose them. Use **Export project** (Phase 8+) or keep versions.

## Colours look wrong after import

The importer normalises rotation/VFR but does not colour-manage HDR. Grade the
clip in the Inspector, or use **Automation → auto-colour**.

## Getting help

**Settings → Diagnostics → Export diagnostics** downloads a JSON with your
hardware profile, model states, the queue, storage usage and recent logs — no
media, no personal data beyond project names. Attach it to a bug report.

# Rendering pipeline

Preview and final render share **one** compositor so what you see is what you
export (spec §12, §13, §168).

## `src/video/compositor.ts` — `renderFrame(ctx, project, frame, resolver, opts)`

Per frame, onto a 2D context at project resolution:

1. Fill the project background.
2. **Visual tracks**, bottom (higher `index`) to top. For each track:
   - clips active at `frame` are found;
   - any **transition** whose overlap window contains `frame` renders its two
     clips to scratch layers and composites them with the transition function;
   - remaining clips render solo, earliest first.
3. Each clip renders to a pooled scratch canvas:
   `ctx.filter` = colour grade + filter-type effects (`buildFilterString`) →
   `drawTransformed` (contain-fit + position/scale/rotation about anchor) →
   temperature/tint soft-light overlays → overlay effects (vignette, grain).
   Then composited to the frame at the clip's resolved opacity.
4. **Adjustment layers** (spec §112): each active adjustment clip re-filters the
   whole accumulated frame with its own colour grade + effects.
5. **Caption layer** (spec §50): the active cue is drawn by `drawCaptions`.

All animatable values (opacity, gain, transform.\*, colour.\*) come from
`resolveClipProps` → `sampleParam` (keyframes) with fades folded in, so the
compositor never re-implements animation.

### Effects

`domain/effects/registry.ts` is the catalogue. `render: 'filter'` effects map
to `ctx.filter` functions; `sharpen` uses an injected SVG `feConvolveMatrix`
referenced as `url(#aiv-sharpen)`. `render: 'overlay'` effects (vignette, grain)
are drawn as a pass after the image. Grain uses a seeded tile so exports are
reproducible (spec §242).

### Transitions

`dissolve` (crossfade), `fade-color` (through a solid colour), `wipe`
(L/R/U/D clip rect), `slide` (push), `zoom`. Progress `p` = position within the
overlap `[toClip.start, fromClip.end)`.

## Preview — `src/video/previewEngine.ts`

Pools one `<video>`/`<img>` per asset. `requestRender(frame)` coalesces to one
async `renderFrame` per animation frame (never blocks the UI). During playback
the media elements run for audio; when paused they are seeked frame-exact
(`awaitSeek`).

## Final render — `src/export/exporter.ts`

- **MP4 (preferred)**: `ExportMediaPool` (awaited seeks) feeds `renderFrame`
  for every frame → `VideoFrame` → `VideoEncoder` (H.264). Audio is mixed
  offline (`audioMixer.ts`, `OfflineAudioContext`) then `AudioEncoder` (AAC).
  Muxed with the bundled `mp4-muxer` — no network, no FFmpeg binary.
- **WebM (fallback)** when WebCodecs is unavailable: real-time
  `canvas.captureStream()` + an `AudioBufferSourceNode` of the offline mix into
  a `MediaStreamDestination`, recorded by `MediaRecorder`.

Both are chosen automatically (`webCodecsAvailable`) and both run the identical
compositor, so effects/transitions/captions are always in the output.

## Not yet (Phase 2.5+)

WebGPU path, real convolution effects beyond sharpen, motion blur, per-frame
colour LUTs, GPU-accelerated transitions.

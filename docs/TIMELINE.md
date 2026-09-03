# Timeline

## Model (`src/domain/types.ts`)

- **Timebase**: `{ fps, dropFrame }`. Canonical unit is the whole **frame**.
- **Track**: `kind` ∈ `video | audio | text | adjustment | caption`, plus
  `index` (order within kind), `muted` / `locked` / `hidden`, `height`.
- **Clip**: `assetId` + `timelineStart` (frame) + `sourceIn`/`sourceOut`
  (asset frames) + `speed` + `gain` + `opacity` + `fadeInFrames` /
  `fadeOutFrames` + optional `label`. Non-destructive.
- **Marker**: `{ frame, label, color }`.
- **Timeline**: `timebase`, `durationFrames`, `tracks`, `clips`, `markers`,
  `playheadFrame`, `selectionRange`.

`clipTimelineRange(clip)` returns the half-open `[start, end)` in timeline
frames, accounting for `speed`.

## Operations (`src/domain/timeline/operations.ts`)

All pure `(Timeline, params) → Timeline` (or `{ timeline, id }`):

| Function | Notes |
| --- | --- |
| `addClip` | inserts; `avoidOverlap` (default) pushes to the next free slot via `findFreeSlot` |
| `moveClip` | new start and/or track; overlap-avoiding by default |
| `trimClip` | `edge: 'start' \| 'end'`. Start edge rolls `sourceIn` (true trim, not slip) |
| `splitClip` | blade at a frame strictly inside the clip; shares the source |
| `removeClip` / `rippleDeleteClip` | plain delete / delete + pull later same-track clips back |
| `duplicateClip` | copy into the next free slot after the original |
| `setPlayhead` / `setSelectionRange` | clamped; non-undoable in the store |
| `addMarker` / `removeMarker` | |
| `addTrack` / `updateTrack` / `removeTrack` | removing a track drops its clips |
| `contentEndFrame` / `findFreeSlot` / `clipsOnTrack` | helpers |

The sequence length auto-grows to cover the last clip; it never auto-shrinks.

## Interaction (`src/ui/editor/Timeline.tsx`)

- Ruler drag → scrub playhead. Empty-lane click → set playhead + activate track.
- Clip body drag → move (cross-track by pointer Y). Left/right handle → trim.
- Snapping (toggleable) to `0`, playhead, every clip edge, every marker, within
  an 8 px threshold scaled by zoom.
- Drag an asset from the Media panel onto a lane → `addClipFromAsset` at the
  drop frame.
- Zoom is `pxPerFrame` in `uiStore`; ruler ticks pick a "nice" second interval
  for ~90 px spacing.

## Phase 2 additions

Slip/slide/roll trims, magnetic mode, transitions between adjacent clips,
keyframe lanes, waveform + thumbnail strips inside clips, nested/compound
clips, configurable shortcuts.

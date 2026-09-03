/**
 * Frame-accurate time model (spec §11).
 *
 * The timeline's canonical unit is the **frame**, evaluated against the
 * project frame rate. Seconds are a derived convenience, never the source of
 * truth for edit operations.
 */

export type Fps = number;

/** Whole frame index on the project timebase. */
export type Frame = number;

export interface Timebase {
  readonly fps: Fps;
  /** Drop-frame is not modelled yet; kept for forward-compat with 29.97/59.94. */
  readonly dropFrame: boolean;
}

export const DEFAULT_TIMEBASE: Timebase = { fps: 30, dropFrame: false };

export function secondsToFrames(seconds: number, tb: Timebase): Frame {
  return Math.round(seconds * tb.fps);
}

export function framesToSeconds(frames: Frame, tb: Timebase): number {
  return frames / tb.fps;
}

export function clampFrame(frame: Frame, min: Frame, max: Frame): Frame {
  return Math.min(Math.max(frame, min), max);
}

/** Snap an arbitrary frame value to the nearest whole frame. */
export function quantize(frame: number): Frame {
  return Math.round(frame);
}

/**
 * Format a frame index as SMPTE-ish timecode `HH:MM:SS:FF`.
 * Non-drop only for now.
 */
export function formatTimecode(frame: Frame, tb: Timebase): string {
  const fps = Math.max(1, Math.round(tb.fps));
  const totalSeconds = Math.floor(frame / fps);
  const ff = Math.abs(frame % fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(hh)}:${p2(mm)}:${p2(ss)}:${p2(ff)}`;
}

/** Compact `M:SS` / `H:MM:SS` label for rulers and clip chips. */
export function formatClock(frame: Frame, tb: Timebase): string {
  const secs = Math.max(0, framesToSeconds(frame, tb));
  const s = Math.floor(secs % 60);
  const m = Math.floor(secs / 60) % 60;
  const h = Math.floor(secs / 3600);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}` : `${m}:${p2(s)}`;
}

/** A half-open range `[start, end)` measured in frames. */
export interface FrameRange {
  start: Frame;
  end: Frame;
}

export function rangeLength(r: FrameRange): Frame {
  return Math.max(0, r.end - r.start);
}

export function rangesOverlap(a: FrameRange, b: FrameRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function rangeContains(r: FrameRange, frame: Frame): boolean {
  return frame >= r.start && frame < r.end;
}

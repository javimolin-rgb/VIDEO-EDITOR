/**
 * Keyframe evaluation (spec §106). Curves are stored per animatable parameter
 * as `Keyframe[]` with frames relative to the clip's own start. Each keyframe
 * carries the easing used on the segment that *leaves* it.
 */

import type { AnimatableParam, Clip, Easing, Keyframe } from './types';

export function ease(easing: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (easing) {
    case 'hold':
      return 0;
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'linear':
    default:
      return x;
  }
}

/** Sorted copy of a keyframe list (defensive; UI keeps them sorted). */
function sorted(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.frame - b.frame);
}

/**
 * Value of a keyframed parameter at `localFrame`. Clamps to the first/last
 * keyframe outside the range. Returns `null` if there are no keyframes.
 */
export function evaluateKeyframes(kfs: Keyframe[] | undefined, localFrame: number): number | null {
  if (!kfs || kfs.length === 0) return null;
  const list = sorted(kfs);
  const first = list[0]!;
  const last = list[list.length - 1]!;
  if (localFrame <= first.frame) return first.value;
  if (localFrame >= last.frame) return last.value;

  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    if (localFrame >= a.frame && localFrame <= b.frame) {
      const span = b.frame - a.frame;
      if (span <= 0) return b.value;
      const tRaw = (localFrame - a.frame) / span;
      const t = ease(a.easing, tRaw);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

/**
 * Animated value for a clip parameter at `localFrame`, or `null` when the
 * parameter is not keyframed (caller then uses the clip's base field).
 */
export function sampleParam(clip: Clip, param: AnimatableParam, localFrame: number): number | null {
  return evaluateKeyframes(clip.keyframes[param], localFrame);
}

export function hasKeyframes(clip: Clip, param: AnimatableParam): boolean {
  return (clip.keyframes[param]?.length ?? 0) > 0;
}

/** The clip's *base* (un-animated) value for an animatable parameter. */
export function currentParamValue(clip: Clip, param: AnimatableParam): number {
  switch (param) {
    case 'opacity':
      return clip.opacity;
    case 'gain':
      return clip.gain;
    case 'transform.x':
      return clip.transform.x;
    case 'transform.y':
      return clip.transform.y;
    case 'transform.scale':
      return clip.transform.scale;
    case 'transform.rotation':
      return clip.transform.rotation;
    case 'color.exposure':
      return clip.color.exposure;
    case 'color.contrast':
      return clip.color.contrast;
    case 'color.saturation':
      return clip.color.saturation;
    default:
      return 0;
  }
}

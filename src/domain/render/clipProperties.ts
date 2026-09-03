/**
 * Single source of truth for a clip's *resolved* render properties at a given
 * timeline frame: base fields, keyframe animation (spec §106) and fades folded
 * together. Both the preview compositor and the final renderer call this so
 * they cannot drift apart.
 */

import { clipTimelineRange, type Clip, type ColorGrade, type EffectInstance, type Transform } from '@/domain/types';
import { sampleParam } from '@/domain/keyframes';

export interface ResolvedClipProps {
  /** Local frame within the clip (0-based). */
  localFrame: number;
  /** Visible opacity incl. opacity keyframes/base and visual fades, 0..1. */
  opacity: number;
  /** Audio gain incl. gain keyframes/base and audio fades, >= 0. */
  gain: number;
  pan: number;
  transform: Transform;
  color: ColorGrade;
  /** Enabled effects only, in stack order. */
  effects: EffectInstance[];
}

function fadeMultiplier(clip: Clip, localFrame: number): number {
  const range = clipTimelineRange(clip);
  const len = range.end - range.start;
  let m = 1;
  if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) {
    m *= Math.max(0, localFrame) / clip.fadeInFrames;
  }
  const toEnd = len - localFrame;
  if (clip.fadeOutFrames > 0 && toEnd < clip.fadeOutFrames) {
    m *= Math.max(0, toEnd) / clip.fadeOutFrames;
  }
  return Math.max(0, Math.min(1, m));
}

export function resolveClipProps(clip: Clip, timelineFrame: number): ResolvedClipProps {
  const range = clipTimelineRange(clip);
  const localFrame = timelineFrame - range.start;
  const fade = fadeMultiplier(clip, localFrame);

  const baseOpacity = sampleParam(clip, 'opacity', localFrame) ?? clip.opacity;
  const baseGain = sampleParam(clip, 'gain', localFrame) ?? clip.gain;

  const transform: Transform = {
    x: sampleParam(clip, 'transform.x', localFrame) ?? clip.transform.x,
    y: sampleParam(clip, 'transform.y', localFrame) ?? clip.transform.y,
    scale: sampleParam(clip, 'transform.scale', localFrame) ?? clip.transform.scale,
    rotation: sampleParam(clip, 'transform.rotation', localFrame) ?? clip.transform.rotation,
    anchorX: clip.transform.anchorX,
    anchorY: clip.transform.anchorY,
  };

  const color: ColorGrade = {
    ...clip.color,
    exposure: sampleParam(clip, 'color.exposure', localFrame) ?? clip.color.exposure,
    contrast: sampleParam(clip, 'color.contrast', localFrame) ?? clip.color.contrast,
    saturation: sampleParam(clip, 'color.saturation', localFrame) ?? clip.color.saturation,
  };

  return {
    localFrame,
    opacity: Math.max(0, Math.min(1, baseOpacity * fade)),
    gain: Math.max(0, baseGain * fade),
    pan: Math.max(-1, Math.min(1, clip.pan)),
    transform,
    color,
    effects: clip.effects.filter((e) => e.enabled),
  };
}

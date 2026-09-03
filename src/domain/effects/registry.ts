/**
 * Effect catalogue (spec §107). Phase 2 ships GPU-cheap effects that are
 * expressible as canvas `ctx.filter` functions plus two overlay passes
 * (vignette, grain). Each is rendered identically by the preview compositor
 * and the final renderer.
 */

import { newId } from '@/lib/id';
import type { EffectInstance, EffectType } from '@/domain/types';

export interface EffectParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** For display, e.g. 'px', '°', '%'. */
  unit?: string;
}

export interface EffectDef {
  type: EffectType;
  label: string;
  category: 'blur' | 'stylize' | 'color' | 'texture';
  /** How the renderer applies it. */
  render: 'filter' | 'overlay';
  params: EffectParamDef[];
}

export const EFFECT_DEFS: Record<EffectType, EffectDef> = {
  'gaussian-blur': {
    type: 'gaussian-blur',
    label: 'Gaussian blur',
    category: 'blur',
    render: 'filter',
    params: [{ key: 'radius', label: 'Radius', min: 0, max: 40, step: 0.5, default: 6, unit: 'px' }],
  },
  sharpen: {
    type: 'sharpen',
    label: 'Sharpen',
    category: 'stylize',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.05, default: 0.8 }],
  },
  vignette: {
    type: 'vignette',
    label: 'Vignette',
    category: 'stylize',
    render: 'overlay',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 0.45 },
      { key: 'size', label: 'Size', min: 0.2, max: 1, step: 0.02, default: 0.7 },
    ],
  },
  grain: {
    type: 'grain',
    label: 'Film grain',
    category: 'texture',
    render: 'overlay',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 0.25 }],
  },
  grayscale: {
    type: 'grayscale',
    label: 'Grayscale',
    category: 'color',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 1 }],
  },
  sepia: {
    type: 'sepia',
    label: 'Sepia',
    category: 'color',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 1 }],
  },
  'hue-rotate': {
    type: 'hue-rotate',
    label: 'Hue rotate',
    category: 'color',
    render: 'filter',
    params: [{ key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, default: 30, unit: '°' }],
  },
  brightness: {
    type: 'brightness',
    label: 'Brightness',
    category: 'color',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.02, default: 1.15 }],
  },
  invert: {
    type: 'invert',
    label: 'Invert',
    category: 'stylize',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 1 }],
  },
};

export const EFFECT_LIST: EffectDef[] = Object.values(EFFECT_DEFS);

export function createEffect(type: EffectType): EffectInstance {
  const def = EFFECT_DEFS[type];
  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = p.default;
  return { id: newId('clip'), type, enabled: true, params };
}

/** Clamp an effect param to its declared range. */
export function clampEffectParam(type: EffectType, key: string, value: number): number {
  const p = EFFECT_DEFS[type].params.find((x) => x.key === key);
  if (!p) return value;
  return Math.min(p.max, Math.max(p.min, value));
}

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
  contrast: {
    type: 'contrast',
    label: 'Contrast',
    category: 'color',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 2.5, step: 0.02, default: 1.25 }],
  },
  saturation: {
    type: 'saturation',
    label: 'Saturation',
    category: 'color',
    render: 'filter',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.02, default: 1.4 }],
  },
  duotone: {
    type: 'duotone',
    label: 'Duotone',
    category: 'color',
    render: 'filter',
    params: [
      { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, default: 200, unit: '°' },
      { key: 'strength', label: 'Strength', min: 0, max: 2, step: 0.02, default: 1 },
    ],
  },
  'blur-direction': {
    type: 'blur-direction',
    label: 'Motion blur',
    category: 'blur',
    render: 'overlay',
    params: [
      { key: 'amount', label: 'Length', min: 0, max: 40, step: 1, default: 12, unit: 'px' },
      { key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, default: 0, unit: '°' },
    ],
  },
  scanlines: {
    type: 'scanlines',
    label: 'Scanlines',
    category: 'texture',
    render: 'overlay',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 0.35 },
      { key: 'size', label: 'Line size', min: 1, max: 8, step: 1, default: 2, unit: 'px' },
    ],
  },
  chromatic: {
    type: 'chromatic',
    label: 'Chromatic aberration',
    category: 'stylize',
    render: 'overlay',
    params: [{ key: 'amount', label: 'Offset', min: 0, max: 24, step: 0.5, default: 5, unit: 'px' }],
  },
  bloom: {
    type: 'bloom',
    label: 'Bloom / glow',
    category: 'stylize',
    render: 'overlay',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 0.5 },
      { key: 'radius', label: 'Radius', min: 2, max: 60, step: 1, default: 18, unit: 'px' },
    ],
  },
  pixelate: {
    type: 'pixelate',
    label: 'Pixelate',
    category: 'stylize',
    render: 'overlay',
    params: [{ key: 'size', label: 'Block', min: 2, max: 64, step: 1, default: 12, unit: 'px' }],
  },
  vhs: {
    type: 'vhs',
    label: 'VHS',
    category: 'texture',
    render: 'overlay',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.02, default: 0.5 }],
  },
  mirror: {
    type: 'mirror',
    label: 'Mirror',
    category: 'stylize',
    render: 'overlay',
    params: [{ key: 'axis', label: 'Axis (0=L→R, 1=R→L, 2=T→B, 3=B→T)', min: 0, max: 3, step: 1, default: 0 }],
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

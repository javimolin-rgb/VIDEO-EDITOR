/**
 * Shared frame compositor (spec §12, §13, §168 — one renderer, two callers).
 *
 * `renderFrame` composites a single timeline frame onto a 2D context:
 * track stacking, per-clip transform + colour grade + effects, standard
 * transitions (spec §108), adjustment layers (spec §112) and the caption
 * layer (spec §50). The preview engine and the final renderer both call it;
 * they differ only in the `VisualResolver` they pass and whether seeks are
 * awaited.
 */

import type { Clip, ColorGrade, EffectInstance, Timeline, Transform, VideoProject } from '@/domain/types';
import { clipTimelineRange } from '@/domain/types';
import { framesToSeconds } from '@/lib/time';
import { resolveClipProps } from '@/domain/render/clipProperties';
import { EFFECT_DEFS } from '@/domain/effects/registry';
import { drawCaptions } from './captions';

export interface Drawable {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface VisualResolver {
  resolve(assetId: string): Drawable | null;
  seek(assetId: string, timeSec: number): void | Promise<void>;
}

export interface RenderOptions {
  /** Offline render awaits seeks for frame accuracy; preview does not. */
  awaitSeek: boolean;
  /** Deterministic seed for grain so exports are reproducible. */
  grainSeed?: number;
}

// ─── scratch canvas pool ────────────────────────────────────────────────────

const pool: HTMLCanvasElement[] = [];
let poolIdx = 0;

function scratch(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  let c = pool[poolIdx];
  if (!c) {
    c = document.createElement('canvas');
    pool[poolIdx] = c;
  }
  poolIdx = (poolIdx + 1) % 6;
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return { canvas: c, ctx };
}

// ─── SVG sharpen filter (ctx.filter cannot do convolution on its own) ────────

let sharpenEl: SVGFEConvolveMatrixElement | null = null;

function ensureSharpen(): string {
  if (typeof document === 'undefined') return '';
  if (!sharpenEl) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    const filter = document.createElementNS(NS, 'filter');
    filter.setAttribute('id', 'aiv-sharpen');
    const fe = document.createElementNS(NS, 'feConvolveMatrix') as SVGFEConvolveMatrixElement;
    fe.setAttribute('order', '3');
    fe.setAttribute('preserveAlpha', 'true');
    fe.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
    filter.appendChild(fe);
    svg.appendChild(filter);
    document.body.appendChild(svg);
    sharpenEl = fe;
  }
  return 'url(#aiv-sharpen)';
}

function setSharpenAmount(a: number): void {
  if (!sharpenEl) return;
  // Standard sharpen kernel: centre 1 + 4a, orthogonal neighbours -a.
  sharpenEl.setAttribute('kernelMatrix', `0 ${-a} 0 ${-a} ${1 + 4 * a} ${-a} 0 ${-a} 0`);
}

// ─── filter string from colour grade + filter-type effects ───────────────────

export function buildFilterString(color: ColorGrade, effects: EffectInstance[]): string {
  const parts: string[] = [];

  if (color.enabled) {
    if (color.exposure !== 0) parts.push(`brightness(${(1 + color.exposure).toFixed(3)})`);
    if (color.contrast !== 0) parts.push(`contrast(${(1 + color.contrast).toFixed(3)})`);
    if (color.saturation !== 0) parts.push(`saturate(${(1 + color.saturation).toFixed(3)})`);
  }

  for (const fx of effects) {
    if (EFFECT_DEFS[fx.type].render !== 'filter') continue;
    switch (fx.type) {
      case 'gaussian-blur':
        parts.push(`blur(${(fx.params.radius ?? 0).toFixed(2)}px)`);
        break;
      case 'brightness':
        parts.push(`brightness(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'grayscale':
        parts.push(`grayscale(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'sepia':
        parts.push(`sepia(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'hue-rotate':
        parts.push(`hue-rotate(${(fx.params.angle ?? 0).toFixed(1)}deg)`);
        break;
      case 'invert':
        parts.push(`invert(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'sharpen': {
        const url = ensureSharpen();
        if (url) {
          setSharpenAmount(fx.params.amount ?? 0.8);
          parts.push(url);
        }
        break;
      }
    }
  }

  return parts.length ? parts.join(' ') : 'none';
}

// ─── drawing primitives ─────────────────────────────────────────────────────

function drawTransformed(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  sw: number,
  sh: number,
  cw: number,
  ch: number,
  t: Transform,
): void {
  const fit = Math.min(cw / sw, ch / sh);
  const baseW = sw * fit;
  const baseH = sh * fit;
  const w = baseW * t.scale;
  const h = baseH * t.scale;

  ctx.save();
  ctx.translate(cw / 2 + t.x, ch / 2 + t.y);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  const ax = (t.anchorX - 0.5) * w;
  const ay = (t.anchorY - 0.5) * h;
  ctx.drawImage(src, -w / 2 - ax, -h / 2 - ay, w, h);
  ctx.restore();
}

function drawColorOverlays(ctx: CanvasRenderingContext2D, w: number, h: number, color: ColorGrade): void {
  if (!color.enabled) return;
  if (color.temperature !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(0.6, Math.abs(color.temperature));
    ctx.fillStyle = color.temperature > 0 ? '#ff9a3c' : '#3ca8ff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (color.tint !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(0.6, Math.abs(color.tint));
    ctx.fillStyle = color.tint > 0 ? '#ff4cd6' : '#6bff8c';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function drawOverlayEffects(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  effects: EffectInstance[],
  seed: number,
): void {
  for (const fx of effects) {
    if (EFFECT_DEFS[fx.type].render !== 'overlay') continue;
    if (fx.type === 'vignette') {
      const amount = fx.params.amount ?? 0.45;
      const size = fx.params.size ?? 0.7;
      const g = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * size * 0.4,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${amount.toFixed(3)})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else if (fx.type === 'grain') {
      const amount = fx.params.amount ?? 0.25;
      const tile = grainTile(seed);
      ctx.save();
      ctx.globalAlpha = Math.min(1, amount);
      ctx.globalCompositeOperation = 'overlay';
      const pattern = ctx.createPattern(tile, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }
  }
}

let grainCanvas: HTMLCanvasElement | null = null;
let grainSeedCached = -1;
function grainTile(seed: number): HTMLCanvasElement {
  if (grainCanvas && grainSeedCached === seed) return grainCanvas;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = seed || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + rnd() * 70;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  grainSeedCached = seed;
  return c;
}

// ─── per-clip render to a scratch layer ─────────────────────────────────────

async function renderClipLayer(
  clip: Clip,
  frame: number,
  fps: number,
  w: number,
  h: number,
  resolver: VisualResolver,
  opts: RenderOptions,
): Promise<{ canvas: HTMLCanvasElement; opacity: number } | null> {
  const props = resolveClipProps(clip, frame);
  const sourceSec = framesToSeconds(
    clip.sourceIn + Math.round(props.localFrame * clip.speed),
    { fps, dropFrame: false },
  );
  if (opts.awaitSeek) await resolver.seek(clip.assetId, sourceSec);
  else resolver.seek(clip.assetId, sourceSec);

  const drawable = resolver.resolve(clip.assetId);
  if (!drawable || !drawable.width) return null;

  const { canvas, ctx } = scratch(w, h);
  ctx.filter = buildFilterString(props.color, props.effects);
  drawTransformed(ctx, drawable.source, drawable.width, drawable.height, w, h, props.transform);
  ctx.filter = 'none';
  drawColorOverlays(ctx, w, h, props.color);
  drawOverlayEffects(ctx, w, h, props.effects, opts.grainSeed ?? 1);
  return { canvas, opacity: props.opacity };
}

// ─── transitions (spec §108) ────────────────────────────────────────────────

function compositeTransition(
  ctx: CanvasRenderingContext2D,
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  type: string,
  p: number,
  params: Record<string, number | string>,
  w: number,
  h: number,
): void {
  const prog = Math.min(1, Math.max(0, p));
  switch (type) {
    case 'fade-color': {
      const color = String(params.color ?? '#000000');
      if (prog < 0.5) {
        ctx.drawImage(a, 0, 0);
        ctx.save();
        ctx.globalAlpha = prog * 2;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(b, 0, 0);
        ctx.save();
        ctx.globalAlpha = (1 - prog) * 2;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      break;
    }
    case 'wipe': {
      ctx.drawImage(a, 0, 0);
      ctx.save();
      ctx.beginPath();
      const dir = String(params.direction ?? 'left');
      if (dir === 'left') ctx.rect(0, 0, w * prog, h);
      else if (dir === 'right') ctx.rect(w * (1 - prog), 0, w * prog, h);
      else if (dir === 'up') ctx.rect(0, 0, w, h * prog);
      else ctx.rect(0, h * (1 - prog), w, h * prog);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      ctx.restore();
      break;
    }
    case 'slide': {
      ctx.drawImage(a, -w * prog, 0);
      ctx.drawImage(b, w * (1 - prog), 0);
      break;
    }
    case 'zoom': {
      ctx.drawImage(a, 0, 0);
      ctx.save();
      const s = 0.6 + 0.4 * prog;
      ctx.globalAlpha = prog;
      ctx.translate(w / 2, h / 2);
      ctx.scale(s, s);
      ctx.drawImage(b, -w / 2, -h / 2);
      ctx.restore();
      break;
    }
    case 'dissolve':
    default: {
      ctx.drawImage(a, 0, 0);
      ctx.save();
      ctx.globalAlpha = prog;
      ctx.drawImage(b, 0, 0);
      ctx.restore();
      break;
    }
  }
}

// ─── main entry ─────────────────────────────────────────────────────────────

export async function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  frame: number,
  resolver: VisualResolver,
  opts: RenderOptions,
): Promise<void> {
  const { width: w, height: h } = project.settings.resolution;
  const fps = project.settings.fps;
  const timeline: Timeline = project.timeline;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = project.settings.backgroundColor;
  ctx.fillRect(0, 0, w, h);

  const visualTracks = timeline.tracks
    .filter((t) => (t.kind === 'video' || t.kind === 'text') && !t.hidden)
    .sort((x, y) => y.index - x.index); // bottom (higher index) first

  for (const track of visualTracks) {
    const active = timeline.clips
      .filter((c) => c.trackId === track.id)
      .filter((c) => {
        const r = clipTimelineRange(c);
        return frame >= r.start && frame < r.end;
      });
    if (active.length === 0) continue;

    const consumed = new Set<string>();

    // Transitions on this track whose overlap contains `frame`.
    for (const tr of timeline.transitions.filter((t) => t.trackId === track.id)) {
      const from = active.find((c) => c.id === tr.fromClipId);
      const to = active.find((c) => c.id === tr.toClipId);
      if (!from || !to) continue;
      const overlapStart = clipTimelineRange(to).start;
      const overlapEnd = clipTimelineRange(from).end;
      if (frame < overlapStart || frame >= overlapEnd || overlapEnd <= overlapStart) continue;
      const p = (frame - overlapStart) / (overlapEnd - overlapStart);
      const [la, lb] = await Promise.all([
        renderClipLayer(from, frame, fps, w, h, resolver, opts),
        renderClipLayer(to, frame, fps, w, h, resolver, opts),
      ]);
      consumed.add(from.id);
      consumed.add(to.id);
      if (!la && !lb) continue;
      const merged = scratch(w, h);
      if (la) {
        merged.ctx.globalAlpha = la.opacity;
        merged.ctx.drawImage(la.canvas, 0, 0);
        merged.ctx.globalAlpha = 1;
      }
      if (la && lb) {
        compositeTransition(merged.ctx, la.canvas, lb.canvas, tr.type, p, tr.params, w, h);
      } else if (lb) {
        merged.ctx.globalAlpha = lb.opacity * p;
        merged.ctx.drawImage(lb.canvas, 0, 0);
        merged.ctx.globalAlpha = 1;
      }
      ctx.drawImage(merged.canvas, 0, 0);
    }

    // Remaining solo clips, earliest first.
    for (const clip of active.filter((c) => !consumed.has(c.id)).sort((x, y) => x.timelineStart - y.timelineStart)) {
      const layer = await renderClipLayer(clip, frame, fps, w, h, resolver, opts);
      if (!layer) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }
  }

  // Adjustment layers (spec §112): grade/effect everything rendered so far.
  const adjustmentClips = timeline.tracks
    .filter((t) => t.kind === 'adjustment' && !t.hidden)
    .flatMap((t) => timeline.clips.filter((c) => c.trackId === t.id))
    .filter((c) => {
      const r = clipTimelineRange(c);
      return frame >= r.start && frame < r.end;
    });

  for (const adj of adjustmentClips) {
    const props = resolveClipProps(adj, frame);
    const snap = scratch(w, h);
    snap.ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = buildFilterString(props.color, props.effects);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(snap.canvas, 0, 0);
    ctx.filter = 'none';
    drawColorOverlays(ctx, w, h, props.color);
    drawOverlayEffects(ctx, w, h, props.effects, opts.grainSeed ?? 1);
  }

  // Captions (spec §50).
  if (timeline.captionLayer.enabled && timeline.captionLayer.cues.length > 0) {
    drawCaptions(ctx, timeline.captionLayer, frame, w, h);
  }
}

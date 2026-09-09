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
      case 'contrast':
        parts.push(`contrast(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'saturation':
        parts.push(`saturate(${(fx.params.amount ?? 1).toFixed(3)})`);
        break;
      case 'duotone': {
        const s = fx.params.strength ?? 1;
        parts.push(
          `grayscale(1) sepia(1) hue-rotate(${(fx.params.hue ?? 200).toFixed(0)}deg) saturate(${(2 * s).toFixed(2)}) contrast(${(1 + 0.1 * s).toFixed(2)})`,
        );
        break;
      }
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
    } else if (fx.type === 'scanlines') {
      const amount = Math.min(1, fx.params.amount ?? 0.35);
      const size = Math.max(1, Math.round(fx.params.size ?? 2));
      ctx.save();
      ctx.globalAlpha = amount;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += size * 2) ctx.fillRect(0, y, w, size);
      ctx.restore();
    } else if (fx.type === 'pixelate') {
      const block = Math.max(2, Math.round(fx.params.size ?? 12));
      const sw = Math.max(1, Math.round(w / block));
      const sh = Math.max(1, Math.round(h / block));
      const tmp = freshCanvas(sw, sh);
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(ctx.canvas, 0, 0, sw, sh);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, w, h);
      ctx.restore();
    } else if (fx.type === 'mirror') {
      const axis = Math.round(fx.params.axis ?? 0);
      const snap = snapshot(ctx, w, h);
      ctx.save();
      ctx.beginPath();
      if (axis === 0) {
        ctx.rect(w / 2, 0, w / 2, h);
        ctx.clip();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      } else if (axis === 1) {
        ctx.rect(0, 0, w / 2, h);
        ctx.clip();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      } else if (axis === 2) {
        ctx.rect(0, h / 2, w, h / 2);
        ctx.clip();
        ctx.translate(0, h);
        ctx.scale(1, -1);
      } else {
        ctx.rect(0, 0, w, h / 2);
        ctx.clip();
        ctx.translate(0, h);
        ctx.scale(1, -1);
      }
      ctx.drawImage(snap, 0, 0);
      ctx.restore();
    } else if (fx.type === 'chromatic') {
      const off = fx.params.amount ?? 5;
      if (off > 0.1) {
        const snap = snapshot(ctx, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.5;
        drawTinted(ctx, snap, w, h, -off, 0, 'rgb(255,0,0)');
        drawTinted(ctx, snap, w, h, off, 0, 'rgb(0,0,255)');
        drawTinted(ctx, snap, w, h, 0, 0, 'rgb(0,255,0)');
        ctx.restore();
      }
    } else if (fx.type === 'blur-direction') {
      const len = fx.params.amount ?? 12;
      if (len > 0.5) {
        const ang = ((fx.params.angle ?? 0) * Math.PI) / 180;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const snap = snapshot(ctx, w, h);
        ctx.save();
        ctx.globalAlpha = 0.32;
        for (let i = 1; i <= 4; i++) {
          const d = (len * i) / 4;
          ctx.drawImage(snap, dx * d, dy * d);
          ctx.drawImage(snap, -dx * d, -dy * d);
        }
        ctx.restore();
      }
    } else if (fx.type === 'bloom') {
      const amount = Math.min(1, fx.params.amount ?? 0.5);
      const radius = fx.params.radius ?? 18;
      if (amount > 0.01) {
        const glow = freshCanvas(w, h);
        const gctx = glow.getContext('2d')!;
        gctx.filter = `brightness(1.4) contrast(1.3) blur(${radius}px)`;
        gctx.drawImage(ctx.canvas, 0, 0);
        gctx.filter = 'none';
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = amount;
        ctx.drawImage(glow, 0, 0);
        ctx.restore();
      }
    } else if (fx.type === 'vhs') {
      const amount = Math.min(1, fx.params.amount ?? 0.5);
      const snap = snapshot(ctx, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.4 * amount;
      drawTinted(ctx, snap, w, h, -3 * amount, 0, 'rgb(255,0,0)');
      drawTinted(ctx, snap, w, h, 3 * amount, 0, 'rgb(0,120,255)');
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.3 * amount;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
      ctx.restore();
      const tile = grainTile(seed);
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) {
        ctx.save();
        ctx.globalAlpha = 0.18 * amount;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
    }
  }
}

/** A brand-new detached canvas — safe for effect temporaries (no aliasing). */
function freshCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A copy of the current composited frame. */
function snapshot(ctx: CanvasRenderingContext2D, w: number, h: number): HTMLCanvasElement {
  const c = freshCanvas(w, h);
  c.getContext('2d')!.drawImage(ctx.canvas, 0, 0);
  return c;
}

function drawTinted(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  w: number,
  h: number,
  dx: number,
  dy: number,
  tint: string,
): void {
  const t = freshCanvas(w, h);
  const tc = t.getContext('2d')!;
  tc.drawImage(src, 0, 0);
  tc.globalCompositeOperation = 'multiply';
  tc.fillStyle = tint;
  tc.fillRect(0, 0, w, h);
  ctx.drawImage(t, dx, dy);
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
    case 'circle': {
      ctx.drawImage(a, 0, 0);
      ctx.save();
      ctx.beginPath();
      const r = Math.hypot(w, h) * 0.5 * prog;
      ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      ctx.restore();
      break;
    }
    case 'push': {
      const dir = String(params.direction ?? 'left');
      if (dir === 'left') {
        ctx.drawImage(a, -w * prog, 0);
        ctx.drawImage(b, w * (1 - prog), 0);
      } else if (dir === 'right') {
        ctx.drawImage(a, w * prog, 0);
        ctx.drawImage(b, -w * (1 - prog), 0);
      } else if (dir === 'up') {
        ctx.drawImage(a, 0, -h * prog);
        ctx.drawImage(b, 0, h * (1 - prog));
      } else {
        ctx.drawImage(a, 0, h * prog);
        ctx.drawImage(b, 0, -h * (1 - prog));
      }
      break;
    }
    case 'blur': {
      const k = Math.sin(prog * Math.PI) * 24;
      ctx.save();
      ctx.filter = `blur(${k.toFixed(1)}px)`;
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = prog;
      ctx.drawImage(b, 0, 0);
      ctx.restore();
      break;
    }
    case 'flash': {
      ctx.drawImage(prog < 0.5 ? a : b, 0, 0);
      ctx.save();
      ctx.globalAlpha = 1 - Math.abs(prog - 0.5) * 2;
      ctx.fillStyle = String(params.color ?? '#ffffff');
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    case 'pixelate': {
      const from = prog < 0.5 ? a : b;
      const k = 1 - Math.abs(prog - 0.5) * 2; // 0..1..0
      const block = Math.max(1, Math.round(2 + k * 60));
      const sw = Math.max(1, Math.round(w / block));
      const sh = Math.max(1, Math.round(h / block));
      const tmp = document.createElement('canvas');
      tmp.width = sw;
      tmp.height = sh;
      tmp.getContext('2d')!.drawImage(from, 0, 0, sw, sh);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, 0, 0, w, h);
      ctx.restore();
      if (prog > 0.5 && k < 0.05) ctx.drawImage(b, 0, 0);
      break;
    }
    case 'spin': {
      ctx.drawImage(a, 0, 0);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((1 - prog) * Math.PI * 0.5);
      const s = 0.4 + 0.6 * prog;
      ctx.scale(s, s);
      ctx.globalAlpha = prog;
      ctx.drawImage(b, -w / 2, -h / 2);
      ctx.restore();
      break;
    }
    case 'whip': {
      const slide = (1 - prog) * w;
      ctx.save();
      ctx.filter = `blur(${(Math.sin(prog * Math.PI) * 18).toFixed(1)}px)`;
      ctx.drawImage(a, -w * prog, 0);
      ctx.drawImage(b, w - slide, 0);
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

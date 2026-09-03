/**
 * Procedural frame synthesis. This is a real generator — it composes each
 * frame from the structured prompt (palette, motion, camera) with a seeded
 * PRNG — not a diffusion model and not a placeholder. It produces genuine,
 * deterministic output that the rest of the pipeline (queue → QC → timeline →
 * export) treats like any other generated clip. A diffusion backend replaces
 * this behind the same `VideoGenerationProvider` interface.
 */

export interface SynthParams {
  hues: number[];
  saturation: number;
  lightness: number;
  blobCount: number;
  motionSpeed: number;
  cameraDrift: { x: number; y: number; zoom: number; rotate: number };
  grain: number;
  vignette: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES: Array<[RegExp, number[]]> = [
  [/warm|golden|amber|sepia|firelight|sunset/i, [26, 12, 40, 350]],
  [/cool|blue|moonlight|night|indigo/i, [212, 232, 260, 190]],
  [/teal|cyan|emerald/i, [172, 190, 158]],
  [/magenta|crimson|neon|pink/i, [320, 340, 292]],
  [/pastel/i, [200, 330, 40, 160]],
  [/monochrome|desaturated|noir/i, [220]],
  [/vivid|vibrant/i, [10, 45, 200, 280]],
];

export function deriveParams(prompt: string, seed: number): SynthParams {
  const rnd = mulberry32(seed || 1);
  const p = prompt.toLowerCase();

  const hues = PALETTES.find(([re]) => re.test(p))?.[1] ?? [30, 210, 160];
  const mono = /monochrome|desaturated|noir|black ?and ?white/i.test(p);
  const analog = /analog|film grain|vhs|super ?8|vintage/i.test(p);

  const motionSpeed = /high motion/.test(p)
    ? 1.8
    : /low motion/.test(p)
      ? 0.45
      : 1;

  const cam = { x: 0, y: 0, zoom: 0, rotate: 0 };
  if (/dolly in/.test(p)) cam.zoom = 0.18;
  else if (/dolly out/.test(p)) cam.zoom = -0.14;
  if (/pan left/.test(p)) cam.x = -0.12;
  else if (/pan right/.test(p)) cam.x = 0.12;
  if (/tilt up/.test(p)) cam.y = -0.1;
  else if (/tilt down/.test(p)) cam.y = 0.1;
  if (/orbit/.test(p)) {
    cam.rotate = 0.08;
    cam.zoom = 0.1;
  }
  if (/crane/.test(p)) cam.y = -0.16;
  if (/handheld/.test(p)) {
    cam.x = (rnd() - 0.5) * 0.05;
    cam.y = (rnd() - 0.5) * 0.05;
  }

  return {
    hues,
    saturation: mono ? 0.05 : 0.55 + rnd() * 0.2,
    lightness: 0.5 + rnd() * 0.1,
    blobCount: 3 + Math.floor(rnd() * 3),
    motionSpeed,
    cameraDrift: cam,
    grain: analog ? 0.4 : 0.12,
    vignette: analog ? 0.5 : 0.3,
    seed: seed || 1,
  };
}

function applyCamera(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  cam: SynthParams['cameraDrift'],
): void {
  ctx.translate(w / 2, h / 2);
  ctx.scale(1 + cam.zoom * t, 1 + cam.zoom * t);
  ctx.rotate(cam.rotate * t);
  ctx.translate(-w / 2 + cam.x * w * t, -h / 2 + cam.y * h * t);
}

/** Text→Video frame: drifting palette gradient field + grain + vignette. */
export function renderT2VFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t01: number,
  params: SynthParams,
): void {
  const rnd = mulberry32(params.seed);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `hsl(${params.hues[0]}, ${params.saturation * 30}%, 8%)`;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  applyCamera(ctx, w, h, t01, params.cameraDrift);

  const tt = t01 * Math.PI * 2 * params.motionSpeed;
  for (let i = 0; i < params.blobCount; i++) {
    const hue = params.hues[i % params.hues.length]! + (rnd() - 0.5) * 24;
    const phase = rnd() * Math.PI * 2;
    const rad = (0.25 + rnd() * 0.35) * Math.min(w, h);
    const cx = w * (0.5 + 0.35 * Math.sin(tt * (0.3 + rnd() * 0.4) + phase));
    const cy = h * (0.5 + 0.35 * Math.cos(tt * (0.25 + rnd() * 0.4) + phase * 1.7));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `hsla(${hue}, ${params.saturation * 100}%, ${params.lightness * 100}%, 0.9)`);
    g.addColorStop(1, `hsla(${hue}, ${params.saturation * 100}%, ${params.lightness * 60}%, 0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h, w * 3, h * 3);
  }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  drawGrainAndVignette(ctx, w, h, t01, params);
}

/** Image→Video frame: animate a still with Ken-Burns + light drift (spec §22, §73). */
export function renderKenBurnsFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t01: number,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  params: SynthParams,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const zoom = 1.06 + (params.cameraDrift.zoom || 0.12) * t01;
  const scale = Math.max(w / imgW, h / imgH) * zoom;
  const dw = imgW * scale;
  const dh = imgH * scale;
  const panX = (params.cameraDrift.x || 0.04) * w * t01;
  const panY = (params.cameraDrift.y || 0.03) * h * t01;

  ctx.save();
  ctx.translate(w / 2 + panX, h / 2 + panY);
  ctx.rotate((params.cameraDrift.rotate || 0) * t01 * 0.4);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  // Gentle light sweep.
  const lx = w * (t01 * 1.4 - 0.2);
  const sweep = ctx.createLinearGradient(lx - w * 0.3, 0, lx + w * 0.3, 0);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, `rgba(255,255,255,${0.05 * params.motionSpeed})`);
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);

  drawGrainAndVignette(ctx, w, h, t01, params);
}

function drawGrainAndVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t01: number,
  params: SynthParams,
): void {
  if (params.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${params.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (params.grain > 0) {
    const tile = grainTile(params.seed + Math.floor(t01 * 24));
    ctx.save();
    ctx.globalAlpha = params.grain * 0.5;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
}

let grainCanvas: HTMLCanvasElement | null = null;
let grainKey = -1;
function grainTile(key: number): HTMLCanvasElement {
  if (grainCanvas && grainKey === key) return grainCanvas;
  const size = 128;
  const c = grainCanvas ?? document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const rnd = mulberry32((key || 1) >>> 0);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.floor(rnd() * 100);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  grainKey = key;
  return c;
}

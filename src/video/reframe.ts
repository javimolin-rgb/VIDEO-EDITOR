/**
 * Auto-reframe (spec §83). Converts a clip from one aspect ratio to another by
 * tracking the salient region (edge-energy centroid, temporally smoothed) and
 * animating a crop that keeps it in frame. Local, no model. A face model can
 * later replace the saliency estimate behind `salientCenter`.
 */

import { encodeCanvasSequence, type EncodeResult } from './encode';

const GRID_W = 48;
const GRID_H = 27;

/** Edge-energy weighted centroid of a downscaled frame, in 0..1 coords. */
export function salientCenter(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const lumaAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = Math.abs(lumaAt(x + 1, y) - lumaAt(x - 1, y));
      const gy = Math.abs(lumaAt(x, y + 1) - lumaAt(x, y - 1));
      const e = gx + gy;
      sx += x * e;
      sy += y * e;
      sw += e;
    }
  }
  if (sw < 1) return { x: 0.5, y: 0.5 };
  return { x: sx / sw / (w - 1), y: sy / sw / (h - 1) };
}

export interface ReframeOptions {
  srcWidth: number;
  srcHeight: number;
  dstWidth: number;
  dstHeight: number;
  fps: number;
  totalFrames: number;
  quality: number;
  /** Draw source frame `i` onto the given ctx (full src resolution). */
  drawSource: (ctx: CanvasRenderingContext2D, frame: number) => void | Promise<void>;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
  /** 0..1 — how tightly the crop follows the subject (higher = snappier). */
  tracking?: number;
}

export async function autoReframe(opts: ReframeOptions): Promise<EncodeResult> {
  const analysis = document.createElement('canvas');
  analysis.width = GRID_W;
  analysis.height = GRID_H;
  const actx = analysis.getContext('2d', { willReadFrequently: true })!;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = opts.srcWidth;
  srcCanvas.height = opts.srcHeight;
  const sctx = srcCanvas.getContext('2d', { alpha: false })!;

  const dstAR = opts.dstWidth / opts.dstHeight;
  const srcAR = opts.srcWidth / opts.srcHeight;
  // Crop rectangle size in source pixels (largest dst-AR rect that fits).
  const cropW = dstAR > srcAR ? opts.srcWidth : opts.srcHeight * dstAR;
  const cropH = dstAR > srcAR ? opts.srcWidth / dstAR : opts.srcHeight;

  const follow = 0.06 + (opts.tracking ?? 0.4) * 0.22;
  let cx = 0.5;
  let cy = 0.5;

  return encodeCanvasSequence({
    width: opts.dstWidth,
    height: opts.dstHeight,
    fps: opts.fps,
    totalFrames: opts.totalFrames,
    quality: opts.quality,
    signal: opts.signal,
    onProgress: opts.onProgress,
    drawFrame: async (ctx, frame) => {
      await opts.drawSource(sctx, frame);
      actx.drawImage(srcCanvas, 0, 0, GRID_W, GRID_H);
      const c = salientCenter(actx.getImageData(0, 0, GRID_W, GRID_H).data, GRID_W, GRID_H);
      cx += (c.x - cx) * follow;
      cy += (c.y - cy) * follow;

      // Clamp crop centre so the rect stays inside the source.
      const halfW = cropW / 2 / opts.srcWidth;
      const halfH = cropH / 2 / opts.srcHeight;
      const px = Math.min(1 - halfW, Math.max(halfW, cx)) * opts.srcWidth;
      const py = Math.min(1 - halfH, Math.max(halfH, cy)) * opts.srcHeight;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, opts.dstWidth, opts.dstHeight);
      ctx.drawImage(
        srcCanvas,
        px - cropW / 2,
        py - cropH / 2,
        cropW,
        cropH,
        0,
        0,
        opts.dstWidth,
        opts.dstHeight,
      );
    },
  });
}

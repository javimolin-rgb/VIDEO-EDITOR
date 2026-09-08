/**
 * Pollinations image backend (opt-in, keyless, free). It is NOT a video
 * diffusion model: it renders one photographic still from the prompt and this
 * adapter animates it with a camera move, then encodes a real clip. That gets
 * the user a recognisable scene instead of the procedural generator's abstract
 * motion, with zero setup. For an actual generated video (construction
 * sequences, motion that isn't a pan) connect ComfyUI or fal.ai.
 *
 * Network: sends the prompt to image.pollinations.ai. Disabled → capabilities
 * are all false and the procedural generator handles the task offline.
 */

import { createLogger } from '@/lib/logger';
import { encodeCanvasSequence } from '@/video/encode';
import { deriveParams, renderKenBurnsFrame, renderT2VFrame } from '@/ai/providers/procedural/synth';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  ProviderCapabilities,
  VideoGenerationProvider,
} from '@/ai/provider';
import { NO_CAPABILITIES } from '@/ai/provider';
import { getAssetBlob } from '@/storage/repository';
import { loadHostedConfig, pollinationsUsable, type PollinationsConfig } from './config';
import { buildImagePrompt, pollinationsUrl } from './imagePrompt';

const log = createLogger('ai');

async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function fetchPollinationsBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  // Preferred: fetch → blob → bitmap (Pollinations sends CORS headers).
  try {
    const res = await fetch(url, { signal, mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 0 && blob.type.startsWith('image/')) return loadBitmap(blob);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  // Fallback: crossorigin <img>.
  return new Promise<ImageBitmap>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      createImageBitmap(img).then(resolve, reject);
    };
    img.onerror = () => reject(new Error('Pollinations image request failed (network or CORS).'));
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    img.src = url;
  });
}

export class PollinationsProvider implements VideoGenerationProvider {
  readonly id = 'pollinations';
  readonly name = 'Pollinations image + motion (free)';

  private cfg(): PollinationsConfig {
    return loadHostedConfig().pollinations;
  }

  get capabilities(): ProviderCapabilities {
    if (!pollinationsUsable(this.cfg())) return NO_CAPABILITIES;
    return {
      ...NO_CAPABILITIES,
      textToVideo: true,
      imageToVideo: true,
      maxDurationSec: 12,
      supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '21:9'],
      deterministicWithSeed: true,
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    if (!this.cfg().enabled) return { ok: false, detail: 'Pollinations backend is disabled.' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return { ok: false, detail: 'Offline — the procedural generator will be used instead.' };
    return { ok: true, detail: 'Pollinations reachable (keyless, free).' };
  }

  async generateTextToVideo(req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult> {
    return this.run(req, ctx, null);
  }

  async generateImageToVideo(
    req: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult> {
    let base: ImageBitmap | null = null;
    try {
      let blob: Blob | null = null;
      if (req.firstFrameDataUrl) blob = await fetch(req.firstFrameDataUrl).then((r) => r.blob());
      else if (req.firstFrameAssetId) blob = await getAssetBlob(req.firstFrameAssetId);
      if (blob) base = await loadBitmap(blob);
    } catch {
      base = null;
    }
    return this.run(req, ctx, base);
  }

  private async run(
    req: GenerationRequestBase,
    ctx: GenerationContext,
    providedFrame: ImageBitmap | null,
  ): Promise<GenerationResult> {
    const cfg = this.cfg();
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = deriveParams(req.prompt, seed);
    const { width, height } = req.resolution;
    const referrer = typeof location !== 'undefined' ? location.hostname || undefined : undefined;

    let bmp = providedFrame;
    let usedFallback = false;
    if (!bmp) {
      const imgPrompt = buildImagePrompt(req);
      const url = pollinationsUrl(imgPrompt, { width, height, seed, model: cfg.model, referrer });
      ctx.onPhase('generating', 0.05, 'Rendering the frame with Pollinations…');
      log.info('pollinations request', { model: cfg.model, promptLen: imgPrompt.length });
      try {
        bmp = await fetchPollinationsBitmap(url, ctx.signal);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        // Pollinations blocked / offline — don't fail the job, fall back to the
        // procedural synth so the user still gets a clip.
        log.warn('pollinations unavailable, falling back to procedural', {
          error: String((e as Error).message ?? e),
        });
        usedFallback = true;
      }
    }

    const fps = req.fps;
    const totalFrames = Math.max(1, Math.round(req.durationSec * fps));
    ctx.onPhase('generating', 0.45, `Animating ${totalFrames} frames…`);

    const result = await encodeCanvasSequence({
      width,
      height,
      fps,
      totalFrames,
      quality: Number(req.advanced?.quality ?? 0.7),
      signal: ctx.signal,
      drawFrame: (c, frame) => {
        const t01 = totalFrames <= 1 ? 0 : frame / (totalFrames - 1);
        if (bmp) renderKenBurnsFrame(c, width, height, t01, bmp, bmp.width, bmp.height, params);
        else renderT2VFrame(c, width, height, t01, params);
      },
      onProgress: (f) =>
        ctx.onPhase('generating', 0.45 + f * 0.5, `Frame ${Math.round(f * totalFrames)} / ${totalFrames}`),
    });

    ctx.onPhase('post-processing', 0.98, 'Finalising clip…');
    log.info('pollinations generation done', { bytes: result.blob.size, seed, usedFallback });

    return {
      jobId: ctx.jobId,
      output: { blob: result.blob, mimeType: result.mimeType, durationSec: result.durationSec },
      modelId: usedFallback ? 'procedural-synth' : `pollinations-${cfg.model}`,
      modelVersion: '1',
      seed,
    };
  }

  async getJobStatus(jobId: string) {
    return { jobId, phase: 'ready' as const, progress: 1, message: 'ready', etaSeconds: null };
  }

  async cancelJob(): Promise<void> {
    /* driven by the AbortSignal in GenerationContext */
  }
}

export const pollinationsProvider = new PollinationsProvider();

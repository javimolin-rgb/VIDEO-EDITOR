/**
 * Pollinations image backend (keyless, free). It renders one photographic
 * still from the prompt and this adapter animates it with a camera move, then
 * encodes a real clip — so the user gets the described scene instead of the
 * procedural generator's abstract motion, with zero setup.
 *
 * It is NOT a video-diffusion model: motion is a pan/zoom, not a generated
 * sequence. For that, connect ComfyUI or fal.ai (LTX-2).
 *
 * Network: GET image.pollinations.ai. The free tier rate-limits to roughly one
 * request every few seconds, so requests are spaced out and 429s are retried
 * with backoff. If it still can't fetch an image the job FAILS with a clear
 * message rather than silently producing coloured shapes.
 */

import { createLogger } from '@/lib/logger';
import { encodeCanvasSequence } from '@/video/encode';
import { deriveParams, renderKenBurnsFrame } from '@/ai/providers/procedural/synth';
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

/** Free tier is ~1 req / 5 s. Serialise + space requests across all jobs. */
const MIN_SPACING_MS = 5500;
let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

function abortable(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

async function fetchImage(url: string, signal: AbortSignal, note: (s: string) => void): Promise<Blob> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastRequestAt + MIN_SPACING_MS - Date.now();
    if (wait > 0) {
      note(`Waiting for the free tier… ${Math.ceil(wait / 1000)}s`);
      await abortable(signal, wait);
    }
    lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { signal, mode: 'cors', referrerPolicy: 'no-referrer-when-downgrade' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (attempt === 3) throw new Error('Pollinations could not be reached (network/CORS).');
      await abortable(signal, 3000);
      continue;
    }
    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 512 && blob.type.startsWith('image/')) return blob;
      if (attempt === 3) throw new Error('Pollinations returned an unusable response.');
    } else if (res.status === 429 || res.status === 503 || res.status === 502) {
      const backoff = 6000 * (attempt + 1);
      note(`Pollinations is busy (${res.status}); retrying in ${backoff / 1000}s…`);
      await abortable(signal, backoff);
      continue;
    } else if (res.status === 403) {
      throw new Error(
        'Pollinations refused the request (403). Its free tier can block some domains — ' +
          'connect fal.ai (LTX-2) or ComfyUI for reliable generation.',
      );
    } else {
      throw new Error(`Pollinations error ${res.status}.`);
    }
  }
  throw new Error('Pollinations kept rate-limiting. Wait ~30 s and try again, or use fal.ai / ComfyUI.');
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
      return { ok: false, detail: 'Offline — connect ComfyUI or fal.ai, or use the procedural generator.' };
    return { ok: true, detail: 'Pollinations reachable (keyless, free, rate-limited).' };
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
      if (blob) base = await createImageBitmap(blob);
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
    if (!bmp) {
      const imgPrompt = buildImagePrompt(req);
      const url = pollinationsUrl(imgPrompt, { width, height, seed, model: cfg.model, referrer });
      ctx.onPhase('generating', 0.05, 'Generating the image with Pollinations…');
      log.info('pollinations request', { model: cfg.model, promptLen: imgPrompt.length });

      // Serialise every Pollinations call so a storyboard doesn't 429 itself.
      const mine = chain.then(() =>
        fetchImage(url, ctx.signal, (s) => ctx.onPhase('generating', 0.1, s)),
      );
      chain = mine.catch(() => undefined);
      const blob = await mine;
      bmp = await createImageBitmap(blob);
    }

    const fps = req.fps;
    const totalFrames = Math.max(1, Math.round(req.durationSec * fps));
    ctx.onPhase('generating', 0.55, `Animating ${totalFrames} frames…`);

    const result = await encodeCanvasSequence({
      width,
      height,
      fps,
      totalFrames,
      quality: Number(req.advanced?.quality ?? 0.75),
      signal: ctx.signal,
      drawFrame: (c, frame) => {
        const t01 = totalFrames <= 1 ? 0 : frame / (totalFrames - 1);
        renderKenBurnsFrame(c, width, height, t01, bmp!, bmp!.width, bmp!.height, params);
      },
      onProgress: (f) =>
        ctx.onPhase('generating', 0.55 + f * 0.4, `Frame ${Math.round(f * totalFrames)} / ${totalFrames}`),
    });

    ctx.onPhase('post-processing', 0.98, 'Finalising clip…');
    log.info('pollinations generation done', { bytes: result.blob.size, seed });

    return {
      jobId: ctx.jobId,
      output: { blob: result.blob, mimeType: result.mimeType, durationSec: req.durationSec },
      modelId: `pollinations-${cfg.model}`,
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

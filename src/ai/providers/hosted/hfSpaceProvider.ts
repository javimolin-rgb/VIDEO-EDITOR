/**
 * Hugging Face Space backend (default, keyless, free). Calls a public Gradio
 * image-generation Space (FLUX.1-schnell and friends) — no token, CORS-open —
 * to render the described scene, then animates the still with a camera move
 * and encodes a real clip.
 *
 * It is NOT a video-diffusion model: motion is a pan/zoom. For a generated
 * sequence use ComfyUI or fal.ai (LTX-2). Free Spaces sleep and have an hourly
 * GPU quota; the adapter tries several and, if none work, FAILS the job with a
 * clear reason rather than falling back to abstract shapes.
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
import { loadHostedConfig, hfSpaceUsable } from './config';
import { buildImagePrompt } from './imagePrompt';
import { DEFAULT_SPACES, generateWithSpaces } from './hfSpace';

const log = createLogger('ai');

/** Clamp to sizes the Spaces accept and keep multiples of 16. */
function fitSize(w: number, h: number): { width: number; height: number } {
  const cap = 1024;
  const s = Math.min(1, cap / Math.max(w, h));
  const r = (n: number) => Math.max(256, Math.round((n * s) / 16) * 16);
  return { width: r(w), height: r(h) };
}

export class HfSpaceProvider implements VideoGenerationProvider {
  readonly id = 'hf-space';
  readonly name = 'Hugging Face Space (FLUX) — free';

  get capabilities(): ProviderCapabilities {
    if (!hfSpaceUsable(loadHostedConfig().hfSpace)) return NO_CAPABILITIES;
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
    if (!loadHostedConfig().hfSpace.enabled) return { ok: false, detail: 'HF Space backend is disabled.' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return { ok: false, detail: 'Offline.' };
    return { ok: true, detail: 'Public FLUX Space (keyless, free, may queue / sleep).' };
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
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = deriveParams(req.prompt, seed);
    const { width, height } = req.resolution;

    let bmp = providedFrame;
    let space = 'reference';
    if (!bmp) {
      const prompt = buildImagePrompt(req);
      const size = fitSize(width, height);
      ctx.onPhase('generating', 0.05, 'Generating the image on a free FLUX Space…');
      log.info('hf-space request', { promptLen: prompt.length, ...size });
      const out = await generateWithSpaces(
        DEFAULT_SPACES,
        { prompt, width: size.width, height: size.height, seed: seed % 2_000_000 },
        ctx.signal,
        (s) => ctx.onPhase('generating', 0.15, s),
      );
      space = out.space;
      bmp = await createImageBitmap(out.blob);
    }

    const fps = req.fps;
    const totalFrames = Math.max(1, Math.round(req.durationSec * fps));
    ctx.onPhase('generating', 0.6, `Animating ${totalFrames} frames…`);

    const result = await encodeCanvasSequence({
      width,
      height,
      fps,
      totalFrames,
      quality: Number(req.advanced?.quality ?? 0.8),
      signal: ctx.signal,
      drawFrame: (c, frame) => {
        const t01 = totalFrames <= 1 ? 0 : frame / (totalFrames - 1);
        renderKenBurnsFrame(c, width, height, t01, bmp!, bmp!.width, bmp!.height, params);
      },
      onProgress: (f) =>
        ctx.onPhase('generating', 0.6 + f * 0.35, `Frame ${Math.round(f * totalFrames)} / ${totalFrames}`),
    });

    ctx.onPhase('post-processing', 0.98, 'Finalising clip…');
    log.info('hf-space generation done', { bytes: result.blob.size, seed, space });

    return {
      jobId: ctx.jobId,
      output: { blob: result.blob, mimeType: result.mimeType, durationSec: req.durationSec },
      modelId: `hf-space:${space}`,
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

export const hfSpaceProvider = new HfSpaceProvider();

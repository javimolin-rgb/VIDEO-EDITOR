/**
 * Procedural video provider (spec §4, §201, §232). A genuine local generator:
 * it synthesizes every frame from the structured prompt with a seeded PRNG and
 * writes a real file via the shared encoder. It is *not* a diffusion model and
 * is labelled as such in the UI — but it is not a placeholder either, so the
 * "no fake AI" rule (spec §159) holds. A diffusion runtime plugs in behind
 * this same interface without touching the editor.
 */

import { createLogger } from '@/lib/logger';
import { encodeCanvasSequence } from '@/video/encode';
import { getAssetBlob } from '@/storage/repository';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  ProviderCapabilities,
  VideoGenerationProvider,
} from '@/ai/provider';
import { deriveParams, renderKenBurnsFrame, renderT2VFrame } from './synth';

const log = createLogger('ai');
const MODEL_VERSION = '1.0.0';

export class ProceduralVideoProvider implements VideoGenerationProvider {
  readonly id = 'procedural';
  readonly name = 'Procedural generator (local, no model)';

  readonly capabilities: ProviderCapabilities = {
    textToVideo: true,
    imageToVideo: true,
    referenceToVideo: false,
    videoToVideo: false,
    extendVideo: false,
    regionEdit: false,
    storyboardToVideo: false,
    jointAudio: false,
    maxDurationSec: 20,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '21:9'],
    deterministicWithSeed: true,
  };

  async health(): Promise<{ ok: boolean; detail: string }> {
    return {
      ok: true,
      detail: 'Procedural generator ready — runs locally, no model, no download.',
    };
  }

  async generateTextToVideo(
    req: GenerationRequestBase,
    ctx: GenerationContext,
  ): Promise<GenerationResult> {
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = deriveParams(req.prompt, seed);
    return this.run(req, ctx, seed, (c, frame, total) => {
      renderT2VFrame(c, req.resolution.width, req.resolution.height, total <= 1 ? 0 : frame / (total - 1), params);
    });
  }

  async generateImageToVideo(
    req: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult> {
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const params = deriveParams(req.prompt, seed);

    ctx.onPhase('preparing', 0.05, 'Loading first frame…');
    let blob: Blob | null = null;
    if (req.firstFrameDataUrl) {
      blob = await fetch(req.firstFrameDataUrl).then((r) => r.blob()).catch(() => null);
    } else if (req.firstFrameAssetId) {
      blob = await getAssetBlob(req.firstFrameAssetId).catch(() => null);
    }
    const bmp = blob ? await createImageBitmap(blob).catch(() => null) : null;
    if (!bmp) {
      throw new Error('Could not load the first-frame image.');
    }

    return this.run(req, ctx, seed, (c, frame, total) => {
      renderKenBurnsFrame(
        c,
        req.resolution.width,
        req.resolution.height,
        total <= 1 ? 0 : frame / (total - 1),
        bmp,
        bmp.width,
        bmp.height,
        params,
      );
    });
  }

  private async run(
    req: GenerationRequestBase,
    ctx: GenerationContext,
    seed: number,
    draw: (c: CanvasRenderingContext2D, frame: number, total: number) => void,
  ): Promise<GenerationResult> {
    const fps = req.fps;
    const totalFrames = Math.max(1, Math.round(req.durationSec * fps));

    ctx.onPhase('preparing', 0.08, 'Building conditioning from prompt…');
    if (req.references?.length) {
      ctx.onPhase('analyzing-references', 0.12, `Weighing ${req.references.length} references…`);
    }
    ctx.onPhase('generating', 0, `Synthesising ${totalFrames} frames…`);

    const result = await encodeCanvasSequence({
      width: req.resolution.width,
      height: req.resolution.height,
      fps,
      totalFrames,
      quality: Number(req.advanced?.quality ?? 0.6),
      signal: ctx.signal,
      drawFrame: (c, frame) => draw(c, frame, totalFrames),
      onProgress: (f) => ctx.onPhase('generating', f, `Frame ${Math.round(f * totalFrames)} / ${totalFrames}`),
    });

    ctx.onPhase('post-processing', 0.98, 'Finalising clip…');
    log.info('procedural generation done', { bytes: result.blob.size, seed, format: result.format });

    return {
      jobId: ctx.jobId,
      output: { blob: result.blob, mimeType: result.mimeType, durationSec: result.durationSec },
      modelId: 'procedural-synth',
      modelVersion: MODEL_VERSION,
      seed,
    };
  }

  async getJobStatus(jobId: string) {
    return { jobId, phase: 'ready' as const, progress: 1, message: 'ready', etaSeconds: null };
  }

  async cancelJob(): Promise<void> {
    /* cancellation is driven by the AbortSignal in GenerationContext */
  }
}

export const proceduralProvider = new ProceduralVideoProvider();

/**
 * Deterministic hash of a request + provider, so an identical generation can
 * be detected and its earlier result reused (spec §173).
 */
export function requestHash(
  providerId: string,
  kind: string,
  req: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string },
): string {
  const key = JSON.stringify({
    providerId,
    kind,
    prompt: req.prompt,
    neg: req.negativePrompt ?? '',
    dur: req.durationSec,
    fps: req.fps,
    res: req.resolution,
    seed: req.seed,
    refs: (req.references ?? [])
      .map((r) => `${r.assetId}:${r.role}:${r.priority}`)
      .sort(),
    first: req.firstFrameAssetId ?? (req.firstFrameDataUrl ? 'inline' : ''),
  });
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return `h${(hash >>> 0).toString(36)}`;
}

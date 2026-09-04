/**
 * ComfyUI provider (spec §4, §201, §235, §237). A real generative backend:
 * it drives a local ComfyUI server with the user's own API-format workflow.
 * The app owns the request (prompt / size / seed / references); ComfyUI is an
 * implementation detail. Capabilities are gated on the server being reachable
 * and a workflow being configured — otherwise all false, like every optional
 * adapter (spec §94, §159).
 */

import { createLogger } from '@/lib/logger';
import { secondsToFrames } from '@/lib/time';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  ProviderCapabilities,
  VideoGenerationProvider,
} from '@/ai/provider';
import { NO_CAPABILITIES } from '@/ai/provider';
import { getAssetBlob } from '@/storage/repository';
import { applyMap, loadComfyConfig, type ComfyConfig } from './config';
import { comfyHealth, downloadOutput, queuePrompt, uploadImage } from './client';

const log = createLogger('ai');

export class ComfyUIProvider implements VideoGenerationProvider {
  readonly id = 'comfyui';
  readonly name = 'ComfyUI (local server)';

  private cfg(): ComfyConfig {
    return loadComfyConfig();
  }

  get capabilities(): ProviderCapabilities {
    const c = this.cfg();
    if (!c.enabled) return NO_CAPABILITIES;
    return {
      ...NO_CAPABILITIES,
      textToVideo: !!c.t2vWorkflow,
      imageToVideo: !!c.i2vWorkflow,
      referenceToVideo: false,
      maxDurationSec: 20,
      supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '21:9'],
      deterministicWithSeed: true,
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    const c = this.cfg();
    if (!c.enabled) return { ok: false, detail: 'ComfyUI adapter is disabled.' };
    const h = await comfyHealth(c.serverUrl);
    if (h.ok && !c.t2vWorkflow && !c.i2vWorkflow) {
      return { ok: false, detail: `${h.detail} — but no workflow is configured yet.` };
    }
    return { ok: h.ok, detail: h.detail };
  }

  async generateTextToVideo(req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult> {
    const c = this.cfg();
    if (!c.t2vWorkflow) throw new Error('No Text→Video workflow configured for ComfyUI.');
    return this.run(c, c.t2vWorkflow, c.t2vMap, req, ctx, null);
  }

  async generateImageToVideo(
    req: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult> {
    const c = this.cfg();
    if (!c.i2vWorkflow) throw new Error('No Image→Video workflow configured for ComfyUI.');

    ctx.onPhase('preparing', 0.04, 'Uploading first frame to ComfyUI…');
    let blob: Blob | null = null;
    if (req.firstFrameDataUrl) blob = await fetch(req.firstFrameDataUrl).then((r) => r.blob());
    else if (req.firstFrameAssetId) blob = await getAssetBlob(req.firstFrameAssetId);
    if (!blob) throw new Error('Could not read the first-frame image.');
    const uploadedName = await uploadImage(c.serverUrl, blob, `aiv-first-${ctx.jobId}.png`);

    return this.run(c, c.i2vWorkflow, c.i2vMap, req, ctx, uploadedName);
  }

  private async run(
    c: ComfyConfig,
    workflow: ComfyConfig['t2vWorkflow'],
    map: ComfyConfig['t2vMap'],
    req: GenerationRequestBase,
    ctx: GenerationContext,
    imageName: string | null,
  ): Promise<GenerationResult> {
    if (!workflow) throw new Error('No workflow.');
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);
    const frames = Math.max(1, secondsToFrames(req.durationSec, { fps: req.fps, dropFrame: false }));

    const graph = applyMap(workflow, map, {
      positive: req.prompt,
      negative: req.negativePrompt ?? '',
      width: req.resolution.width,
      height: req.resolution.height,
      length: frames,
      fps: req.fps,
      seed,
      steps: Number(req.advanced?.steps ?? c.steps),
      cfg: Number(req.advanced?.cfg ?? c.cfg),
      ...(imageName ? { image: imageName } : {}),
    });

    ctx.onPhase('loading-model', 0.08, 'Queued on ComfyUI…');
    const files = await queuePrompt(
      c.serverUrl,
      graph,
      (fraction, message) => ctx.onPhase('generating', fraction, message),
      ctx.signal,
    );

    ctx.onPhase('post-processing', 0.95, 'Downloading result…');
    // Prefer a real video container; else a webp/gif animation.
    const pick = files.find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f.filename)) ?? files[0]!;
    const blob = await downloadOutput(c.serverUrl, pick);
    const mimeType = pick.filename.toLowerCase().endsWith('.mp4')
      ? 'video/mp4'
      : pick.filename.toLowerCase().endsWith('.webm')
        ? 'video/webm'
        : blob.type || 'application/octet-stream';

    log.info('comfy generation done', { bytes: blob.size, file: pick.filename, seed });
    return {
      jobId: ctx.jobId,
      output: { blob, mimeType, durationSec: req.durationSec },
      modelId: 'comfyui-workflow',
      modelVersion: '1',
      seed,
    };
  }

  async getJobStatus(jobId: string) {
    return { jobId, phase: 'ready' as const, progress: 1, message: 'ready', etaSeconds: null };
  }

  async cancelJob(): Promise<void> {
    /* handled via the AbortSignal in GenerationContext */
  }
}

export const comfyUIProvider = new ComfyUIProvider();

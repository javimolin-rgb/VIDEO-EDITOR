/**
 * fal.ai video backend (opt-in, user's own API key). This is a real
 * image/text-to-video diffusion model — the path for an actual generated
 * sequence (e.g. the house animating), not a pan over a still. Billed by fal.
 * The key lives in localStorage and is sent only to *.fal.run.
 */

import { createLogger } from '@/lib/logger';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  ProviderCapabilities,
  VideoGenerationProvider,
} from '@/ai/provider';
import { NO_CAPABILITIES } from '@/ai/provider';
import { getAssetBlob } from '@/storage/repository';
import { loadHostedConfig, falUsable, type FalConfig } from './config';
import { buildImagePrompt } from './imagePrompt';

const log = createLogger('ai');

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsDataURL(blob);
  });
}

interface FalQueued {
  request_id: string;
  status_url: string;
  response_url: string;
}

export class FalProvider implements VideoGenerationProvider {
  readonly id = 'fal';
  readonly name = 'fal.ai video (your key)';

  private cfg(): FalConfig {
    return loadHostedConfig().fal;
  }

  get capabilities(): ProviderCapabilities {
    if (!falUsable(this.cfg())) return NO_CAPABILITIES;
    const isI2V = /image-to-video|\/i2v|image_to_video/.test(this.cfg().model);
    return {
      ...NO_CAPABILITIES,
      textToVideo: !isI2V,
      imageToVideo: true,
      maxDurationSec: 12,
      supportedAspectRatios: ['16:9', '9:16', '1:1', '4:5', '21:9'],
      deterministicWithSeed: true,
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    const c = this.cfg();
    if (!c.enabled) return { ok: false, detail: 'fal.ai backend is disabled.' };
    if (!c.apiKey.trim()) return { ok: false, detail: 'No fal.ai API key set.' };
    return { ok: true, detail: `fal.ai ready — model ${c.model}` };
  }

  async generateTextToVideo(req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult> {
    return this.run(req, ctx, undefined);
  }

  async generateImageToVideo(
    req: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult> {
    ctx.onPhase('preparing', 0.04, 'Encoding the reference frame…');
    let dataUrl = req.firstFrameDataUrl;
    if (!dataUrl && req.firstFrameAssetId) {
      const blob = await getAssetBlob(req.firstFrameAssetId);
      if (blob) dataUrl = await blobToDataUrl(blob);
    }
    if (!dataUrl) throw new Error('Image → Video on fal.ai needs a first-frame image.');
    return this.run(req, ctx, dataUrl);
  }

  private async run(
    req: GenerationRequestBase,
    ctx: GenerationContext,
    imageDataUrl: string | undefined,
  ): Promise<GenerationResult> {
    const c = this.cfg();
    const base = `https://queue.fal.run/${c.model.replace(/^\/+|\/+$/g, '')}`;
    const headers = {
      Authorization: `Key ${c.apiKey.trim()}`,
      'Content-Type': 'application/json',
    };
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31);

    const body: Record<string, unknown> = {
      prompt: buildImagePrompt(req),
      seed,
      aspect_ratio: req.aspectRatio,
      resolution: `${req.resolution.height}p`,
      num_frames: Math.min(160, Math.max(1, Math.round(req.durationSec * req.fps))),
    };
    if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
    if (imageDataUrl) body.image_url = imageDataUrl;

    ctx.onPhase('loading-model', 0.08, 'Queued on fal.ai…');
    const queued = (await fetchJson(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctx.signal,
    })) as FalQueued;

    // Poll the queue.
    let waited = 0;
    for (;;) {
      if (ctx.signal.aborted) {
        void fetch(`${queued.status_url}/cancel`, { method: 'PUT', headers }).catch(() => undefined);
        throw new DOMException('aborted', 'AbortError');
      }
      const st = (await fetchJson(queued.status_url, { headers, signal: ctx.signal })) as {
        status: string;
        queue_position?: number;
        logs?: { message: string }[];
      };
      if (st.status === 'COMPLETED') break;
      if (st.status === 'IN_PROGRESS') {
        const last = st.logs?.[st.logs.length - 1]?.message ?? 'Generating…';
        ctx.onPhase('generating', Math.min(0.9, waited / 90), last);
      } else {
        ctx.onPhase('loading-model', null, `Queue position ${st.queue_position ?? '?'}…`);
      }
      await sleep(2500, ctx.signal);
      waited += 2.5;
      if (waited > 600) throw new Error('fal.ai timed out after 10 minutes.');
    }

    ctx.onPhase('post-processing', 0.94, 'Downloading result…');
    const result = (await fetchJson(queued.response_url, { headers, signal: ctx.signal })) as {
      video?: { url: string };
      videos?: { url: string }[];
    };
    const videoUrl = result.video?.url ?? result.videos?.[0]?.url;
    if (!videoUrl) throw new Error('fal.ai returned no video URL.');
    const blob = await fetch(videoUrl, { signal: ctx.signal }).then((r) => r.blob());

    log.info('fal generation done', { bytes: blob.size, seed, model: c.model });
    return {
      jobId: ctx.jobId,
      output: { blob, mimeType: blob.type || 'video/mp4', durationSec: req.durationSec },
      modelId: c.model,
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

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`fal.ai ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

export const falProvider = new FalProvider();

/**
 * Optional hosted-generation settings (spec §94 — opt-in, disabled-by-default
 * external services never sit in the core path). Two independent backends:
 *
 *  - Pollinations: keyless, free image model. We turn its still into a short
 *    clip with a camera move. Not a video-diffusion model, but it produces a
 *    real photographic frame instead of the procedural generator's abstract
 *    motion. Sends the prompt to image.pollinations.ai.
 *  - fal.ai: real image/text-to-video diffusion (LTX, Kling, Wan…). Needs the
 *    user's own API key; billed by fal. The key is kept in localStorage and
 *    sent only to fal.run / queue.fal.run.
 */

export interface PollinationsConfig {
  enabled: boolean;
  /** image.pollinations.ai model id. */
  model: 'flux' | 'flux-realism' | 'turbo';
}

export interface FalConfig {
  enabled: boolean;
  /** Personal fal.ai key — never bundled, sent only to *.fal.run. */
  apiKey: string;
  /** A fal model route, e.g. "fal-ai/ltx-video-13b-098/image-to-video". */
  model: string;
}

export interface HostedConfig {
  pollinations: PollinationsConfig;
  fal: FalConfig;
}

export const DEFAULT_HOSTED: HostedConfig = {
  // Both off by default — the core path stays local (spec §94). Pollinations
  // is keyless but its abuse filter 403s many browser origins, so it is an
  // opt-in "try it" rather than a silent default.
  pollinations: { enabled: false, model: 'flux' },
  fal: {
    enabled: false,
    apiKey: '',
    model: 'fal-ai/ltx-video-13b-098/image-to-video',
  },
};

const KEY = 'aiv.hosted';

export function loadHostedConfig(): HostedConfig {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<HostedConfig>;
    return {
      pollinations: { ...DEFAULT_HOSTED.pollinations, ...(raw.pollinations ?? {}) },
      fal: { ...DEFAULT_HOSTED.fal, ...(raw.fal ?? {}) },
    };
  } catch {
    return {
      pollinations: { ...DEFAULT_HOSTED.pollinations },
      fal: { ...DEFAULT_HOSTED.fal },
    };
  }
}

export function saveHostedConfig(cfg: HostedConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* private mode */
  }
}

/** Online + not explicitly disabled. */
export function pollinationsUsable(cfg: PollinationsConfig): boolean {
  return cfg.enabled && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

export function falUsable(cfg: FalConfig): boolean {
  return cfg.enabled && cfg.apiKey.trim().length > 0 && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

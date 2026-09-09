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

export interface HfSpaceConfig {
  enabled: boolean;
}

export interface PollinationsConfig {
  enabled: boolean;
  /** image.pollinations.ai model id. 'flux' = leave Pollinations on its free
   *  anonymous default; 'turbo' = faster/lower detail. */
  model: 'flux' | 'turbo';
}

export interface FalConfig {
  enabled: boolean;
  /** Personal fal.ai key — never bundled, sent only to *.fal.run. */
  apiKey: string;
  /** A fal model route, e.g. "fal-ai/ltx-video-13b-098/image-to-video". */
  model: string;
}

export interface HostedConfig {
  hfSpace: HfSpaceConfig;
  pollinations: PollinationsConfig;
  fal: FalConfig;
}

export const DEFAULT_HOSTED: HostedConfig = {
  // Hugging Face Spaces (FLUX.1-schnell etc.) are the default free path:
  // keyless, CORS-open, and they actually render the described scene (still +
  // camera move). Free Spaces sleep and have an hourly quota, so the adapter
  // tries several; on failure the job reports why instead of silently making
  // coloured shapes.
  hfSpace: { enabled: true },
  // Pollinations now requires a CAPTCHA (Turnstile) for browser requests, so
  // it is off by default and kept only as a manual option.
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
      hfSpace: { ...DEFAULT_HOSTED.hfSpace, ...(raw.hfSpace ?? {}) },
      pollinations: { ...DEFAULT_HOSTED.pollinations, ...(raw.pollinations ?? {}) },
      fal: { ...DEFAULT_HOSTED.fal, ...(raw.fal ?? {}) },
    };
  } catch {
    return {
      hfSpace: { ...DEFAULT_HOSTED.hfSpace },
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

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function hfSpaceUsable(cfg: HfSpaceConfig): boolean {
  return cfg.enabled && online();
}

/** Online + not explicitly disabled. */
export function pollinationsUsable(cfg: PollinationsConfig): boolean {
  return cfg.enabled && online();
}

export function falUsable(cfg: FalConfig): boolean {
  return cfg.enabled && cfg.apiKey.trim().length > 0 && (typeof navigator === 'undefined' || navigator.onLine !== false);
}

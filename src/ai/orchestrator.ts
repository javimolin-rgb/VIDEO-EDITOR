/**
 * Model router / orchestrator (spec §100, §99, §201). Given a task it returns
 * the best available provider, or explains why none can do it. It never
 * silently calls an external API (spec §99, §159).
 *
 * Provider order = preference. The procedural generator is always present and
 * needs nothing installed, so generative modes are never dead — a diffusion
 * runtime, once connected, simply routes ahead of it.
 */

import { localProvider } from './providers/local/localProvider';
import { proceduralProvider } from './providers/procedural/proceduralProvider';
import { comfyUIProvider } from './providers/comfyui/comfyProvider';
import { pollinationsProvider } from './providers/hosted/pollinationsProvider';
import { falProvider } from './providers/hosted/falProvider';
import type { VideoGenerationProvider } from './provider';

export type GenerativeTask =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'
  | 'video-to-video'
  | 'extend-video'
  | 'region-edit';

/**
 * Ordered by preference. Real-diffusion backends (ComfyUI local, then fal.ai
 * with a key) route ahead of the free Pollinations image+motion path, which in
 * turn routes ahead of the always-on procedural generator. Every optional
 * adapter reports NO_CAPABILITIES until the user enables it, so the procedural
 * generator still covers everything offline.
 */
const providers: VideoGenerationProvider[] = [
  localProvider,
  comfyUIProvider,
  falProvider,
  pollinationsProvider,
  proceduralProvider,
];

export function registerProvider(provider: VideoGenerationProvider, front = false): void {
  if (providers.some((p) => p.id === provider.id)) return;
  if (front) providers.unshift(provider);
  else providers.push(provider);
}

export function getProvider(id: string): VideoGenerationProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function listProviders(): readonly VideoGenerationProvider[] {
  return providers;
}

// ─── manual backend override (spec §100 — the user may pin a backend) ────────

const PREF_KEY = 'aiv.preferredProvider';

function loadPreferred(): string | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v && v !== 'auto' ? v : null;
  } catch {
    return null;
  }
}

let preferredId: string | null = loadPreferred();

/** Pin generation to one backend id, or `null` for automatic routing. */
export function setPreferredProvider(id: string | null): void {
  preferredId = id;
  try {
    if (id) localStorage.setItem(PREF_KEY, id);
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* private mode */
  }
}

export function getPreferredProvider(): string | null {
  return preferredId;
}

function supports(provider: VideoGenerationProvider, task: GenerativeTask): boolean {
  const c = provider.capabilities;
  switch (task) {
    case 'text-to-video':
      return c.textToVideo;
    case 'image-to-video':
      return c.imageToVideo;
    case 'reference-to-video':
      return c.referenceToVideo;
    case 'video-to-video':
      return c.videoToVideo;
    case 'extend-video':
      return c.extendVideo;
    case 'region-edit':
      return c.regionEdit;
    default:
      return false;
  }
}

export interface RouteResult {
  provider: VideoGenerationProvider | null;
  reason: string;
  /** True when the pinned backend could not take the task and auto ran instead. */
  overrideIgnored?: boolean;
}

export function route(task: GenerativeTask): RouteResult {
  if (preferredId) {
    const pinned = providers.find((p) => p.id === preferredId);
    if (pinned && supports(pinned, task)) {
      return { provider: pinned, reason: `Pinned to ${pinned.name}` };
    }
    const auto = providers.find((p) => supports(p, task));
    if (auto) {
      return {
        provider: auto,
        reason: `${pinned?.name ?? preferredId} can't do this — using ${auto.name}`,
        overrideIgnored: true,
      };
    }
  }
  const match = providers.find((p) => supports(p, task));
  if (match) return { provider: match, reason: `Using ${match.name}` };
  return {
    provider: null,
    reason:
      'No local backend can perform this task yet. Editing is unaffected; ' +
      'a compatible local model or runtime will enable it.',
  };
}

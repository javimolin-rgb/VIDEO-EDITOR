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
import type { VideoGenerationProvider } from './provider';

export type GenerativeTask =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'
  | 'video-to-video'
  | 'extend-video'
  | 'region-edit';

/** Ordered by preference. A native diffusion adapter would be unshifted here. */
const providers: VideoGenerationProvider[] = [localProvider, proceduralProvider];

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
}

export function route(task: GenerativeTask): RouteResult {
  const match = providers.find((p) => supports(p, task));
  if (match) return { provider: match, reason: `Using ${match.name}` };
  return {
    provider: null,
    reason:
      'No local backend can perform this task yet. Editing is unaffected; ' +
      'a compatible local model or runtime will enable it.',
  };
}

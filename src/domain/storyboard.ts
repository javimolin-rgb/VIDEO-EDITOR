/**
 * Pure storyboard operations (spec §38, §131). Each returns a new shot list;
 * `order` is always kept dense and sequential.
 */

import { newId } from '@/lib/id';
import type { StoryboardShot } from './types';

function renumber(shots: StoryboardShot[]): StoryboardShot[] {
  return [...shots]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => (s.order === i ? s : { ...s, order: i }));
}

export function createShot(partial: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: newId('take'),
    order: partial.order ?? 0,
    title: partial.title ?? 'Shot',
    prompt: partial.prompt ?? '',
    durationSec: partial.durationSec ?? 4,
    camera: partial.camera ?? 'static',
    style: partial.style ?? 'cinematic',
    referenceAssetIds: partial.referenceAssetIds ?? [],
    carryContinuity: partial.carryContinuity ?? true,
    assetId: null,
    lastGenerationId: null,
    state: 'draft',
  };
}

export function addShot(shots: StoryboardShot[], partial?: Partial<StoryboardShot>): StoryboardShot[] {
  const shot = createShot({ ...partial, order: shots.length, title: partial?.title ?? `Shot ${shots.length + 1}` });
  return renumber([...shots, shot]);
}

export function updateShot(
  shots: StoryboardShot[],
  id: string,
  patch: Partial<Omit<StoryboardShot, 'id'>>,
): StoryboardShot[] {
  return renumber(shots.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)));
}

export function removeShot(shots: StoryboardShot[], id: string): StoryboardShot[] {
  return renumber(shots.filter((s) => s.id !== id));
}

export function moveShot(shots: StoryboardShot[], id: string, dir: -1 | 1): StoryboardShot[] {
  const ordered = renumber(shots);
  const idx = ordered.findIndex((s) => s.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= ordered.length) return ordered;
  const next = [...ordered];
  [next[idx], next[swap]] = [next[swap]!, next[idx]!];
  return renumber(next.map((s, i) => ({ ...s, order: i })));
}

export function totalDurationSec(shots: StoryboardShot[]): number {
  return shots.reduce((sum, s) => sum + s.durationSec, 0);
}

export function orderedShots(shots: StoryboardShot[]): StoryboardShot[] {
  return [...shots].sort((a, b) => a.order - b.order);
}

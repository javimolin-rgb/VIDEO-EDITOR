import { describe, expect, it } from 'vitest';
import { buildGraph, flattenGraph } from './history';
import type { GenerationRow } from '@/storage/db';

function row(id: string, parentId: string | null, createdAt: number): GenerationRow {
  return {
    id,
    projectId: 'p',
    parentId,
    kind: 'text-to-video',
    requestHash: 'h',
    assetId: `asset_${id}`,
    meta: {
      generationId: id,
      parentId,
      providerId: 'procedural',
      modelId: 'procedural-synth',
      modelVersion: '1.0.0',
      prompt: id,
      negativePrompt: null,
      referenceAssetIds: [],
      seed: 1,
      params: {},
      durationSec: 5,
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      createdAt,
      qualityScore: 0.8,
    },
    qualityScore: 0.8,
    qualityIssues: [],
    createdAt,
  };
}

describe('generation graph', () => {
  it('nests variations under their parent with increasing depth', () => {
    const rows = [row('a', null, 1), row('b', 'a', 2), row('c', 'b', 3), row('d', null, 4)];
    const graph = buildGraph(rows);
    // newest root first
    expect(graph.map((n) => n.id)).toEqual(['d', 'a']);
    const flat = flattenGraph(graph);
    const byId = Object.fromEntries(flat.map((n) => [n.id, n]));
    expect(byId.a!.depth).toBe(0);
    expect(byId.b!.depth).toBe(1);
    expect(byId.c!.depth).toBe(2);
  });

  it('treats an orphaned parent reference as a root', () => {
    const graph = buildGraph([row('x', 'missing', 1)]);
    expect(graph).toHaveLength(1);
    expect(graph[0]!.depth).toBe(0);
  });
});

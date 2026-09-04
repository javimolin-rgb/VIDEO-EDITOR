import { describe, expect, it } from 'vitest';
import { applyMap, describeGraph, parseGraph, type ComfyGraph } from './config';

const GRAPH: ComfyGraph = {
  '3': {
    class_type: 'KSampler',
    inputs: { seed: 12345, steps: 20, cfg: 3.5, model: ['4', 0], positive: ['6', 0] },
  },
  '5': { class_type: 'EmptyLTXVLatentVideo', inputs: { width: 768, height: 512, length: 49 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a placeholder prompt', clip: ['4', 1] } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
};

describe('parseGraph', () => {
  it('accepts a raw API export', () => {
    const g = parseGraph(JSON.stringify(GRAPH));
    expect(Object.keys(g)).toHaveLength(4);
  });

  it('accepts a { prompt: {...} } wrapper', () => {
    const g = parseGraph(JSON.stringify({ prompt: GRAPH }));
    expect(g['3']!.class_type).toBe('KSampler');
  });

  it('rejects a UI-format (non-API) workflow', () => {
    expect(() => parseGraph(JSON.stringify({ nodes: [], links: [] }))).toThrow(/API-format/i);
  });
});

describe('describeGraph', () => {
  it('lists nodes with only their literal (mappable) inputs', () => {
    const nodes = describeGraph(GRAPH);
    const sampler = nodes.find((n) => n.id === '3')!;
    expect(sampler.classType).toBe('KSampler');
    expect(sampler.literalInputs).toContain('seed');
    expect(sampler.literalInputs).toContain('steps');
    // wired inputs (arrays) are not offered
    expect(sampler.literalInputs).not.toContain('model');
    expect(sampler.literalInputs).not.toContain('positive');
  });
});

describe('applyMap', () => {
  it('writes mapped values onto a clone, leaving the original untouched', () => {
    const map = {
      positive: { node: '6', key: 'text' },
      negative: { node: '7', key: 'text' },
      width: { node: '5', key: 'width' },
      height: { node: '5', key: 'height' },
      length: { node: '5', key: 'length' },
      seed: { node: '3', key: 'seed' },
    };
    const out = applyMap(GRAPH, map, {
      positive: 'rooftop at golden hour',
      negative: 'blurry, text',
      width: 1080,
      height: 1920,
      length: 97,
      seed: 42,
    });
    expect(out['6']!.inputs.text).toBe('rooftop at golden hour');
    expect(out['7']!.inputs.text).toBe('blurry, text');
    expect(out['5']!.inputs).toMatchObject({ width: 1080, height: 1920, length: 97 });
    expect(out['3']!.inputs.seed).toBe(42);
    // original unchanged
    expect(GRAPH['6']!.inputs.text).toBe('a placeholder prompt');
    expect(GRAPH['3']!.inputs.seed).toBe(12345);
  });

  it('ignores a mapping that points at a missing node/key', () => {
    const out = applyMap(GRAPH, { positive: { node: '99', key: 'text' } }, { positive: 'x' });
    expect(out['99']).toBeUndefined();
  });
});

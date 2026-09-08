import { describe, expect, it } from 'vitest';
import { buildImagePrompt, pollinationsUrl } from './imagePrompt';
import type { GenerationRequestBase } from '@/ai/provider';

const base: GenerationRequestBase = {
  projectId: 'p',
  prompt: '',
  durationSec: 5,
  fps: 24,
  resolution: { width: 1920, height: 1080 },
  aspectRatio: '16:9',
};

describe('buildImagePrompt', () => {
  it('keeps a short prompt and appends photo cues', () => {
    const out = buildImagePrompt({ ...base, prompt: 'a black cabin in the mountains at sunset' });
    expect(out.startsWith('a black cabin in the mountains at sunset')).toBe(true);
    expect(out).toMatch(/photorealistic/);
    expect(out).toMatch(/16:9 framing/);
  });

  it('strips numbered rules and negative-constraint lines from a pasted master prompt', () => {
    const master = [
      'MASTER PROMPT',
      'REFERENCE IMAGE = ABSOLUTE SOURCE OF TRUTH',
      'A two-storey black timber cabin with a gabled roof and full-height glazing, on a timber deck, pine forest and snow-capped mountains behind, golden-hour light.',
      '1. Reference Lock',
      'No additional floors, balconies, windows, doors, railings.',
      'CORE RULE: The animation is a controlled construction reveal.',
    ].join('\n');
    const out = buildImagePrompt({ ...base, prompt: master });
    expect(out).toMatch(/two-storey black timber cabin/);
    expect(out).not.toMatch(/MASTER PROMPT/);
    expect(out).not.toMatch(/Reference Lock/);
    expect(out).not.toMatch(/CORE RULE/);
    expect(out).not.toMatch(/No additional floors/);
  });

  it('never returns an empty prompt', () => {
    expect(buildImagePrompt({ ...base, prompt: '   ' }).length).toBeGreaterThan(0);
  });
});

describe('pollinationsUrl', () => {
  it('builds a keyless image URL with clamped dimensions', () => {
    const u = pollinationsUrl('a house', { width: 4000, height: 90, seed: -1, model: 'flux' });
    expect(u.startsWith('https://image.pollinations.ai/prompt/a%20house?')).toBe(true);
    expect(u).toMatch(/width=1536/);
    expect(u).toMatch(/height=256/);
    // flux is the default; only non-default models are named
    expect(u).not.toMatch(/model=/);
    expect(u).not.toMatch(/key|token|auth|nologo|enhance/i);
  });

  it('names a non-default model and passes the referrer', () => {
    const u = pollinationsUrl('x', { width: 512, height: 512, seed: 1, model: 'turbo', referrer: 'example.com' });
    expect(u).toMatch(/model=turbo/);
    expect(u).toMatch(/referrer=example.com/);
  });
});

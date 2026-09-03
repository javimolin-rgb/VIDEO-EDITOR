import { describe, expect, it } from 'vitest';
import { buildRequest, composePrompt, enhance } from './prompt';

describe('enhance', () => {
  it('keeps the user text as the subject and never discards it', () => {
    const { original, structured } = enhance('woman walking on beach');
    expect(original).toBe('woman walking on beach');
    expect(structured.subject).toContain('woman walking on beach');
  });

  it('detects camera, style, motion and colour cues', () => {
    const { structured } = enhance('slow dolly in, editorial fashion look, golden hour, elegant');
    expect(structured.camera).toBe('dolly-in');
    expect(['fashion', 'editorial']).toContain(structured.style);
    expect(structured.motion).toBe('low');
    expect(structured.colorMood).toMatch(/warm|golden/);
  });

  it('extracts "no ..." constraints', () => {
    const { structured } = enhance('a product shot, no text, no extra people');
    expect(structured.constraints.join(' ')).toMatch(/no text/);
    expect(structured.constraints.length).toBeGreaterThanOrEqual(1);
  });
});

describe('composePrompt / buildRequest', () => {
  it('composes a single string and a provider request', () => {
    const { structured } = enhance('city street at night, handheld');
    const composed = composePrompt(structured);
    expect(composed).toMatch(/handheld camera/);

    const req = buildRequest('proj_1', {
      structured,
      durationSec: 6,
      fps: 30,
      resolution: { width: 1920, height: 1080 },
      aspectRatio: '16:9',
      seed: 42,
      references: [],
    });
    expect(req.projectId).toBe('proj_1');
    expect(req.durationSec).toBe(6);
    expect(req.seed).toBe(42);
    expect(req.prompt).toBe(composed);
  });
});

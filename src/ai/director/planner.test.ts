import { describe, expect, it } from 'vitest';
import { planFromBrief, planFromScript, splitScriptBeats } from './planner';
import { inferBrief } from './brief';

describe('planFromBrief', () => {
  it('produces a hook, product beats and a CTA close', () => {
    const brief = inferBrief('20s luxury reel for the watch', 'Meridian automatic watch');
    const plan = planFromBrief(brief);
    expect(plan.shots.length).toBe(brief.shotCount);
    expect(plan.shots[0]!.title).toBe('Hook');
    expect(plan.shots[plan.shots.length - 1]!.title).toBe('Close / CTA');
    expect(plan.shots[0]!.carryContinuity).toBe(false);
    expect(plan.shots[1]!.carryContinuity).toBe(true);
  });

  it('always includes build → generate → assemble steps', () => {
    const plan = planFromBrief(inferBrief('teaser', 'thing'));
    const kinds = plan.steps.map((s) => s.kind);
    expect(kinds).toContain('build-storyboard');
    expect(kinds).toContain('generate-shots');
    expect(kinds).toContain('assemble');
    expect(kinds).toContain('export-variants');
  });

  it('maps platform to export aspects', () => {
    expect(planFromBrief(inferBrief('yt spot 30s', 'x')).exportAspects[0]).toBe('16:9');
    expect(planFromBrief(inferBrief('tiktok', 'x')).exportAspects).toContain('9:16');
  });
});

describe('splitScriptBeats / planFromScript', () => {
  it('splits a script into beats and one shot each, with captions', () => {
    const script =
      'Chile has 6,000 kilometres of coastline. Much of it is changing fast. Visit the coast before it disappears.';
    const beats = splitScriptBeats(script);
    expect(beats.length).toBe(3);
    const plan = planFromScript(script);
    expect(plan.shots).toHaveLength(3);
    expect(plan.captionLines).toEqual(beats);
    expect(plan.shots[2]!.title).toBe('CTA'); // "Visit ..."
    expect(plan.steps.map((s) => s.kind)).toContain('captions');
  });

  it('caps very long scripts to 12 beats', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Sentence number ${i}.`).join(' ');
    expect(splitScriptBeats(many).length).toBeLessThanOrEqual(12);
  });
});

describe('inferBrief', () => {
  it('reads style, platform and duration from the text', () => {
    const b = inferBrief('a 12 second luxury tiktok for the bag', 'leather tote');
    expect(b.style).toBe('luxury');
    expect(b.platform).toBe('tiktok');
    expect(b.durationSec).toBe(12);
    expect(b.shotCount).toBeGreaterThanOrEqual(3);
  });
});

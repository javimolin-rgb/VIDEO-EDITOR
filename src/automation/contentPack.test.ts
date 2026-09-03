import { describe, expect, it } from 'vitest';
import { buildContentPack } from './contentPack';

describe('buildContentPack', () => {
  const lines = [
    'The Atacama desert is the driest place on Earth.',
    'Nothing grows here for years at a time.',
    'Visit before the winter rains arrive.',
  ];

  it('derives a title, description, tags and a CTA from the lines', () => {
    const pack = buildContentPack(lines, 'desert tour');
    expect(pack.title.toLowerCase()).toContain('atacama');
    expect(pack.description.length).toBeGreaterThan(10);
    expect(pack.tags.length).toBeGreaterThan(0);
    expect(pack.tags).toContain('desert tour');
    expect(pack.cta.toLowerCase()).toContain('visit');
  });

  it('gives a heuristic hook note and never invents analytics', () => {
    const note = buildContentPack(['Is this the driest place on Earth?']).hookNote;
    expect(note.toLowerCase()).toContain('question');
    const note2 = buildContentPack(['A statement about something.']).hookNote;
    expect(note2.toLowerCase()).toMatch(/heuristic|consider/);
  });

  it('falls back gracefully with no lines', () => {
    const pack = buildContentPack([], 'thing');
    expect(pack.title).toBeTruthy();
    expect(pack.cta).toBe('Watch to the end.');
  });
});

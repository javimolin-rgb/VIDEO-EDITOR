import { describe, expect, it } from 'vitest';
import { createProject } from '@/domain/project';
import { addMarker } from '@/domain/timeline/operations';
import type { Asset } from '@/domain/types';
import { searchProject } from './search';

function asset(id: string, name: string): Asset {
  return {
    id,
    projectId: 'p',
    kind: 'video',
    role: 'source',
    name,
    blobKey: null,
    thumbnailDataUrl: null,
    meta: {
      durationSec: 1,
      width: null,
      height: null,
      fps: null,
      codec: null,
      audioChannels: null,
      sampleRate: null,
      rotation: null,
      sizeBytes: 0,
      mimeType: 'video/mp4',
    },
    createdAt: 0,
    tags: [],
  };
}

describe('searchProject', () => {
  it('matches assets, markers and caption cues, ranked', () => {
    const project = createProject({ name: 'demo' });
    project.timeline = addMarker(project.timeline, 90, 'ocean sunset');
    project.timeline.captionLayer.cues.push({
      id: 'c1',
      startFrame: 120,
      endFrame: 180,
      text: 'the ocean was calm that morning',
    });
    const assets = [asset('a1', 'ocean-broll.mp4'), asset('a2', 'interview.mp4')];

    const hits = searchProject(project, assets, null, 'ocean');
    const kinds = hits.map((h) => h.kind);
    expect(kinds).toContain('asset');
    expect(kinds).toContain('marker');
    expect(kinds).toContain('caption');
    expect(hits.find((h) => h.kind === 'asset')?.assetId).toBe('a1');
    // scores are sorted descending
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  });

  it('ignores very short queries', () => {
    const project = createProject();
    expect(searchProject(project, [], null, 'a')).toHaveLength(0);
  });
});

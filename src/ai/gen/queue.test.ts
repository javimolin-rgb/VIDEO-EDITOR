import { describe, expect, it, vi } from 'vitest';
import { GenerationQueue } from './queue';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  VideoGenerationProvider,
} from '@/ai/provider';

function fakeProvider(overrides: Partial<VideoGenerationProvider> = {}): VideoGenerationProvider {
  return {
    id: 'fake',
    name: 'Fake',
    capabilities: {
      textToVideo: true,
      imageToVideo: false,
      referenceToVideo: false,
      videoToVideo: false,
      extendVideo: false,
      regionEdit: false,
      storyboardToVideo: false,
      jointAudio: false,
      maxDurationSec: 10,
      supportedAspectRatios: ['16:9'],
      deterministicWithSeed: true,
    },
    async health() {
      return { ok: true, detail: 'ok' };
    },
    async generateTextToVideo(_req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult> {
      ctx.onPhase('generating', 0.5, 'half');
      await new Promise((r) => setTimeout(r, 5));
      if (ctx.signal.aborted) throw new Error('aborted');
      return {
        jobId: ctx.jobId,
        output: { blob: new Blob(['x'.repeat(2048)]), mimeType: 'video/mp4', durationSec: 3 },
        modelId: 'fake-model',
        modelVersion: '1',
        seed: 1,
      };
    },
    ...overrides,
  };
}

const req: GenerationRequestBase = {
  projectId: 'p',
  prompt: 'hello',
  durationSec: 3,
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  aspectRatio: '16:9',
  seed: 1,
};

function baseJob() {
  return {
    projectId: 'p',
    kind: 'text-to-video' as const,
    label: 'test',
    providerId: 'fake',
    parentGenerationId: null,
    placement: null,
    storyboardShotId: null,
    request: req,
  };
}

describe('GenerationQueue', () => {
  it('runs a job to ready and reports phases', async () => {
    const q = new GenerationQueue();
    q.configure(() => fakeProvider(), 1);
    const seen: string[] = [];
    q.subscribe((jobs) => jobs[0] && seen.push(jobs[0].status.phase));
    const id = q.enqueue(baseJob());

    await vi.waitFor(() => {
      const job = q.snapshot().find((j) => j.id === id);
      expect(job?.status.phase).toBe('ready');
    });
    expect(seen).toContain('generating');
    expect(q.snapshot()[0]!.result?.output?.blob.size).toBeGreaterThan(1000);
  });

  it('honours concurrency = 1', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const q = new GenerationQueue();
    q.configure(
      () =>
        fakeProvider({
          async generateTextToVideo(_r, ctx) {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise((r) => setTimeout(r, 15));
            concurrent--;
            return {
              jobId: ctx.jobId,
              output: { blob: new Blob(['y'.repeat(2048)]), mimeType: 'video/mp4', durationSec: 1 },
              modelId: 'm',
              modelVersion: '1',
              seed: 0,
            };
          },
        }),
      1,
    );
    q.enqueue(baseJob());
    q.enqueue(baseJob());
    q.enqueue(baseJob());
    await vi.waitFor(() => {
      expect(q.snapshot().every((j) => j.status.phase === 'ready')).toBe(true);
    });
    expect(maxConcurrent).toBe(1);
  });

  it('cancels a queued job', async () => {
    const q = new GenerationQueue();
    q.configure(
      () =>
        fakeProvider({
          async generateTextToVideo(_r, ctx) {
            await new Promise((r) => setTimeout(r, 40));
            return {
              jobId: ctx.jobId,
              output: { blob: new Blob(['z'.repeat(2048)]), mimeType: 'video/mp4', durationSec: 1 },
              modelId: 'm',
              modelVersion: '1',
              seed: 0,
            };
          },
        }),
      1,
    );
    q.enqueue(baseJob());
    const second = q.enqueue(baseJob());
    q.cancel(second);
    await vi.waitFor(() => {
      expect(q.snapshot().find((j) => j.id === second)?.status.phase).toBe('cancelled');
    });
  });
});

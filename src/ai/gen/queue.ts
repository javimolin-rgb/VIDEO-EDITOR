/**
 * Generation job queue (spec §89, §90, §148). Heavy work is always a job with
 * explicit phases and cancellation. Concurrency is capped (default 1) so a
 * GPU-class backend is never asked to run two jobs at once; the UI stays
 * responsive because providers do their work off the React render path.
 */

import { newId } from '@/lib/id';
import { createLogger } from '@/lib/logger';
import type {
  GenerationContext,
  GenerationRequestBase,
  GenerationResult,
  JobPhase,
  JobStatus,
  VideoGenerationProvider,
} from '@/ai/provider';

const log = createLogger('ai');

export type GenKind = 'text-to-video' | 'image-to-video';

export interface GenJob {
  id: string;
  projectId: string;
  kind: GenKind;
  label: string;
  providerId: string;
  request: GenerationRequestBase & { firstFrameAssetId?: string; firstFrameDataUrl?: string };
  /** For variations / regenerations — links into the generation graph (spec §75). */
  parentGenerationId: string | null;
  /** When set, the result is dropped straight onto the timeline (spec §41, §208). */
  placement: { trackId: string; atFrame: number } | null;
  /** When set, the result is bound back to this storyboard shot (spec §38). */
  storyboardShotId: string | null;
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  result: GenerationResult | null;
}

type Listener = (jobs: GenJob[]) => void;

const TERMINAL: JobPhase[] = ['ready', 'failed', 'cancelled'];

export class GenerationQueue {
  private jobs: GenJob[] = [];
  private listeners = new Set<Listener>();
  private controllers = new Map<string, AbortController>();
  private running = 0;
  private concurrency = 1;

  private resolveProvider: (id: string) => VideoGenerationProvider | undefined = () => undefined;

  configure(resolveProvider: (id: string) => VideoGenerationProvider | undefined, concurrency = 1): void {
    this.resolveProvider = resolveProvider;
    this.concurrency = Math.max(1, concurrency);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): GenJob[] {
    return this.jobs.map((j) => ({ ...j, status: { ...j.status } }));
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  enqueue(input: Omit<GenJob, 'id' | 'status' | 'createdAt' | 'startedAt' | 'endedAt' | 'result'>): string {
    const id = newId('job');
    this.jobs.unshift({
      ...input,
      id,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      result: null,
      status: { jobId: id, phase: 'queued', progress: null, message: 'Queued', etaSeconds: null },
    });
    this.emit();
    void this.pump();
    return id;
  }

  cancel(id: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job || TERMINAL.includes(job.status.phase)) return;
    this.controllers.get(id)?.abort();
    if (job.status.phase === 'queued') {
      job.status = { ...job.status, phase: 'cancelled', message: 'Cancelled' };
      job.endedAt = Date.now();
      this.emit();
    }
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => !TERMINAL.includes(j.status.phase));
    this.emit();
  }

  private async pump(): Promise<void> {
    if (this.running >= this.concurrency) return;
    const next = this.jobs.slice().reverse().find((j) => j.status.phase === 'queued');
    if (!next) return;

    this.running++;
    const controller = new AbortController();
    this.controllers.set(next.id, controller);
    next.startedAt = Date.now();
    this.setPhase(next.id, 'preparing', 0, 'Preparing…');

    const ctx: GenerationContext = {
      jobId: next.id,
      signal: controller.signal,
      onPhase: (phase, progress, message) => this.setPhase(next.id, phase, progress, message),
    };

    try {
      const provider = this.resolveProvider(next.providerId);
      if (!provider) throw new Error(`Provider "${next.providerId}" is not available.`);

      let result: GenerationResult;
      if (next.kind === 'text-to-video') {
        if (!provider.generateTextToVideo) throw new Error('Provider cannot do text-to-video.');
        result = await provider.generateTextToVideo(next.request, ctx);
      } else {
        if (!provider.generateImageToVideo) throw new Error('Provider cannot do image-to-video.');
        result = await provider.generateImageToVideo(
          next.request as GenerationRequestBase & {
            firstFrameAssetId?: string;
            firstFrameDataUrl?: string;
          },
          ctx,
        );
      }

      next.result = result;
      this.setPhase(next.id, 'quality-check', 0.99, 'Quality check…');
      next.endedAt = Date.now();
      this.setPhase(next.id, 'ready', 1, 'Ready');
      log.info('gen job ready', { id: next.id, ms: next.endedAt - (next.startedAt ?? 0) });
    } catch (e) {
      next.endedAt = Date.now();
      const cancelled = controller.signal.aborted;
      next.status = {
        jobId: next.id,
        phase: cancelled ? 'cancelled' : 'failed',
        progress: null,
        message: cancelled ? 'Cancelled' : String((e as Error).message ?? e),
        etaSeconds: null,
        error: cancelled ? undefined : { code: 'gen/failed', message: String((e as Error).message ?? e) },
      };
      this.emit();
    } finally {
      this.controllers.delete(next.id);
      this.running--;
      void this.pump();
    }
  }

  private setPhase(id: string, phase: JobPhase, progress: number | null, message: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    job.status = { jobId: id, phase, progress, message, etaSeconds: null };
    this.emit();
  }
}

export const generationQueue = new GenerationQueue();
export { TERMINAL as TERMINAL_PHASES };

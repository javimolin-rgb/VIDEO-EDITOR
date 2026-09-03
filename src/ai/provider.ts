/**
 * Model-agnostic generative provider contract (spec §4, §201).
 *
 * Business logic must branch on `capabilities`, never on a provider id or
 * brand name. Removing any concrete adapter must not break compilation
 * (spec §94, §265).
 */

export interface ProviderCapabilities {
  textToVideo: boolean;
  imageToVideo: boolean;
  referenceToVideo: boolean;
  videoToVideo: boolean;
  extendVideo: boolean;
  regionEdit: boolean;
  storyboardToVideo: boolean;
  jointAudio: boolean;
  /** Practical max output the provider will attempt, in seconds. */
  maxDurationSec: number;
  supportedAspectRatios: string[];
  /** Whether identical inputs + seed reproduce output (spec §242). */
  deterministicWithSeed: boolean;
}

export const NO_CAPABILITIES: ProviderCapabilities = {
  textToVideo: false,
  imageToVideo: false,
  referenceToVideo: false,
  videoToVideo: false,
  extendVideo: false,
  regionEdit: false,
  storyboardToVideo: false,
  jointAudio: false,
  maxDurationSec: 0,
  supportedAspectRatios: [],
  deterministicWithSeed: false,
};

export type JobPhase =
  | 'queued'
  | 'preparing'
  | 'loading-model'
  | 'analyzing-references'
  | 'building-conditioning'
  | 'generating'
  | 'generating-audio'
  | 'post-processing'
  | 'quality-check'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface JobStatus {
  jobId: string;
  phase: JobPhase;
  /** 0..1 within the current phase; null when indeterminate. */
  progress: number | null;
  message: string;
  etaSeconds: number | null;
  error?: { code: string; message: string; fix?: string };
}

export interface ReferenceInput {
  assetId: string;
  role:
    | 'character'
    | 'product'
    | 'clothing'
    | 'environment'
    | 'architecture'
    | 'style'
    | 'color'
    | 'composition'
    | 'camera'
    | 'motion'
    | 'audio'
    | 'story'
    | 'brand';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface GenerationRequestBase {
  projectId: string;
  prompt: string;
  negativePrompt?: string;
  durationSec: number;
  fps: number;
  resolution: { width: number; height: number };
  aspectRatio: string;
  seed?: number | null;
  references?: ReferenceInput[];
  /** Opaque model params surfaced only in advanced mode (spec §103). */
  advanced?: Record<string, number | string | boolean>;
}

export interface GenerationResult {
  jobId: string;
  /** Populated when phase === 'ready'. Blob is an in-memory result clip. */
  output: { blob: Blob; mimeType: string; durationSec: number } | null;
  /** Model identity for the generation record (spec §243). */
  modelId: string;
  modelVersion: string;
  /** The seed actually used (providers may resolve `null` to a random one). */
  seed: number | null;
}

/** Passed by the queue so a provider can stream progress and honour cancel. */
export interface GenerationContext {
  jobId: string;
  signal: AbortSignal;
  onPhase: (phase: JobPhase, progress: number | null, message: string) => void;
}

/**
 * All methods are optional beyond identity + capabilities so an adapter only
 * implements what it truly supports. Callers gate on `capabilities` first.
 */
export interface VideoGenerationProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  /** Cheap liveness check for the local service (spec §251). */
  health(): Promise<{ ok: boolean; detail: string }>;

  generateTextToVideo?(req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult>;
  generateImageToVideo?(
    req: GenerationRequestBase & { firstFrameAssetId: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult>;
  generateReferenceVideo?(req: GenerationRequestBase, ctx: GenerationContext): Promise<GenerationResult>;
  editVideo?(
    req: GenerationRequestBase & { sourceAssetId: string },
    ctx: GenerationContext,
  ): Promise<GenerationResult>;
  extendVideo?(
    req: GenerationRequestBase & { sourceAssetId: string; fromEnd: boolean },
    ctx: GenerationContext,
  ): Promise<GenerationResult>;

  getJobStatus?(jobId: string): Promise<JobStatus>;
  cancelJob?(jobId: string): Promise<void>;
}

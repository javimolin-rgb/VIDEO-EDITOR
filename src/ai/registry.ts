/**
 * Local model registry (spec §5, §97, §241). Describes models the app *could*
 * run locally, their hardware needs and licenses. Phase 1 ships the catalog
 * and the data model; actual download/inference is the Phase 3 local service.
 */

export type ModelTask = 'video' | 'image' | 'audio' | 'speech' | 'vision' | 'upscale';

export type ModelInstallState = 'not-installed' | 'downloading' | 'installed' | 'error' | 'update-available';

export interface ModelDescriptor {
  id: string;
  name: string;
  task: ModelTask;
  version: string;
  license: string;
  /** Where weights come from; shown to the user before any download (spec §7). */
  downloadSource: string;
  sizeBytesApprox: number;
  vramGbMin: number;
  ramGbMin: number;
  supportedResolutions: string[];
  supportedDurationsSec: number[];
  supportedAspectRatios: string[];
  supportedModes: string[];
  precision: 'fp16' | 'bf16' | 'fp8' | 'int8' | 'int4' | 'mixed';
  hardware: Array<'cuda' | 'metal' | 'cpu' | 'rocm'>;
  speedEstimate: 'fast' | 'balanced' | 'quality';
  qualityEstimate: 'draft' | 'good' | 'high';
  notes: string;
}

export interface RegisteredModel {
  descriptor: ModelDescriptor;
  state: ModelInstallState;
  installedPath: string | null;
  installedAt: number | null;
}

/**
 * Reference catalog. These are real open-weight model families; entries are
 * informational until a local runtime is connected. Nothing is bundled — the
 * user chooses what (if anything) to download (spec §7, §97).
 */
export const MODEL_CATALOG: ModelDescriptor[] = [
  {
    id: 'ltx-video-2b',
    name: 'LTX-Video 2B',
    task: 'video',
    version: '0.9',
    license: 'OpenRAIL-M (research + commercial with use restrictions)',
    downloadSource: 'Hugging Face: Lightricks/LTX-Video',
    sizeBytesApprox: 9 * 1024 ** 3,
    vramGbMin: 12,
    ramGbMin: 16,
    supportedResolutions: ['512x512', '768x512', '1216x704'],
    supportedDurationsSec: [2, 3, 4, 5],
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    supportedModes: ['t2v', 'i2v'],
    precision: 'bf16',
    hardware: ['cuda', 'metal'],
    speedEstimate: 'fast',
    qualityEstimate: 'good',
    notes: 'Fastest practical local T2V/I2V; good default for lower-VRAM machines.',
  },
  {
    id: 'wan-2-1-t2v-1-3b',
    name: 'Wan 2.1 T2V 1.3B',
    task: 'video',
    version: '2.1',
    license: 'Apache-2.0',
    downloadSource: 'Hugging Face: Wan-AI/Wan2.1-T2V-1.3B',
    sizeBytesApprox: 7 * 1024 ** 3,
    vramGbMin: 8,
    ramGbMin: 16,
    supportedResolutions: ['480x832', '832x480'],
    supportedDurationsSec: [3, 4, 5],
    supportedAspectRatios: ['16:9', '9:16'],
    supportedModes: ['t2v'],
    precision: 'bf16',
    hardware: ['cuda', 'metal', 'cpu'],
    speedEstimate: 'balanced',
    qualityEstimate: 'good',
    notes: 'Permissive license. Runs on modest GPUs; 14B variant needs far more VRAM.',
  },
  {
    id: 'hunyuan-video',
    name: 'HunyuanVideo',
    task: 'video',
    version: '1.0',
    license: 'Tencent Hunyuan Community License',
    downloadSource: 'Hugging Face: tencent/HunyuanVideo',
    sizeBytesApprox: 45 * 1024 ** 3,
    vramGbMin: 45,
    ramGbMin: 32,
    supportedResolutions: ['720x1280', '1280x720'],
    supportedDurationsSec: [4, 5],
    supportedAspectRatios: ['16:9', '9:16'],
    supportedModes: ['t2v'],
    precision: 'bf16',
    hardware: ['cuda'],
    speedEstimate: 'quality',
    qualityEstimate: 'high',
    notes: 'Highest quality of the three; NVIDIA-class VRAM only.',
  },
  {
    id: 'whisper-base',
    name: 'Whisper (base)',
    task: 'speech',
    version: 'base',
    license: 'MIT',
    downloadSource: 'Hugging Face: openai/whisper-base / whisper.cpp',
    sizeBytesApprox: 145 * 1024 ** 2,
    vramGbMin: 0,
    ramGbMin: 2,
    supportedResolutions: [],
    supportedDurationsSec: [],
    supportedAspectRatios: [],
    supportedModes: ['transcribe'],
    precision: 'int8',
    hardware: ['cuda', 'metal', 'cpu'],
    speedEstimate: 'fast',
    qualityEstimate: 'good',
    notes: 'Lightweight local transcription. Larger variants improve accuracy.',
  },
  {
    id: 'piper-tts',
    name: 'Piper TTS',
    task: 'speech',
    version: '1.0',
    license: 'MIT',
    downloadSource: 'GitHub: rhasspy/piper',
    sizeBytesApprox: 60 * 1024 ** 2,
    vramGbMin: 0,
    ramGbMin: 1,
    supportedResolutions: [],
    supportedDurationsSec: [],
    supportedAspectRatios: [],
    supportedModes: ['tts'],
    precision: 'fp16',
    hardware: ['cpu'],
    speedEstimate: 'fast',
    qualityEstimate: 'good',
    notes: 'Fully local, CPU-only neural TTS. No cloud voice API required (spec §57).',
  },
];

const registry = new Map<string, RegisteredModel>(
  MODEL_CATALOG.map((descriptor) => [
    descriptor.id,
    { descriptor, state: 'not-installed' as ModelInstallState, installedPath: null, installedAt: null },
  ]),
);

export function listModels(task?: ModelTask): RegisteredModel[] {
  const all = [...registry.values()];
  return task ? all.filter((m) => m.descriptor.task === task) : all;
}

export function getModel(id: string): RegisteredModel | undefined {
  return registry.get(id);
}

export function setModelState(id: string, patch: Partial<Omit<RegisteredModel, 'descriptor'>>): void {
  const current = registry.get(id);
  if (!current) return;
  registry.set(id, { ...current, ...patch });
}

export function anyVideoModelInstalled(): boolean {
  return listModels('video').some((m) => m.state === 'installed');
}

/**
 * Local, on-device AI (spec §3, §57, §149, §261). These capabilities run in
 * the browser via `@xenova/transformers` (WASM / WebGPU). Model weights are
 * fetched from the Hugging Face hub **only on explicit user request** and
 * cached locally thereafter (spec §7, §8, §95). No inference server, no API
 * key, no external service is required.
 */

export type LocalTask = 'transcribe' | 'tts' | 'embed' | 'detect';

export interface LocalModelInfo {
  id: string;
  hubId: string;
  task: LocalTask;
  label: string;
  approxBytes: number;
  license: string;
  /** e.g. "English only", "99 languages". */
  note: string;
}

export type LocalModelState = 'not-installed' | 'downloading' | 'installed' | 'error';

export interface LocalModelStatus {
  info: LocalModelInfo;
  state: LocalModelState;
  /** 0..1 while downloading. */
  progress: number;
  error?: string;
}

export interface TranscriptWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface TranscriptSegment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
  words: TranscriptWord[];
}

export interface TranscriptResult {
  language: string | null;
  segments: TranscriptSegment[];
  modelId: string;
  createdAt: number;
}

/** In-browser model catalogue. Nothing here is bundled. */
export const LOCAL_MODELS: LocalModelInfo[] = [
  {
    id: 'whisper-tiny-en',
    hubId: 'Xenova/whisper-tiny.en',
    task: 'transcribe',
    label: 'Whisper Tiny (English)',
    approxBytes: 40 * 1024 * 1024,
    license: 'MIT',
    note: 'English only. Fastest; good for clean speech.',
  },
  {
    id: 'whisper-base',
    hubId: 'Xenova/whisper-base',
    task: 'transcribe',
    label: 'Whisper Base (multilingual)',
    approxBytes: 145 * 1024 * 1024,
    license: 'MIT',
    note: '99 languages, auto-detected. Slower, more accurate.',
  },
  {
    id: 'tts-es',
    hubId: 'Xenova/mms-tts-spa',
    task: 'tts',
    label: 'Voice — Spanish (MMS-TTS)',
    approxBytes: 60 * 1024 * 1024,
    license: 'CC-BY-NC 4.0',
    note: 'Reads a script to a voice-over clip. Runs on-device.',
  },
  {
    id: 'tts-en',
    hubId: 'Xenova/mms-tts-eng',
    task: 'tts',
    label: 'Voice — English (MMS-TTS)',
    approxBytes: 60 * 1024 * 1024,
    license: 'CC-BY-NC 4.0',
    note: 'Reads a script to a voice-over clip. Runs on-device.',
  },
];

export function getLocalModel(id: string): LocalModelInfo | undefined {
  return LOCAL_MODELS.find((m) => m.id === id);
}

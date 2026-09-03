/**
 * Audio decode + slice helpers for local analysis (silence detection,
 * transcription). Uses a shared AudioContext; nothing leaves the device.
 */

import { getAssetBlob } from '@/storage/repository';

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export async function decodeAssetAudio(blobKey: string): Promise<AudioBuffer | null> {
  const blob = await getAssetBlob(blobKey);
  if (!blob) return null;
  try {
    return await audioCtx().decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i]! += ch[i]! / buffer.numberOfChannels;
  }
  return out;
}

export function sliceMono(
  mono: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
): Float32Array {
  const a = Math.max(0, Math.floor(startSec * sampleRate));
  const b = Math.min(mono.length, Math.ceil(endSec * sampleRate));
  return mono.slice(a, Math.max(a, b));
}

/** Wrap raw mono PCM in a real AudioBuffer for analysis helpers. */
export function makeMonoBuffer(data: Float32Array, sampleRate: number): AudioBuffer {
  const len = Math.max(1, data.length);
  const OfflineCtor: typeof OfflineAudioContext =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const buf = new OfflineCtor(1, len, sampleRate).createBuffer(1, len, sampleRate);
  buf.getChannelData(0).set(data.length ? data : new Float32Array(1));
  return buf;
}

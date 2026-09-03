/**
 * Offline audio mix (spec §53, §228). Renders every audio-bearing timeline
 * clip through an OfflineAudioContext with per-clip gain, linear fades and
 * pan, plus per-track gain/pan. Used by both export paths; the realtime path
 * just plays the resulting buffer.
 */

import { createLogger } from '@/lib/logger';
import { clipTimelineRange, type Asset, type VideoProject } from '@/domain/types';
import { getAssetBlob } from '@/storage/repository';

const log = createLogger('export');

export async function renderAudioMix(
  project: VideoProject,
  assets: Asset[],
  sampleRate: number,
  durationSec: number,
): Promise<AudioBuffer | null> {
  const { timeline } = project;
  const fps = project.settings.fps;
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const audioTracks = timeline.tracks.filter((t) => t.kind === 'audio' && !t.muted);
  const audioClips = timeline.clips.filter((c) => audioTracks.some((t) => t.id === c.trackId));
  if (audioClips.length === 0) return null;

  const frames = Math.max(1, Math.ceil(durationSec * sampleRate));
  const OfflineCtor: typeof OfflineAudioContext =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const octx = new OfflineCtor(2, frames, sampleRate);

  // Decode each unique asset once.
  const decoded = new Map<string, AudioBuffer>();
  for (const id of new Set(audioClips.map((c) => c.assetId))) {
    const asset = assetById.get(id);
    if (!asset?.blobKey) continue;
    const blob = await getAssetBlob(asset.blobKey);
    if (!blob) continue;
    try {
      decoded.set(id, await octx.decodeAudioData(await blob.arrayBuffer()));
    } catch (e) {
      log.warn('audio decode failed', { id, e });
    }
  }

  for (const clip of audioClips) {
    const buffer = decoded.get(clip.assetId);
    if (!buffer) continue;
    const track = audioTracks.find((t) => t.id === clip.trackId)!;

    const r = clipTimelineRange(clip);
    const when = r.start / fps;
    const lenSec = (r.end - r.start) / fps;
    const offset = clip.sourceIn / fps;

    const src = octx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clip.speed;

    const gain = octx.createGain();
    const base = clip.gain * track.gain;
    gain.gain.setValueAtTime(base, when);
    if (clip.fadeInFrames > 0) {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(base, when + clip.fadeInFrames / fps);
    }
    if (clip.fadeOutFrames > 0) {
      const fs = when + lenSec - clip.fadeOutFrames / fps;
      gain.gain.setValueAtTime(base, Math.max(when, fs));
      gain.gain.linearRampToValueAtTime(0, when + lenSec);
    }

    const panValue = Math.max(-1, Math.min(1, clip.pan + track.pan));
    let tail: AudioNode = gain;
    if (panValue !== 0 && typeof octx.createStereoPanner === 'function') {
      const panner = octx.createStereoPanner();
      panner.pan.value = panValue;
      gain.connect(panner);
      tail = panner;
    }

    src.connect(gain);
    tail.connect(octx.destination);
    try {
      src.start(when, Math.max(0, offset), lenSec);
    } catch {
      /* invalid schedule window */
    }
  }

  return octx.startRendering();
}

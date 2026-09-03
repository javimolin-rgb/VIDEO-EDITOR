/**
 * Loudness normalization (spec §53, §229). Not full ITU-R BS.1770, but an
 * honest RMS-based approximation: measure the mix's RMS in dBFS and return the
 * gain that brings it to a target. Deterministic, testable.
 */

export function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return -Infinity;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sumSq / samples.length);
  return rms <= 1e-8 ? -Infinity : 20 * Math.log10(rms);
}

export function rmsDbFromBuffer(buffer: AudioBuffer): number {
  let sumSq = 0;
  let n = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      sumSq += data[i]! * data[i]!;
      n++;
    }
  }
  if (n === 0) return -Infinity;
  const rms = Math.sqrt(sumSq / n);
  return rms <= 1e-8 ? -Infinity : 20 * Math.log10(rms);
}

/**
 * Linear gain multiplier to move `currentDb` to `targetDb`, clamped to a
 * sane range so a near-silent track isn't blown up to clipping.
 */
export function gainForTarget(currentDb: number, targetDb: number, maxGainDb = 18): number {
  if (!Number.isFinite(currentDb)) return 1;
  const deltaDb = Math.max(-maxGainDb, Math.min(maxGainDb, targetDb - currentDb));
  return Math.pow(10, deltaDb / 20);
}

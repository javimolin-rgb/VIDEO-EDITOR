/**
 * Synthesised "viral-style" sound effects. Fully local — rendered with an
 * OfflineAudioContext, no samples bundled, royalty-free by construction.
 * Each returns a WAV `Blob` the normal media import can add as an asset.
 */

import { audioBufferToWav } from './wav';

export type SfxKind =
  | 'boom'
  | 'sub-drop'
  | 'whoosh'
  | 'swoosh-up'
  | 'swoosh-down'
  | 'riser'
  | 'impact'
  | 'pop'
  | 'tick'
  | 'bell'
  | 'glitch'
  | 'stinger'
  | 'airhorn'
  | 'coin';

export interface SfxDef {
  kind: SfxKind;
  label: string;
  durationSec: number;
}

export const SFX_DEFS: SfxDef[] = [
  { kind: 'boom', label: 'Boom', durationSec: 1.4 },
  { kind: 'sub-drop', label: 'Sub drop', durationSec: 1.6 },
  { kind: 'whoosh', label: 'Whoosh', durationSec: 0.7 },
  { kind: 'swoosh-up', label: 'Swoosh up', durationSec: 0.5 },
  { kind: 'swoosh-down', label: 'Swoosh down', durationSec: 0.5 },
  { kind: 'riser', label: 'Riser', durationSec: 2.0 },
  { kind: 'impact', label: 'Impact hit', durationSec: 0.8 },
  { kind: 'pop', label: 'Pop', durationSec: 0.2 },
  { kind: 'tick', label: 'Tick', durationSec: 0.12 },
  { kind: 'bell', label: 'Notification bell', durationSec: 1.0 },
  { kind: 'glitch', label: 'Glitch', durationSec: 0.5 },
  { kind: 'stinger', label: 'Suspense stinger', durationSec: 1.8 },
  { kind: 'airhorn', label: 'Airhorn-style', durationSec: 1.2 },
  { kind: 'coin', label: 'Coin', durationSec: 0.4 },
];

const SR = 44100;

function noiseBuffer(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.round(seconds * SR));
  const b = ctx.createBuffer(1, len, SR);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Render one SFX to a WAV blob. */
export async function renderSfx(kind: SfxKind): Promise<Blob> {
  const def = SFX_DEFS.find((d) => d.kind === kind)!;
  const dur = def.durationSec + 0.05;
  const ctx = new OfflineAudioContext(1, Math.round(dur * SR), SR);
  const now = 0;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const env = (g: GainNode, a: number, peak: number, d: number, t0 = now) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  };

  switch (kind) {
    case 'boom':
    case 'sub-drop': {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const start = kind === 'sub-drop' ? 140 : 90;
      o.frequency.setValueAtTime(start, now);
      o.frequency.exponentialRampToValueAtTime(28, now + def.durationSec * 0.9);
      env(g, 0.02, 1, def.durationSec);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + dur);
      // click transient
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.05);
      const ng = ctx.createGain();
      env(ng, 0.001, 0.4, 0.05);
      n.connect(ng).connect(master);
      n.start(now);
      break;
    }
    case 'whoosh':
    case 'swoosh-up':
    case 'swoosh-down': {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      const up = kind !== 'swoosh-down';
      bp.frequency.setValueAtTime(up ? 400 : 4000, now);
      bp.frequency.exponentialRampToValueAtTime(up ? 5000 : 300, now + def.durationSec);
      const g = ctx.createGain();
      env(g, 0.08, 0.7, def.durationSec * 0.8);
      n.connect(bp).connect(g).connect(master);
      n.start(now);
      break;
    }
    case 'riser':
    case 'stinger': {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, dur);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(200, now);
      hp.frequency.exponentialRampToValueAtTime(9000, now + def.durationSec);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.8, now + def.durationSec);
      g.gain.exponentialRampToValueAtTime(0.0001, now + def.durationSec + 0.15);
      n.connect(hp).connect(g).connect(master);
      n.start(now);
      if (kind === 'stinger') {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(55, now);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, now);
        og.gain.exponentialRampToValueAtTime(0.4, now + def.durationSec);
        og.gain.exponentialRampToValueAtTime(0.0001, now + def.durationSec + 0.1);
        o.connect(og).connect(master);
        o.start(now);
        o.stop(now + dur);
      }
      break;
    }
    case 'impact': {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, 0.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1600;
      const g = ctx.createGain();
      env(g, 0.002, 1, 0.5);
      n.connect(lp).connect(g).connect(master);
      n.start(now);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(40, now + 0.3);
      const og = ctx.createGain();
      env(og, 0.002, 0.9, 0.35);
      o.connect(og).connect(master);
      o.start(now);
      o.stop(now + dur);
      break;
    }
    case 'pop':
    case 'tick':
    case 'coin': {
      const o = ctx.createOscillator();
      o.type = kind === 'coin' ? 'square' : 'sine';
      const f = kind === 'tick' ? 2200 : kind === 'coin' ? 990 : 700;
      o.frequency.setValueAtTime(f, now);
      if (kind === 'pop') o.frequency.exponentialRampToValueAtTime(180, now + 0.12);
      if (kind === 'coin') o.frequency.setValueAtTime(1320, now + 0.08);
      const g = ctx.createGain();
      env(g, 0.001, 0.8, def.durationSec);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + dur);
      break;
    }
    case 'bell': {
      [880, 1320, 1760].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        env(g, 0.005, 0.5 / (i + 1), def.durationSec - i * 0.1);
        o.connect(g).connect(master);
        o.start(now);
        o.stop(now + dur);
      });
      break;
    }
    case 'glitch': {
      for (let i = 0; i < 6; i++) {
        const t0 = now + i * 0.07;
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = 200 + Math.random() * 3000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
        o.connect(g).connect(master);
        o.start(t0);
        o.stop(t0 + 0.06);
      }
      break;
    }
    case 'airhorn': {
      [233, 277, 349].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.4, now + 0.05);
        g.gain.setValueAtTime(0.4, now + def.durationSec - 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, now + def.durationSec);
        o.connect(g).connect(master);
        o.start(now);
        o.stop(now + dur);
      });
      break;
    }
  }

  const rendered = await ctx.startRendering();
  return audioBufferToWav(rendered);
}

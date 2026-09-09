import { useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { SilenceMode } from '@/audio/silence';
import { SoundBank } from './SoundBank';

/** Track mixer + local audio cleanup (spec §53, §47, §228). */
export function AudioPanel() {
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeSilences = useProjectStore((s) => s.removeSilences);
  const localJob = useProjectStore((s) => s.localJob);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const pushToast = useUIStore((s) => s.pushToast);
  const [mode, setMode] = useState<SilenceMode>('balanced');
  if (!project) return null;

  const audioTracks = project.timeline.tracks.filter((t) => t.kind === 'audio');
  const selClip = project.timeline.clips.find((c) => c.id === selectedClipIds[0]);
  const busy = localJob?.kind === 'silence';

  return (
    <div>
      <div className="model-row" style={{ display: 'block', padding: 10, marginBottom: 12 }}>
        <strong style={{ fontSize: 12 }}>Remove silences (local)</strong>
        <div className="muted" style={{ fontSize: 11, margin: '4px 0 8px' }}>
          Detects quiet gaps in the selected clip's audio and ripple-deletes them. Pure on-device
          DSP — no model, undoable.
        </div>
        <div className="rowfields">
          <select value={mode} onChange={(e) => setMode(e.target.value as SilenceMode)}>
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
          </select>
          <button
            className="primary"
            disabled={!selClip || busy}
            onClick={async () => {
              if (!selClip) return;
              const res = await removeSilences(selClip.id, mode);
              if (res) {
                pushToast(
                  res.cuts === 0 ? 'info' : 'success',
                  res.cuts === 0
                    ? 'No silence found at this threshold.'
                    : `Removed ${res.cuts} silences (${res.removedSec.toFixed(1)}s).`,
                );
              }
            }}
          >
            {busy ? localJob?.message ?? 'Working…' : 'Remove silences'}
          </button>
        </div>
        {!selClip && (
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Select a clip on the timeline first.
          </div>
        )}
      </div>

      <SoundBank />

      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Track mixer. Per-clip gain, pan and fades live in the Inspector; EQ, compression and
        automatic ducking arrive in Phase 2.5.
      </div>

      {audioTracks.map((t) => (
        <div key={t.id} className="model-row" style={{ display: 'block', padding: 10 }}>
          <div className="row">
            <strong>{t.name}</strong>
            <span className="spacer" />
            <button
              className={t.muted ? 'primary' : 'ghost'}
              style={{ padding: '2px 8px' }}
              onClick={() => updateTrack(t.id, { muted: !t.muted })}
            >
              {t.muted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Gain — {Math.round(t.gain * 100)}%</label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={t.gain}
              onChange={(e) => updateTrack(t.id, { gain: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Pan — {t.pan === 0 ? 'C' : t.pan < 0 ? `L${Math.round(-t.pan * 100)}` : `R${Math.round(t.pan * 100)}`}</label>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.02}
              value={t.pan}
              onChange={(e) => updateTrack(t.id, { pan: Number(e.target.value) })}
            />
          </div>
        </div>
      ))}
      {audioTracks.length === 0 && <div className="muted">No audio tracks.</div>}
    </div>
  );
}

import { useProjectStore } from '@/state/projectStore';

/** Track mixer (spec §53, §228 — Phase 2 subset: gain + pan + mute). */
export function AudioPanel() {
  const project = useProjectStore((s) => s.project);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  if (!project) return null;

  const audioTracks = project.timeline.tracks.filter((t) => t.kind === 'audio');

  return (
    <div>
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

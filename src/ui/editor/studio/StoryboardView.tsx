import { useEffect } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useGenStore } from '@/state/genStore';
import { useUIStore } from '@/state/uiStore';
import { orderedShots, totalDurationSec } from '@/domain/storyboard';
import type { ShotState } from '@/domain/types';

const CAMERAS = ['static', 'dolly-in', 'dolly-out', 'pan-left', 'pan-right', 'orbit', 'crane-up', 'handheld'];
const STYLES = ['cinematic', 'editorial', 'fashion', 'documentary', 'commercial', 'analog', 'minimal'];

const STATE_PILL: Record<ShotState, string> = {
  draft: '',
  queued: 'warn',
  generating: 'warn',
  ready: 'good',
  failed: 'warn',
};

/** Storyboard mode (spec §38, §204) — the multi-shot path for long-form. */
export function StoryboardView() {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const addShot = useProjectStore((s) => s.addStoryboardShot);
  const updateShot = useProjectStore((s) => s.updateStoryboardShot);
  const removeShot = useProjectStore((s) => s.removeStoryboardShot);
  const moveShot = useProjectStore((s) => s.moveStoryboardShot);
  const generateShot = useGenStore((s) => s.generateShot);
  const generateAll = useGenStore((s) => s.generateAllShots);
  const assemble = useGenStore((s) => s.assembleStoryboard);
  const analyzeContinuity = useGenStore((s) => s.analyzeContinuity);
  const continuity = useGenStore((s) => s.continuity);
  const pushToast = useUIStore((s) => s.pushToast);

  const clipSig = project?.timeline.clips.map((c) => c.id + c.assetId).join('|') ?? '';
  useEffect(() => {
    const t = setTimeout(() => void analyzeContinuity(), 250);
    return () => clearTimeout(t);
  }, [clipSig, analyzeContinuity]);

  if (!project) return null;
  const shots = orderedShots(project.storyboard);
  const readyCount = shots.filter((s) => s.state === 'ready').length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="row">
        <h3>Storyboard</h3>
        <span className="muted" style={{ fontSize: 11 }}>
          {shots.length} shots · {totalDurationSec(shots).toFixed(0)}s
        </span>
        <span className="spacer" />
        <button onClick={() => addShot()}>+ Shot</button>
        <button disabled={shots.length === 0} onClick={() => void generateAll()}>
          Generate all
        </button>
        <button
          className="primary"
          disabled={readyCount === 0}
          onClick={() => {
            assemble();
            pushToast('success', `Assembled ${readyCount} shots onto the timeline.`);
          }}
        >
          Assemble → timeline
        </button>
      </div>

      {continuity && continuity.pairs.length > 0 && (
        <div className="muted" style={{ fontSize: 11, margin: '8px 0' }}>
          Timeline continuity: {(continuity.overall * 100).toFixed(0)}%
          {continuity.weak.length > 0 && ` · ${continuity.weak.length} jarring cut(s)`}
        </div>
      )}

      {shots.length === 0 && (
        <div className="notice" style={{ marginTop: 10 }}>
          Break a long video into shots. Each shot generates independently; “carry continuity”
          seeds a shot with the previous shot’s final frame (spec §40). Then assemble them onto the
          timeline in order.
        </div>
      )}

      <div className="col" style={{ gap: 10, marginTop: 12 }}>
        {shots.map((shot, i) => {
          const asset = assets.find((a) => a.id === shot.assetId);
          return (
            <div key={shot.id} className="model-row" style={{ display: 'block', padding: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong style={{ fontSize: 12 }}>#{i + 1}</strong>
                <input
                  value={shot.title}
                  onChange={(e) => updateShot(shot.id, { title: e.target.value })}
                  style={{ maxWidth: 200 }}
                />
                <span className={`pill ${STATE_PILL[shot.state]}`}>{shot.state}</span>
                <span className="spacer" />
                <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveShot(shot.id, -1)}>
                  ↑
                </button>
                <button className="ghost" style={{ padding: '2px 6px' }} onClick={() => moveShot(shot.id, 1)}>
                  ↓
                </button>
                <button className="ghost danger" style={{ padding: '2px 6px' }} onClick={() => removeShot(shot.id)}>
                  ✕
                </button>
              </div>

              <div className="row" style={{ gap: 10, marginTop: 8, alignItems: 'flex-start' }}>
                <div
                  className="thumb"
                  style={{ width: 120, height: 68, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}
                >
                  {asset?.thumbnailDataUrl ? (
                    <img src={asset.thumbnailDataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span className="muted" style={{ fontSize: 10 }}>no clip yet</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <textarea
                    rows={2}
                    placeholder="Shot description…"
                    value={shot.prompt}
                    onChange={(e) => updateShot(shot.id, { prompt: e.target.value })}
                  />
                  <div className="rowfields" style={{ marginTop: 6 }}>
                    <select value={shot.camera} onChange={(e) => updateShot(shot.id, { camera: e.target.value })}>
                      {CAMERAS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select value={shot.style} onChange={(e) => updateShot(shot.id, { style: e.target.value })}>
                      {STYLES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <label className="row" style={{ fontSize: 11, flex: 1 }}>
                      Duration
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={shot.durationSec}
                        onChange={(e) => updateShot(shot.id, { durationSec: Math.max(1, Number(e.target.value)) })}
                        style={{ width: 60, marginLeft: 6 }}
                      />
                    </label>
                    <label className="row" style={{ fontSize: 11 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={shot.carryContinuity}
                        onChange={(e) => updateShot(shot.id, { carryContinuity: e.target.checked })}
                      />
                      carry continuity
                    </label>
                    <button
                      className="primary"
                      style={{ padding: '2px 10px' }}
                      disabled={shot.state === 'queued' || shot.state === 'generating'}
                      onClick={() => void generateShot(shot.id)}
                    >
                      {shot.state === 'ready' ? 'Regenerate' : 'Generate'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

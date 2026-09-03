import { useEffect, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore, type RightPanel } from '@/state/uiStore';
import { getClip } from '@/domain/timeline/operations';
import type { AspectRatioId, ProjectVersion } from '@/domain/types';
import { ASPECT_PRESETS } from '@/domain/project';

const TABS: { id: RightPanel; label: string }[] = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

export function RightDock() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  return (
    <div className="panel">
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={rightPanel === t.id ? 'active' : ''}
            onClick={() => setRightPanel(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {rightPanel === 'inspector' && <Inspector />}
        {rightPanel === 'activity' && <Activity />}
        {rightPanel === 'settings' && <Settings />}
      </div>
    </div>
  );
}

function Inspector() {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const mutate = useProjectStore((s) => s.mutate);
  const setAssetRole = useProjectStore((s) => s.setAssetRole);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectedAssetId = useUIStore((s) => s.selectedAssetId);

  if (!project) return null;
  const clip = selectedClipIds.length === 1 ? getClip(project.timeline, selectedClipIds[0]!) : undefined;

  if (clip) {
    const asset = assets.find((a) => a.id === clip.assetId);
    const patch = (fn: (c: NonNullable<typeof clip>) => void, label: string) =>
      mutate((draft) => {
        const target = draft.timeline.clips.find((c) => c.id === clip.id);
        if (target) fn(target);
      }, label);

    return (
      <div>
        <h3 style={{ marginBottom: 10 }}>{asset?.name ?? 'Clip'}</h3>
        <div className="field">
          <label>Label</label>
          <input
            value={clip.label ?? ''}
            placeholder={asset?.name ?? ''}
            onChange={(e) => patch((c) => (c.label = e.target.value || null), 'Rename clip')}
          />
        </div>
        <div className="field">
          <label>Opacity — {(clip.opacity * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={clip.opacity}
            onChange={(e) => patch((c) => (c.opacity = Number(e.target.value)), 'Set opacity')}
          />
        </div>
        <div className="field">
          <label>Gain — {(clip.gain * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={clip.gain}
            onChange={(e) => patch((c) => (c.gain = Number(e.target.value)), 'Set gain')}
          />
        </div>
        <div className="field">
          <label>Speed — {clip.speed.toFixed(2)}×</label>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={clip.speed}
            onChange={(e) => patch((c) => (c.speed = Number(e.target.value)), 'Set speed')}
          />
        </div>
        <div className="field">
          <label>Fades (frames)</label>
          <div className="rowfields">
            <input
              type="number"
              min={0}
              value={clip.fadeInFrames}
              onChange={(e) =>
                patch((c) => (c.fadeInFrames = Math.max(0, Number(e.target.value))), 'Set fade in')
              }
            />
            <input
              type="number"
              min={0}
              value={clip.fadeOutFrames}
              onChange={(e) =>
                patch((c) => (c.fadeOutFrames = Math.max(0, Number(e.target.value))), 'Set fade out')
              }
            />
          </div>
        </div>
        <div className="muted mono" style={{ fontSize: 11 }}>
          src {clip.sourceIn}–{clip.sourceOut}f · timeline @{clip.timelineStart}f
        </div>
      </div>
    );
  }

  if (selectedClipIds.length > 1) {
    return <div className="muted">{selectedClipIds.length} clips selected.</div>;
  }

  const asset = assets.find((a) => a.id === selectedAssetId);
  if (asset) {
    return (
      <div>
        <h3 style={{ marginBottom: 10 }}>{asset.name}</h3>
        <div className="field">
          <label>Role</label>
          <select
            value={asset.role}
            onChange={(e) => void setAssetRole(asset.id, e.target.value as typeof asset.role)}
          >
            <option value="source">Source footage</option>
            <option value="reference">Reference</option>
            <option value="brand">Brand asset</option>
            <option value="generated">Generated</option>
            <option value="output">Output</option>
          </select>
        </div>
        <table className="mono" style={{ fontSize: 11, color: 'var(--text-1)' }}>
          <tbody>
            <tr>
              <td>kind</td>
              <td>{asset.kind}</td>
            </tr>
            <tr>
              <td>duration</td>
              <td>{asset.meta.durationSec != null ? `${asset.meta.durationSec.toFixed(2)} s` : '—'}</td>
            </tr>
            <tr>
              <td>size</td>
              <td>
                {asset.meta.width && asset.meta.height
                  ? `${asset.meta.width}×${asset.meta.height}`
                  : '—'}
              </td>
            </tr>
            <tr>
              <td>type</td>
              <td>{asset.meta.mimeType}</td>
            </tr>
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
          Codec / container fps are shown only when the browser can report them reliably.
        </div>
      </div>
    );
  }

  return <div className="muted">Select a clip or an asset to see its properties.</div>;
}

function Activity() {
  const log = useProjectStore((s) => s.activityLog());
  return (
    <div className="activity">
      {log.length === 0 && <div className="muted">No changes yet.</div>}
      {log.map((e) => (
        <div key={e.id} className="entry">
          <span className="time">{new Date(e.at).toLocaleTimeString()}</span>
          <span className={`pill ${e.kind === 'ai' ? 'warn' : ''}`} style={{ fontSize: 10 }}>
            {e.kind}
          </span>
          <span>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

function Settings() {
  const project = useProjectStore((s) => s.project);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const setAiInstructions = useProjectStore((s) => s.setAiInstructions);
  const createVersion = useProjectStore((s) => s.createVersion);
  const listVersions = useProjectStore((s) => s.listProjectVersions);
  const openSnapshot = useProjectStore((s) => s.openSnapshot);
  const pushToast = useUIStore((s) => s.pushToast);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);

  const refresh = () => void listVersions().then(setVersions);
  useEffect(refresh, [listVersions]);
  if (!project) return null;

  return (
    <div>
      <div className="field">
        <label>Aspect ratio</label>
        <select
          value={project.settings.aspectRatio}
          onChange={(e) => {
            const id = e.target.value as AspectRatioId;
            const res = id === 'custom' ? project.settings.resolution : ASPECT_PRESETS[id];
            updateSettings({ aspectRatio: id, resolution: res });
          }}
        >
          {(['16:9', '9:16', '1:1', '4:5', '21:9'] as const).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>
          Resolution — {project.settings.resolution.width}×{project.settings.resolution.height}
        </label>
        <div className="rowfields">
          <input
            type="number"
            value={project.settings.resolution.width}
            onChange={(e) =>
              updateSettings({
                resolution: { ...project.settings.resolution, width: Number(e.target.value) },
                aspectRatio: 'custom',
              })
            }
          />
          <input
            type="number"
            value={project.settings.resolution.height}
            onChange={(e) =>
              updateSettings({
                resolution: { ...project.settings.resolution, height: Number(e.target.value) },
                aspectRatio: 'custom',
              })
            }
          />
        </div>
      </div>
      <div className="field">
        <label>Frame rate</label>
        <select
          value={project.settings.fps}
          onChange={(e) => updateSettings({ fps: Number(e.target.value) })}
        >
          {[24, 25, 30, 50, 60].map((f) => (
            <option key={f} value={f}>
              {f} fps
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Background</label>
        <input
          type="color"
          value={project.settings.backgroundColor}
          onChange={(e) => updateSettings({ backgroundColor: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Creative direction / AI instructions</label>
        <textarea
          rows={4}
          value={project.meta.aiInstructions}
          placeholder="e.g. warm editorial look, slow camera moves, elegant pacing…"
          onChange={(e) => setAiInstructions(e.target.value)}
        />
      </div>

      <h4 style={{ margin: '14px 0 8px' }}>Versions</h4>
      <button
        onClick={() => {
          void createVersion(`Snapshot ${new Date().toLocaleString()}`).then(() => {
            refresh();
            pushToast('success', 'Version saved');
          });
        }}
      >
        Save version
      </button>
      <div className="col" style={{ marginTop: 8 }}>
        {versions.map((v) => (
          <div key={v.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted" style={{ fontSize: 11 }}>
              {v.label}
            </span>
            <button
              className="ghost"
              onClick={() => {
                openSnapshot(v.snapshot);
                pushToast('info', 'Version restored into the editor');
              }}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

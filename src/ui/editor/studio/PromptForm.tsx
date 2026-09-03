import { useState } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { composePrompt, type CameraMove, type MotionLevel, type StyleId } from '@/ai/gen/prompt';

const CAMERAS: CameraMove[] = [
  'static',
  'dolly-in',
  'dolly-out',
  'pan-left',
  'pan-right',
  'tilt-up',
  'tilt-down',
  'orbit',
  'crane-up',
  'handheld',
];
const STYLES: StyleId[] = [
  'cinematic',
  'editorial',
  'fashion',
  'documentary',
  'commercial',
  'realistic',
  'analog',
  'minimal',
  'music-video',
  'architectural',
];
const MOTIONS: MotionLevel[] = ['low', 'medium', 'high'];

export function PromptForm() {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const { mode, draft } = useGenStore((s) => ({ mode: s.mode, draft: s.draft }));
  const setRaw = useGenStore((s) => s.setRaw);
  const patch = useGenStore((s) => s.patchStructured);
  const setDuration = useGenStore((s) => s.setDuration);
  const setSeed = useGenStore((s) => s.setSeed);
  const toggleSeedLock = useGenStore((s) => s.toggleSeedLock);
  const setFirstFrame = useGenStore((s) => s.setFirstFrame);
  const setQuality = useGenStore((s) => s.setQuality);
  const generate = useGenStore((s) => s.generate);
  const jobs = useGenStore((s) => s.jobs);
  const [advanced, setAdvanced] = useState(false);

  if (!project) return null;
  const running = jobs.some((j) => !['ready', 'failed', 'cancelled'].includes(j.status.phase));
  const images = assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  return (
    <div>
      {mode === 'image-to-video' && (
        <div className="field">
          <label>First frame</label>
          <select
            value={draft.firstFrameAssetId ?? ''}
            onChange={(e) => setFirstFrame(e.target.value || null)}
          >
            <option value="">Pick an image / clip…</option>
            {images.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Prompt</label>
        <textarea
          rows={3}
          placeholder="e.g. model walking on a Mediterranean rooftop at golden hour, slow dolly in, wind in the fabric"
          value={draft.raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>

      <div className="rowfields">
        <div className="field">
          <label>Style</label>
          <select
            value={draft.structured.style}
            onChange={(e) => patch({ style: e.target.value as StyleId })}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Camera</label>
          <select
            value={draft.structured.camera}
            onChange={(e) => patch({ camera: e.target.value as CameraMove })}
          >
            {CAMERAS.map((c) => (
              <option key={c} value={c}>
                {c.replace('-', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rowfields">
        <div className="field">
          <label>Motion</label>
          <select
            value={draft.structured.motion}
            onChange={(e) => patch({ motion: e.target.value as MotionLevel })}
          >
            {MOTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Duration — {draft.durationSec}s</label>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={draft.durationSec}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
      </div>

      <label className="row" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={advanced}
          onChange={(e) => setAdvanced(e.target.checked)}
        />
        Advanced
      </label>

      {advanced && (
        <div className="model-row" style={{ display: 'block', padding: 10 }}>
          <div className="field">
            <label>Colour mood</label>
            <input
              value={draft.structured.colorMood}
              onChange={(e) => patch({ colorMood: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Lighting</label>
            <input
              value={draft.structured.lighting}
              onChange={(e) => patch({ lighting: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Constraints (comma separated)</label>
            <input
              value={draft.structured.constraints.join(', ')}
              onChange={(e) =>
                patch({
                  constraints: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Seed</label>
              <input
                type="number"
                value={draft.seed ?? ''}
                placeholder="random"
                onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <button
              className={draft.seedLocked ? 'primary' : ''}
              style={{ alignSelf: 'flex-end', marginBottom: 10 }}
              onClick={toggleSeedLock}
              title="Lock the seed for reproducible output"
            >
              {draft.seedLocked ? 'Locked' : 'Lock'}
            </button>
          </div>
          <div className="field">
            <label>Render quality — {(draft.quality * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={draft.quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      <div className="field">
        <label>Model-facing prompt</label>
        <div className="muted mono" style={{ fontSize: 11, lineHeight: 1.5 }}>
          {composePrompt(draft.structured)}
        </div>
      </div>

      <button
        className="primary"
        style={{ width: '100%' }}
        disabled={running || !draft.raw.trim()}
        onClick={() => void generate()}
      >
        {running ? 'Generating…' : `Generate ${mode === 'text-to-video' ? 'from text' : 'from image'}`}
      </button>
    </div>
  );
}

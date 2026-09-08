import { useState } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { useT } from '@/i18n';
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
  const t = useT();

  if (!project) return null;
  const running = jobs.some((j) => !['ready', 'failed', 'cancelled'].includes(j.status.phase));
  const images = assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  return (
    <div>
      {mode === 'image-to-video' && (
        <div className="field">
          <label>{t('form.firstFrame')}</label>
          <select
            value={draft.firstFrameAssetId ?? ''}
            onChange={(e) => setFirstFrame(e.target.value || null)}
          >
            <option value="">{t('form.pickImage')}</option>
            {images.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>{t('form.prompt')}</label>
        <textarea
          rows={3}
          placeholder={t('form.promptPlaceholder')}
          value={draft.raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </div>

      <div className="rowfields">
        <div className="field">
          <label>{t('form.style')}</label>
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
          <label>{t('form.camera')}</label>
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
          <label>{t('form.motion')}</label>
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
          <label>{t('form.duration', { n: draft.durationSec })}</label>
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
        {t('form.advanced')}
      </label>

      {advanced && (
        <div className="model-row" style={{ display: 'block', padding: 10 }}>
          <div className="field">
            <label>{t('form.colorMood')}</label>
            <input
              value={draft.structured.colorMood}
              onChange={(e) => patch({ colorMood: e.target.value })}
            />
          </div>
          <div className="field">
            <label>{t('form.lighting')}</label>
            <input
              value={draft.structured.lighting}
              onChange={(e) => patch({ lighting: e.target.value })}
            />
          </div>
          <div className="field">
            <label>{t('form.constraints')}</label>
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
              <label>{t('form.seed')}</label>
              <input
                type="number"
                value={draft.seed ?? ''}
                placeholder={t('form.random')}
                onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <button
              className={draft.seedLocked ? 'primary' : ''}
              style={{ alignSelf: 'flex-end', marginBottom: 10 }}
              onClick={toggleSeedLock}
              title={t('form.lock')}
            >
              {draft.seedLocked ? t('form.locked') : t('form.lock')}
            </button>
          </div>
          <div className="field">
            <label>{t('form.renderQuality', { n: (draft.quality * 100).toFixed(0) })}</label>
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
        <label>{t('form.modelPrompt')}</label>
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
        {running
          ? t('form.generating')
          : mode === 'text-to-video'
            ? t('form.generateFromText')
            : t('form.generateFromImage')}
      </button>
    </div>
  );
}

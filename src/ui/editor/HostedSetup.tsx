import { useState } from 'react';
import { useT } from '@/i18n';
import {
  loadHostedConfig,
  saveHostedConfig,
  type HostedConfig,
} from '@/ai/providers/hosted/config';

/** Curated model routes. LTX-2 (github.com/Lightricks/LTX-2) is the recommended
 *  open model; the exact fal slug moves, so the field stays editable. */
const FAL_PRESETS: { label: string; route: string }[] = [
  { label: 'LTX-2 · image → video (Lightricks, open)', route: 'fal-ai/ltxv-2/image-to-video' },
  { label: 'LTX-2 · text → video (Lightricks, open)', route: 'fal-ai/ltxv-2/text-to-video' },
  { label: 'LTX-Video 13B v0.9.8 · image → video', route: 'fal-ai/ltx-video-13b-098/image-to-video' },
  { label: 'LTX-Video 13B v0.9.8 · text → video', route: 'fal-ai/ltx-video-13b-098/text-to-video' },
  { label: 'Kling 1.6 standard · image → video', route: 'fal-ai/kling-video/v1.6/standard/image-to-video' },
  { label: 'Wan 2.2 · image → video', route: 'fal-ai/wan/v2.2-a14b/image-to-video' },
];

/**
 * Optional online generation backends (spec §94 — opt-in). Pollinations is
 * keyless and free (image + camera move). fal.ai is real video diffusion with
 * the user's own key. Both are off in the core path until enabled here.
 */
export function HostedSetup() {
  const t = useT();
  const [cfg, setCfg] = useState<HostedConfig>(loadHostedConfig());

  const persist = (next: HostedConfig) => {
    setCfg(next);
    saveHostedConfig(next);
  };

  return (
    <div>
      <h4 style={{ margin: '22px 0 8px' }}>{t('hosted.title')}</h4>
      <p className="muted" style={{ fontSize: 12 }}>
        {t('hosted.intro')}
      </p>

      {/* Hugging Face Space — the default free path */}
      <div className="model-row" style={{ display: 'block', padding: 12 }}>
        <label className="row" style={{ fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={cfg.hfSpace.enabled}
            onChange={(e) => persist({ ...cfg, hfSpace: { enabled: e.target.checked } })}
          />
          {t('hosted.hfSpace')}
        </label>
        <div className="muted" style={{ fontSize: 11, margin: '6px 0 4px' }}>
          {t('hosted.hfSpaceNote')}
        </div>
      </div>

      {/* Pollinations (manual — CAPTCHA-walled) */}
      <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 8 }}>
        <label className="row" style={{ fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={cfg.pollinations.enabled}
            onChange={(e) =>
              persist({
                ...cfg,
                pollinations: { ...cfg.pollinations, enabled: e.target.checked },
              })
            }
          />
          {t('hosted.pollinations')}
        </label>
        <div className="muted" style={{ fontSize: 11, margin: '6px 0 10px' }}>
          {t('hosted.pollinationsNote')}
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label>{t('hosted.imageModel')}</label>
          <select
            value={cfg.pollinations.model}
            onChange={(e) =>
              persist({
                ...cfg,
                pollinations: {
                  ...cfg.pollinations,
                  model: e.target.value as HostedConfig['pollinations']['model'],
                },
              })
            }
          >
            <option value="flux">Default — best detail</option>
            <option value="turbo">Turbo — faster</option>
          </select>
        </div>
      </div>

      {/* fal.ai */}
      <div className="model-row" style={{ display: 'block', padding: 12, marginTop: 8 }}>
        <label className="row" style={{ fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={cfg.fal.enabled}
            onChange={(e) => persist({ ...cfg, fal: { ...cfg.fal, enabled: e.target.checked } })}
          />
          {t('hosted.fal')}
        </label>
        <div className="muted" style={{ fontSize: 11, margin: '6px 0 10px' }}>
          {t('hosted.falNote')}{' '}
          <a href="https://fal.ai/dashboard/keys" target="_blank" rel="noreferrer">
            fal.ai/dashboard/keys
          </a>
        </div>
        <div className="field">
          <label>{t('hosted.apiKey')}</label>
          <input
            type="password"
            autoComplete="off"
            placeholder="fal_…"
            value={cfg.fal.apiKey}
            onChange={(e) => persist({ ...cfg, fal: { ...cfg.fal, apiKey: e.target.value } })}
          />
        </div>
        <div className="field">
          <label>{t('hosted.falModel')}</label>
          <select
            value={FAL_PRESETS.some((p) => p.route === cfg.fal.model) ? cfg.fal.model : '__custom'}
            onChange={(e) => {
              if (e.target.value !== '__custom')
                persist({ ...cfg, fal: { ...cfg.fal, model: e.target.value } });
            }}
          >
            {FAL_PRESETS.map((p) => (
              <option key={p.route} value={p.route}>
                {p.label}
              </option>
            ))}
            <option value="__custom">{t('hosted.falModelCustom')}</option>
          </select>
          <input
            style={{ marginTop: 6 }}
            value={cfg.fal.model}
            onChange={(e) => persist({ ...cfg, fal: { ...cfg.fal, model: e.target.value.trim() } })}
          />
          <div className="muted" style={{ fontSize: 11 }}>
            {t('hosted.falModelHint')}{' '}
            <a href="https://fal.ai/models?keywords=ltx" target="_blank" rel="noreferrer">
              fal.ai/models
            </a>{' '}
            ·{' '}
            <a href="https://github.com/Lightricks/LTX-2" target="_blank" rel="noreferrer">
              LTX-2 weights
            </a>
          </div>
        </div>
      </div>

      <div className="notice" style={{ marginTop: 12, fontSize: 12 }}>
        {t('hosted.disclosure')}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useT } from '@/i18n';
import {
  loadHostedConfig,
  saveHostedConfig,
  type HostedConfig,
} from '@/ai/providers/hosted/config';

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

      {/* Pollinations */}
      <div className="model-row" style={{ display: 'block', padding: 12 }}>
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
            <option value="flux">flux — balanced</option>
            <option value="flux-realism">flux-realism — photographic</option>
            <option value="turbo">turbo — fastest</option>
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
          <input
            value={cfg.fal.model}
            onChange={(e) => persist({ ...cfg, fal: { ...cfg.fal, model: e.target.value.trim() } })}
          />
          <div className="muted" style={{ fontSize: 11 }}>
            {t('hosted.falModelHint')}
          </div>
        </div>
      </div>

      <div className="notice" style={{ marginTop: 12, fontSize: 12 }}>
        {t('hosted.disclosure')}
      </div>
    </div>
  );
}

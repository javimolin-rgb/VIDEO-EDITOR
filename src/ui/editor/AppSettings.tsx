import { useState } from 'react';
import { useSettingsStore, type LanguageId, type ThemeId } from '@/state/settingsStore';
import { useUIStore } from '@/state/uiStore';
import { downloadDiagnostics } from '@/lib/diagnostics';
import { getFps } from '@/lib/fps';
import { useT } from '@/i18n';
import { GitHubSync } from './GitHubSync';

/** App-level appearance + accessibility + diagnostics (spec §143, §144, §246). */
export function AppSettings() {
  const s = useSettingsStore();
  const t = useT();
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div>
      <h4 style={{ margin: '18px 0 8px' }}>{t('settings.appearance')}</h4>

      <div className="field">
        <label>{t('settings.theme')}</label>
        <select value={s.theme} onChange={(e) => s.setTheme(e.target.value as ThemeId)}>
          <option value="dark">{t('settings.theme.dark')}</option>
          <option value="high-contrast">{t('settings.theme.highContrast')}</option>
          <option value="light">{t('settings.theme.light')}</option>
        </select>
      </div>

      <div className="field">
        <label>
          {t('settings.uiScale')} — {(s.uiScale * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0.85}
          max={1.4}
          step={0.05}
          value={s.uiScale}
          onChange={(e) => s.setUiScale(Number(e.target.value))}
        />
      </div>

      <div className="field">
        <label>{t('settings.language')}</label>
        <select value={s.language} onChange={(e) => s.setLanguage(e.target.value as LanguageId)}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      <div className="field">
        <label>{t('settings.reducedMotion')}</label>
        <select
          value={String(s.reducedMotion)}
          onChange={(e) =>
            s.setReducedMotion(e.target.value === 'system' ? 'system' : e.target.value === 'true')
          }
        >
          <option value="system">{t('settings.reducedMotion.system')}</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {t('settings.telemetry')}
      </div>

      <h4 style={{ margin: '18px 0 8px' }} className="row">
        <span>{t('debug.title')}</span>
        <span className="spacer" />
        <button className="ghost" onClick={() => setShowDebug((v) => !v)}>
          {showDebug ? t('common.close') : 'Show'}
        </button>
      </h4>

      {showDebug && <DebugBody />}

      <GitHubSync />
    </div>
  );
}

function DebugBody() {
  const t = useT();
  const pushToast = useUIStore((x) => x.pushToast);

  return (
    <div className="model-row" style={{ display: 'block', padding: 10 }}>
      <div className="muted mono" style={{ fontSize: 11 }}>
        {t('debug.fps')}: {getFps()} · build {typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        A diagnostics file contains your hardware profile, model states, the generation queue,
        storage usage and recent logs — no media, no personal data beyond project names.
      </div>
      <button
        style={{ marginTop: 8 }}
        onClick={() => {
          void downloadDiagnostics().then(() => pushToast('success', 'Diagnostics downloaded.'));
        }}
      >
        {t('debug.export')}
      </button>
    </div>
  );
}

import { useUIStore, type LeftPanel } from '@/state/uiStore';
import { useT, type MessageKey } from '@/i18n';
import { MediaPanel } from './MediaPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { AudioPanel } from './panels/AudioPanel';
import { TextPanel } from './panels/TextPanel';

const TABS: { id: LeftPanel; key: MessageKey; icon: string }[] = [
  { id: 'media', key: 'dock.media', icon: '🎬' },
  { id: 'generate', key: 'dock.ai', icon: '✦' },
  { id: 'effects', key: 'dock.effects', icon: '✨' },
  { id: 'audio', key: 'dock.audio', icon: '🎵' },
  { id: 'text', key: 'dock.text', icon: 'T' },
];

export function LeftDock({ asSheet = false, onClose }: { asSheet?: boolean; onClose?: () => void }) {
  const t = useT();
  const leftPanel = useUIStore((s) => s.leftPanel);
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);
  const setWorkspace = useUIStore((s) => s.setWorkspace);

  return (
    <div className={`panel${asSheet ? ' as-sheet' : ''}`}>
      {asSheet && (
        <div className="sheet-head">
          <span className="grip" aria-hidden />
          <h4>{t('nav.library')}</h4>
          <span className="spacer" />
          <button className="ghost" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
      )}
      <div className="panel-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={leftPanel === tab.id}
            className={leftPanel === tab.id ? 'active' : ''}
            onClick={() => setLeftPanel(tab.id)}
          >
            <span aria-hidden>{tab.icon}</span>
            {t(tab.key)}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {leftPanel === 'media' && <MediaPanel />}
        {leftPanel === 'effects' && <EffectsPanel />}
        {leftPanel === 'audio' && <AudioPanel />}
        {leftPanel === 'text' && <TextPanel />}
        {leftPanel === 'generate' && (
          <div className="notice info">
            {t('studio.resultHint')}
            <div style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => setWorkspace('studio')}>
                {t('studio.title')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

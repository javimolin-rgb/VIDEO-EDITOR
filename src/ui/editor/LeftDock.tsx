import { useUIStore, type LeftPanel } from '@/state/uiStore';
import { MediaPanel } from './MediaPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { AudioPanel } from './panels/AudioPanel';
import { TextPanel } from './panels/TextPanel';

const TABS: { id: LeftPanel; label: string; icon: string }[] = [
  { id: 'media', label: 'Media', icon: '🎬' },
  { id: 'generate', label: 'AI', icon: '✦' },
  { id: 'effects', label: 'Effects', icon: '✨' },
  { id: 'audio', label: 'Audio', icon: '🎵' },
  { id: 'text', label: 'Text', icon: 'T' },
];

export function LeftDock({ asSheet = false, onClose }: { asSheet?: boolean; onClose?: () => void }) {
  const leftPanel = useUIStore((s) => s.leftPanel);
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);
  const setWorkspace = useUIStore((s) => s.setWorkspace);

  return (
    <div className={`panel${asSheet ? ' as-sheet' : ''}`}>
      {asSheet && (
        <div className="sheet-head">
          <span className="grip" aria-hidden />
          <h4>Library</h4>
          <span className="spacer" />
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      )}
      <div className="panel-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={leftPanel === t.id}
            className={leftPanel === t.id ? 'active' : ''}
            onClick={() => setLeftPanel(t.id)}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
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
            The generative tools live in <strong>AI Studio</strong> — text-to-video, storyboards and
            the AI Director.
            <div style={{ marginTop: 10 }}>
              <button className="primary" onClick={() => setWorkspace('studio')}>
                Open AI Studio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

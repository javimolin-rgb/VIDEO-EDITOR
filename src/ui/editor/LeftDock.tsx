import { useUIStore, type LeftPanel } from '@/state/uiStore';
import { MediaPanel } from './MediaPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { AudioPanel } from './panels/AudioPanel';
import { TextPanel } from './panels/TextPanel';

const TABS: { id: LeftPanel; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'generate', label: 'Generate' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
];

export function LeftDock() {
  const leftPanel = useUIStore((s) => s.leftPanel);
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);
  const setWorkspace = useUIStore((s) => s.setWorkspace);

  return (
    <div className="panel">
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={leftPanel === t.id ? 'active' : ''}
            onClick={() => setLeftPanel(t.id)}
          >
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
          <div className="notice">
            Generative tools live in the AI Studio workspace and unlock once a local model is
            installed (Phase 4).
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setWorkspace('studio')}>Open AI Studio</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

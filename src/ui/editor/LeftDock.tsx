import { useUIStore, type LeftPanel } from '@/state/uiStore';
import { MediaPanel } from './MediaPanel';

const TABS: { id: LeftPanel; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'generate', label: 'Generate' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
];

const PHASE: Record<LeftPanel, string> = {
  media: '',
  generate: 'Generative tools live in the AI Studio workspace and unlock once a local model is installed (Phase 4).',
  effects: 'Stackable effects, blur, grain, vignette and transitions arrive in Phase 2.',
  audio: 'Gain, fades, EQ, noise reduction and ducking arrive in Phase 2. Basic per-clip gain and fades already work in the Inspector.',
  text: 'Titles, lower-thirds and animated captions arrive in Phase 2.',
};

export function LeftDock() {
  const leftPanel = useUIStore((s) => s.leftPanel);
  const setLeftPanel = useUIStore((s) => s.setLeftPanel);

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
        {leftPanel === 'media' ? (
          <MediaPanel />
        ) : (
          <div className="notice">{PHASE[leftPanel]}</div>
        )}
      </div>
    </div>
  );
}

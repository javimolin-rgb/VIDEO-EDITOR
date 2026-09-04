import { useUIStore, type LeftPanel, type RightPanel } from '@/state/uiStore';

type Item =
  | { id: string; icon: string; label: string; side: 'left'; panel: LeftPanel }
  | { id: string; icon: string; label: string; side: 'right'; panel: RightPanel };

const ITEMS: Item[] = [
  { id: 'media', icon: '🎬', label: 'Media', side: 'left', panel: 'media' },
  { id: 'text', icon: 'T', label: 'Text', side: 'left', panel: 'text' },
  { id: 'audio', icon: '🎵', label: 'Audio', side: 'left', panel: 'audio' },
  { id: 'effects', icon: '✨', label: 'Effects', side: 'left', panel: 'effects' },
  { id: 'inspect', icon: '⚙️', label: 'Inspect', side: 'right', panel: 'inspector' },
];

/** Phone-only primary navigation — opens a dock as a bottom sheet (CapCut-style). */
export function BottomNav() {
  const mobileSheet = useUIStore((s) => s.mobileSheet);
  const leftPanel = useUIStore((s) => s.leftPanel);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const openLeftPanel = useUIStore((s) => s.openLeftPanel);
  const openRightPanel = useUIStore((s) => s.openRightPanel);
  const setMobileSheet = useUIStore((s) => s.setMobileSheet);

  return (
    <nav className="bottom-nav" aria-label="Editor sections">
      {ITEMS.map((it) => {
        const active =
          it.side === 'left'
            ? mobileSheet === 'left' && leftPanel === it.panel
            : mobileSheet === 'right' && rightPanel === it.panel;
        return (
          <button
            key={it.id}
            className={active ? 'active' : ''}
            aria-pressed={active}
            onClick={() => {
              if (active) {
                setMobileSheet(null);
              } else if (it.side === 'left') {
                openLeftPanel(it.panel);
              } else {
                openRightPanel(it.panel);
              }
            }}
          >
            <span className="bn-icon" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

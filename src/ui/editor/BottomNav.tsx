import { useUIStore, type LeftPanel, type RightPanel } from '@/state/uiStore';
import { useT, type MessageKey } from '@/i18n';

type Item =
  | { id: string; icon: string; key: MessageKey; side: 'left'; panel: LeftPanel }
  | { id: string; icon: string; key: MessageKey; side: 'right'; panel: RightPanel };

const ITEMS: Item[] = [
  { id: 'media', icon: '🎬', key: 'dock.media', side: 'left', panel: 'media' },
  { id: 'text', icon: 'T', key: 'dock.text', side: 'left', panel: 'text' },
  { id: 'audio', icon: '🎵', key: 'dock.audio', side: 'left', panel: 'audio' },
  { id: 'effects', icon: '✨', key: 'dock.effects', side: 'left', panel: 'effects' },
  { id: 'inspect', icon: '⚙️', key: 'dock.inspect', side: 'right', panel: 'inspector' },
];

/** Phone-only primary navigation — opens a dock as a bottom sheet (CapCut-style). */
export function BottomNav() {
  const t = useT();
  const mobileSheet = useUIStore((s) => s.mobileSheet);
  const leftPanel = useUIStore((s) => s.leftPanel);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const openLeftPanel = useUIStore((s) => s.openLeftPanel);
  const openRightPanel = useUIStore((s) => s.openRightPanel);
  const setMobileSheet = useUIStore((s) => s.setMobileSheet);

  return (
    <nav className="bottom-nav" aria-label={t('nav.more')}>
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
            {t(it.key)}
          </button>
        );
      })}
    </nav>
  );
}

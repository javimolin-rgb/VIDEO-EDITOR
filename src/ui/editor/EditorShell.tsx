import { useEffect } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { usePlaybackLoop } from '@/ui/hooks/usePlaybackLoop';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { useLayoutMode } from '@/ui/hooks/useMediaQuery';
import { TopBar } from './TopBar';
import { LeftDock } from './LeftDock';
import { PreviewPane } from './PreviewPane';
import { RightDock } from './RightDock';
import { Timeline } from './Timeline';
import { BottomNav } from './BottomNav';
import { StudioPanel } from './StudioPanel';
import { AiSetup } from './AiSetup';
import { AutomationPanel } from './AutomationPanel';

export function EditorShell() {
  usePlaybackLoop();
  useHotkeys();
  const workspace = useUIStore((s) => s.workspace);
  const mobileSheet = useUIStore((s) => s.mobileSheet);
  const timelineExpanded = useUIStore((s) => s.timelineExpanded);
  const setMobileSheet = useUIStore((s) => s.setMobileSheet);
  const project = useProjectStore((s) => s.project);
  const mode = useLayoutMode();
  const isMobile = mode === 'mobile';
  const sheetsAllowed = mode !== 'desktop';

  // Close any open sheet when we grow back to a desktop layout.
  useEffect(() => {
    if (mode === 'desktop' && mobileSheet) setMobileSheet(null);
  }, [mode, mobileSheet, setMobileSheet]);

  if (!project) return null;

  if (workspace !== 'edit') {
    const Panel =
      workspace === 'studio' ? StudioPanel : workspace === 'automation' ? AutomationPanel : AiSetup;
    return (
      <div className="editor" style={{ gridTemplateRows: 'var(--topbar-h) 1fr' }}>
        <TopBar />
        <Panel />
      </div>
    );
  }

  const editorClass = `editor${isMobile && timelineExpanded ? ' timeline-open' : ''}`;

  return (
    <div className={editorClass}>
      <TopBar />
      <div className="workarea">
        <LeftDock />
        <PreviewPane />
        <RightDock />
      </div>
      <Timeline />
      {isMobile && <BottomNav />}

      {sheetsAllowed && mobileSheet && (
        <>
          <div
            className="sheet-backdrop"
            onClick={() => setMobileSheet(null)}
            aria-hidden
          />
          {mobileSheet === 'left' ? (
            <LeftDock asSheet onClose={() => setMobileSheet(null)} />
          ) : (
            <RightDock asSheet onClose={() => setMobileSheet(null)} />
          )}
        </>
      )}
    </div>
  );
}

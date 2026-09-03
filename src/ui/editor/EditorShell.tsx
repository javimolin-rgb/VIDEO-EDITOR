import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { usePlaybackLoop } from '@/ui/hooks/usePlaybackLoop';
import { useHotkeys } from '@/ui/hooks/useHotkeys';
import { TopBar } from './TopBar';
import { LeftDock } from './LeftDock';
import { PreviewPane } from './PreviewPane';
import { RightDock } from './RightDock';
import { Timeline } from './Timeline';
import { StudioPanel } from './StudioPanel';
import { AiSetup } from './AiSetup';

export function EditorShell() {
  usePlaybackLoop();
  useHotkeys();
  const workspace = useUIStore((s) => s.workspace);
  const project = useProjectStore((s) => s.project);
  if (!project) return null;

  if (workspace === 'studio') {
    return (
      <div className="editor" style={{ gridTemplateRows: '44px 1fr' }}>
        <TopBar />
        <StudioPanel />
      </div>
    );
  }
  if (workspace === 'ai-setup') {
    return (
      <div className="editor" style={{ gridTemplateRows: '44px 1fr' }}>
        <TopBar />
        <AiSetup />
      </div>
    );
  }

  return (
    <div className="editor">
      <TopBar />
      <div className="workarea">
        <LeftDock />
        <PreviewPane />
        <RightDock />
      </div>
      <Timeline />
    </div>
  );
}

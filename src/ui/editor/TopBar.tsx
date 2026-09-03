import { useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { ExportDialog } from './ExportDialog';

export function TopBar() {
  const project = useProjectStore((s) => s.project);
  const renameProject = useProjectStore((s) => s.renameProject);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useProjectStore((s) => s.canUndo());
  const canRedo = useProjectStore((s) => s.canRedo());
  const dirty = useProjectStore((s) => s.dirty);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const closeProject = useProjectStore((s) => s.closeProject);

  const workspace = useUIStore((s) => s.workspace);
  const setWorkspace = useUIStore((s) => s.setWorkspace);
  const setPalette = useUIStore((s) => s.setCommandPalette);

  const [exporting, setExporting] = useState(false);
  if (!project) return null;

  return (
    <div className="topbar">
      <button className="ghost" onClick={() => void closeProject()} title="Back to projects">
        ‹ Projects
      </button>
      <input
        className="title"
        value={project.meta.name}
        onChange={(e) => renameProject(e.target.value)}
      />
      <span className="save-state">
        {dirty ? 'Editing…' : lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : ''}
      </span>

      <div className="spacer" />

      <div className="row" style={{ gap: 4 }}>
        <button className="ghost" disabled={!canUndo} onClick={undo} title="Undo (Cmd/Ctrl+Z)">
          Undo
        </button>
        <button className="ghost" disabled={!canRedo} onClick={redo} title="Redo (Shift+Cmd/Ctrl+Z)">
          Redo
        </button>
      </div>

      <div className="row" style={{ gap: 4 }}>
        <button
          className={workspace === 'edit' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('edit')}
        >
          Edit
        </button>
        <button
          className={workspace === 'studio' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('studio')}
        >
          AI Studio
        </button>
        <button
          className={workspace === 'automation' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('automation')}
        >
          Automation
        </button>
        <button
          className={workspace === 'ai-setup' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('ai-setup')}
        >
          AI Setup
        </button>
      </div>

      <button className="ghost" onClick={() => setPalette(true)} title="Command palette (⌘K)">
        ⌘K
      </button>
      <button className="primary" onClick={() => setExporting(true)}>
        Export
      </button>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

import { useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useT } from '@/i18n';
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
  const t = useT();
  if (!project) return null;

  return (
    <div className="topbar">
      <button className="ghost" onClick={() => void closeProject()} title="Back to projects">
        ‹ {t('nav.projects')}
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
          {t('common.undo')}
        </button>
        <button className="ghost" disabled={!canRedo} onClick={redo} title="Redo (Shift+Cmd/Ctrl+Z)">
          {t('common.redo')}
        </button>
      </div>

      <div className="row" style={{ gap: 4 }}>
        <button
          className={workspace === 'edit' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('edit')}
        >
          {t('nav.edit')}
        </button>
        <button
          className={workspace === 'studio' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('studio')}
        >
          {t('nav.studio')}
        </button>
        <button
          className={workspace === 'automation' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('automation')}
        >
          {t('nav.automation')}
        </button>
        <button
          className={workspace === 'ai-setup' ? 'primary' : 'ghost'}
          onClick={() => setWorkspace('ai-setup')}
        >
          {t('nav.aiSetup')}
        </button>
      </div>

      <button
        className="ghost"
        onClick={() => setPalette(true)}
        title={t('nav.commandPalette')}
        aria-label={t('nav.commandPalette')}
      >
        ⌘K
      </button>
      <button className="primary" onClick={() => setExporting(true)}>
        {t('nav.export')}
      </button>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

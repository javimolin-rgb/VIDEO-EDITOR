import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore, type Workspace } from '@/state/uiStore';
import { useLayoutMode } from '@/ui/hooks/useMediaQuery';
import { useT } from '@/i18n';
import { ExportDialog } from './ExportDialog';

const WORKSPACES: { id: Workspace; key: 'nav.edit' | 'nav.studio' | 'nav.automation' | 'nav.aiSetup' }[] = [
  { id: 'edit', key: 'nav.edit' },
  { id: 'studio', key: 'nav.studio' },
  { id: 'automation', key: 'nav.automation' },
  { id: 'ai-setup', key: 'nav.aiSetup' },
];

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
  const mobileSheet = useUIStore((s) => s.mobileSheet);
  const openRightPanel = useUIStore((s) => s.openRightPanel);
  const setMobileSheet = useUIStore((s) => s.setMobileSheet);

  const [exporting, setExporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const mode = useLayoutMode();
  const compact = mode === 'mobile';
  const isTablet = mode === 'tablet';

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (!project) return null;

  return (
    <div className="topbar">
      <button
        className="ghost icon-btn"
        onClick={() => void closeProject()}
        title={t('nav.projects')}
        aria-label={t('nav.projects')}
      >
        ‹
      </button>

      <input
        className="title"
        value={project.meta.name}
        onChange={(e) => renameProject(e.target.value)}
        aria-label="Project name"
      />

      {!compact && (
        <span className="save-state">
          {dirty
            ? 'Editing…'
            : lastSavedAt
              ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
              : ''}
        </span>
      )}

      <div className="spacer" />

      {!compact && (
        <>
          <div className="row" style={{ gap: 2 }}>
            <button
              className="ghost icon-btn"
              disabled={!canUndo}
              onClick={undo}
              title={`${t('common.undo')} (Cmd/Ctrl+Z)`}
              aria-label={t('common.undo')}
            >
              ↶
            </button>
            <button
              className="ghost icon-btn"
              disabled={!canRedo}
              onClick={redo}
              title={`${t('common.redo')} (Shift+Cmd/Ctrl+Z)`}
              aria-label={t('common.redo')}
            >
              ↷
            </button>
          </div>

          <div className="segmented" role="tablist" aria-label="Workspace">
            {WORKSPACES.map((w) => (
              <button
                key={w.id}
                role="tab"
                aria-selected={workspace === w.id}
                className={workspace === w.id ? 'active' : ''}
                onClick={() => setWorkspace(w.id)}
              >
                {t(w.key)}
              </button>
            ))}
          </div>

          <button
            className="ghost icon-btn"
            onClick={() => setPalette(true)}
            title={t('nav.commandPalette')}
            aria-label={t('nav.commandPalette')}
          >
            ⌘K
          </button>
        </>
      )}

      {isTablet && workspace === 'edit' && (
        <button
          className={`ghost icon-btn ${mobileSheet === 'right' ? 'active' : ''}`}
          onClick={() =>
            mobileSheet === 'right' ? setMobileSheet(null) : openRightPanel('inspector')
          }
          title={t('panel.inspector')}
          aria-label={t('panel.inspector')}
          aria-pressed={mobileSheet === 'right'}
        >
          ⚙️
        </button>
      )}

      {compact && (
        <div className="menu-wrap" ref={menuRef}>
          <button
            className="ghost icon-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More"
            aria-expanded={menuOpen}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="menu right">
              <button
                disabled={!canUndo}
                onClick={() => {
                  undo();
                  setMenuOpen(false);
                }}
              >
                ↶ {t('common.undo')}
              </button>
              <button
                disabled={!canRedo}
                onClick={() => {
                  redo();
                  setMenuOpen(false);
                }}
              >
                ↷ {t('common.redo')}
              </button>
              <div className="sep" />
              {WORKSPACES.map((w) => (
                <button
                  key={w.id}
                  className={workspace === w.id ? 'active' : ''}
                  onClick={() => {
                    setWorkspace(w.id);
                    setMenuOpen(false);
                  }}
                >
                  {workspace === w.id ? '● ' : ''}
                  {t(w.key)}
                </button>
              ))}
              <div className="sep" />
              <button
                onClick={() => {
                  setPalette(true);
                  setMenuOpen(false);
                }}
              >
                {t('nav.commandPalette')}
              </button>
            </div>
          )}
        </div>
      )}

      <button className="primary" onClick={() => setExporting(true)}>
        {t('nav.export')}
      </button>

      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

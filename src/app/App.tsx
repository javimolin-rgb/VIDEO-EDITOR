import { useEffect, useState } from 'react';
import { useProjectStore, dismissRecovery } from '@/state/projectStore';
import { useAutomationStore } from '@/state/automationStore';
import { revokeAllMediaUrls } from '@/state/mediaUrls';
import { readRecovery } from '@/storage/repository';
import { ProjectBrowser } from '@/ui/ProjectBrowser';
import { EditorShell } from '@/ui/editor/EditorShell';
import { Toasts } from '@/ui/Toasts';
import { CommandPalette } from '@/ui/CommandPalette';
import type { VideoProject } from '@/domain/types';

export function App() {
  const status = useProjectStore((s) => s.status);
  const project = useProjectStore((s) => s.project);
  const openSnapshot = useProjectStore((s) => s.openSnapshot);
  const [recovery, setRecovery] = useState<{ savedAt: number; data: VideoProject } | null>(null);

  // Offer crash recovery once a project id is known but before edits happen.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void readRecovery(project.meta.id).then((rec) => {
      if (cancelled || !rec) return;
      // Only prompt if the recovery snapshot is newer than the loaded doc.
      if (rec.savedAt > project.meta.updatedAt + 1000) setRecovery(rec);
    });
    return () => {
      cancelled = true;
    };
  }, [project?.meta.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => revokeAllMediaUrls(), []);

  // Load recipes so `on-import` triggers work before the panel is opened.
  useEffect(() => {
    void useAutomationStore.getState().load();
  }, []);

  return (
    <div className="app">
      {status === 'ready' && project ? <EditorShell /> : <ProjectBrowser />}

      {recovery && project && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Unsaved work recovered</h2>
            <p className="muted">
              A more recent autosave of “{project.meta.name}” was found from{' '}
              {new Date(recovery.savedAt).toLocaleString()}. Restore it?
            </p>
            <div className="actions">
              <button
                onClick={() => {
                  void dismissRecovery(project.meta.id);
                  setRecovery(null);
                }}
              >
                Discard
              </button>
              <button
                className="primary"
                onClick={() => {
                  openSnapshot(recovery.data);
                  void dismissRecovery(project.meta.id);
                  setRecovery(null);
                }}
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      <CommandPalette />
      <Toasts />
    </div>
  );
}

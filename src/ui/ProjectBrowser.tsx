import { useEffect, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useGenStore } from '@/state/genStore';
import { useT } from '@/i18n';
import { listProjects, deleteProject, duplicateProject } from '@/storage/repository';
import type { ProjectRow } from '@/storage/db';
import type { AspectRatioId } from '@/domain/types';

const ASPECTS: { id: AspectRatioId; label: string }[] = [
  { id: '16:9', label: '16:9 · Landscape' },
  { id: '9:16', label: '9:16 · Vertical' },
  { id: '1:1', label: '1:1 · Square' },
  { id: '4:5', label: '4:5 · Portrait' },
  { id: '21:9', label: '21:9 · Cinemascope' },
];

export function ProjectBrowser() {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Untitled project');
  const [aspect, setAspect] = useState<AspectRatioId>('16:9');
  const [fps, setFps] = useState(30);
  const newProject = useProjectStore((s) => s.newProject);
  const createSampleProject = useProjectStore((s) => s.createSampleProject);
  const openProject = useProjectStore((s) => s.openProject);
  const pushToast = useUIStore((s) => s.pushToast);
  const setWorkspace = useUIStore((s) => s.setWorkspace);
  const setStudioView = useGenStore((s) => s.setStudioView);
  const t = useT();

  const refresh = () => void listProjects().then(setRows);
  useEffect(refresh, []);

  const openSample = async () => {
    await createSampleProject();
    setStudioView('storyboard');
    setWorkspace('studio');
    pushToast('info', 'Generating the sample clips locally — this takes a few seconds.');
    const gen = useGenStore.getState();
    await gen.generateAllShots();
    await gen.awaitStoryboardSettled();
    gen.assembleStoryboard();
    pushToast('success', 'Sample ready — switch to Edit to see the timeline.');
  };

  return (
    <div className="browser">
      <div className="row">
        <div>
          <h1>{t('app.title')}</h1>
          <div className="sub">{t('app.tagline')}</div>
        </div>
        <div className="spacer" />
        <button onClick={() => void openSample()}>{t('browser.sampleProject')}</button>
        <button className="primary" onClick={() => setCreating(true)}>
          + {t('browser.newProject')}
        </button>
      </div>

      {rows.length === 0 && (
        <div className="notice info" style={{ marginTop: 24 }}>
          {t('browser.empty')}
        </div>
      )}

      <div className="project-grid">
        {rows.map((row) => (
          <div key={row.id} className="project-card" onClick={() => void openProject(row.id)}>
            <h3>{row.name}</h3>
            <div className="meta">
              {row.data.settings.aspectRatio} · {row.data.settings.fps} fps ·{' '}
              {row.data.timeline.clips.length} clips
              <br />
              updated {new Date(row.updatedAt).toLocaleString()}
            </div>
            <div className="card-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="ghost"
                onClick={() => {
                  void duplicateProject(row.id, `${row.name} copy`).then(() => {
                    refresh();
                    pushToast('success', 'Project duplicated');
                  });
                }}
              >
                Duplicate
              </button>
              <button
                className="ghost danger"
                onClick={() => {
                  if (confirm(`Delete “${row.name}”? This removes its media and versions.`)) {
                    void deleteProject(row.id).then(refresh);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New project</h2>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>Aspect ratio</label>
              <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatioId)}>
                {ASPECTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Frame rate</label>
              <select value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                {[24, 25, 30, 50, 60].map((f) => (
                  <option key={f} value={f}>
                    {f} fps
                  </option>
                ))}
              </select>
            </div>
            <div className="actions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button
                className="primary"
                onClick={() => {
                  void newProject({ name, aspectRatio: aspect, fps }).then(() => setCreating(false));
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

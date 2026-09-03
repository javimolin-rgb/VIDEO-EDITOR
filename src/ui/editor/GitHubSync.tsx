import { useEffect, useState } from 'react';
import { useSyncStore } from '@/state/syncStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { downloadPackage, readPackageFile, importPackage } from '@/storage/projectPackage';

/** GitHub-as-cloud + local project packages (spec §118). */
export function GitHubSync() {
  const s = useSyncStore();
  const project = useProjectStore((p) => p.project);
  const openProject = useProjectStore((p) => p.openProject);
  const pushToast = useUIStore((u) => u.pushToast);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (s.config.enabled && s.config.repo && s.config.token) void s.refreshRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.config.enabled]);

  return (
    <div>
      <h4 style={{ margin: '18px 0 8px' }}>Cloud (GitHub)</h4>
      <p className="muted" style={{ fontSize: 11 }}>
        Stores each project (timeline + media) as one JSON in a repo via the GitHub API. The token
        stays in this browser and is sent only to api.github.com. Use a fine-grained PAT with
        <strong> Contents: read & write</strong> on the target repo.
      </p>

      <div className="field">
        <label>Repository (owner/name)</label>
        <input
          placeholder="yourname/my-video-projects"
          value={s.config.repo}
          onChange={(e) => s.setConfig({ repo: e.target.value.trim() })}
        />
      </div>
      <div className="field">
        <label>Personal Access Token</label>
        <div className="row" style={{ gap: 4 }}>
          <input
            type={showToken ? 'text' : 'password'}
            placeholder="github_pat_…"
            value={s.config.token}
            onChange={(e) => s.setConfig({ token: e.target.value.trim() })}
          />
          <button className="ghost" style={{ padding: '2px 8px' }} onClick={() => setShowToken((v) => !v)}>
            {showToken ? 'hide' : 'show'}
          </button>
        </div>
      </div>
      <div className="rowfields">
        <div className="field">
          <label>Branch</label>
          <input value={s.config.branch} onChange={(e) => s.setConfig({ branch: e.target.value.trim() })} />
        </div>
        <div className="field">
          <label>Folder</label>
          <input value={s.config.dir} onChange={(e) => s.setConfig({ dir: e.target.value.trim() })} />
        </div>
      </div>
      <label className="row" style={{ fontSize: 12 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={s.config.enabled}
          onChange={(e) => s.setConfig({ enabled: e.target.checked })}
        />
        Enable GitHub sync
      </label>
      <label className="row" style={{ fontSize: 12, marginTop: 4 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          disabled={!s.config.enabled}
          checked={s.config.autoSync}
          onChange={(e) => s.setConfig({ autoSync: e.target.checked })}
        />
        Auto-push ~15 s after each save
      </label>

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button onClick={() => void s.test()}>Test connection</button>
        <button
          className="primary"
          disabled={!s.config.enabled || !project}
          onClick={() => void s.pushNow()}
        >
          Push project now
        </button>
        <button disabled={!s.config.enabled} onClick={() => void s.refreshRemote()}>
          Refresh list
        </button>
      </div>

      {s.message && (
        <div
          className="muted"
          style={{ fontSize: 11, marginTop: 6, color: s.status === 'error' ? 'var(--bad)' : undefined }}
        >
          {s.message}
          {s.lastSyncedAt && s.status !== 'error' && ` · last ${new Date(s.lastSyncedAt).toLocaleTimeString()}`}
        </div>
      )}

      {s.remote.length > 0 && (
        <div className="col" style={{ gap: 4, marginTop: 8 }}>
          <div className="muted" style={{ fontSize: 11 }}>In the repo:</div>
          {s.remote.map((r) => (
            <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12 }}>
                {r.name} <span className="muted">· {r.sizeKb} KB</span>
              </span>
              <button className="ghost" style={{ padding: '2px 8px' }} onClick={() => void s.pull(r.id)}>
                Pull
              </button>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ margin: '16px 0 6px' }}>Local project package</h4>
      <div className="row" style={{ gap: 6 }}>
        <button
          disabled={!project}
          onClick={() => project && void downloadPackage(project.meta.id, project.meta.name)}
        >
          Export .aivproj.json
        </button>
        <label
          style={{
            padding: '6px 10px',
            cursor: 'pointer',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-3)',
            fontSize: 13,
          }}
        >
          Import…
          <input
            type="file"
            accept=".json,.aivproj.json,application/json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const pkg = await readPackageFile(f);
                const id = await importPackage(pkg, 'copy');
                await openProject(id);
                pushToast('success', 'Project package imported.');
              } catch (err) {
                pushToast('error', `Import failed: ${String(err)}`);
              }
            }}
          />
        </label>
      </div>
    </div>
  );
}

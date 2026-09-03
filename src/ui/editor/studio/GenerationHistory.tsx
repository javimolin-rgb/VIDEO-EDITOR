import { useEffect } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { flattenGraph } from '@/ai/gen/history';

const PHASE_LABEL: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  'loading-model': 'Loading model',
  'analyzing-references': 'Analysing references',
  'building-conditioning': 'Building conditioning',
  generating: 'Generating',
  'generating-audio': 'Generating audio',
  'post-processing': 'Post-processing',
  'quality-check': 'Quality check',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function GenerationHistory() {
  const jobs = useGenStore((s) => s.jobs);
  const graph = useGenStore((s) => s.graph);
  const refreshHistory = useGenStore((s) => s.refreshHistory);
  const cancel = useGenStore((s) => s.cancel);
  const clearFinishedJobs = useGenStore((s) => s.clearFinishedJobs);
  const makeVariations = useGenStore((s) => s.makeVariations);
  const regenerate = useGenStore((s) => s.regenerate);
  const addToTimeline = useGenStore((s) => s.addToTimeline);
  const assets = useProjectStore((s) => s.assets);
  const projectId = useProjectStore((s) => s.project?.meta.id);
  const pushToast = useUIStore((s) => s.pushToast);

  useEffect(() => {
    void refreshHistory();
  }, [projectId, refreshHistory]);

  const active = jobs.filter((j) => !['ready', 'failed', 'cancelled'].includes(j.status.phase));
  const finished = jobs.filter((j) => ['failed', 'cancelled'].includes(j.status.phase));
  const nodes = flattenGraph(graph);

  return (
    <div>
      <div className="row">
        <h4 style={{ margin: '4px 0 8px' }}>Jobs</h4>
        <span className="spacer" />
        {finished.length > 0 && (
          <button className="ghost" onClick={clearFinishedJobs}>
            Clear
          </button>
        )}
      </div>

      {active.length === 0 && finished.length === 0 && (
        <div className="muted" style={{ fontSize: 11 }}>
          No jobs running.
        </div>
      )}

      {[...active, ...finished].map((j) => (
        <div key={j.id} className="model-row" style={{ display: 'block', padding: 10 }}>
          <div className="row">
            <strong style={{ fontSize: 12 }}>{j.label}</strong>
            <span className="spacer" />
            <span className="pill">{PHASE_LABEL[j.status.phase] ?? j.status.phase}</span>
          </div>
          {j.status.progress != null && (
            <div
              style={{
                marginTop: 6,
                height: 5,
                background: 'var(--bg-0)',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(j.status.progress * 100)}%`,
                  height: '100%',
                  background: j.status.phase === 'failed' ? 'var(--bad)' : 'var(--accent)',
                }}
              />
            </div>
          )}
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {j.status.message}
          </div>
          {!['ready', 'failed', 'cancelled'].includes(j.status.phase) && (
            <button className="ghost" style={{ marginTop: 6 }} onClick={() => cancel(j.id)}>
              Cancel
            </button>
          )}
        </div>
      ))}

      <h4 style={{ margin: '14px 0 8px' }}>Generation history</h4>
      {nodes.length === 0 && (
        <div className="muted" style={{ fontSize: 11 }}>
          Nothing generated yet.
        </div>
      )}
      <div className="col" style={{ gap: 6 }}>
        {nodes.map((n) => {
          const asset = assets.find((a) => a.id === n.assetId);
          return (
            <div
              key={n.id}
              className="model-row"
              style={{ display: 'block', padding: 8, marginLeft: n.depth * 14 }}
            >
              <div className="row" style={{ gap: 8 }}>
                <div
                  className="thumb"
                  style={{ width: 64, height: 36, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}
                >
                  {asset?.thumbnailDataUrl ? (
                    <img
                      src={asset.thumbnailDataUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    '🎞️'
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.meta.prompt}
                  </div>
                  <div className="muted mono" style={{ fontSize: 10 }}>
                    seed {n.meta.seed ?? '—'} · {n.meta.durationSec.toFixed(1)}s ·{' '}
                    QC {n.qualityScore != null ? Math.round(n.qualityScore * 100) + '%' : '—'}
                    {n.parentId ? ' · variation' : ''}
                  </div>
                </div>
              </div>
              {n.qualityIssues.length > 0 && (
                <div className="muted" style={{ fontSize: 10, color: 'var(--warn)', marginTop: 4 }}>
                  {n.qualityIssues.join(' · ')}
                </div>
              )}
              <div className="row" style={{ gap: 4, marginTop: 6 }}>
                <button
                  className="primary"
                  style={{ padding: '2px 8px' }}
                  onClick={() => {
                    addToTimeline(n.id);
                    pushToast('success', 'Added to timeline.');
                  }}
                >
                  Add to timeline
                </button>
                <button className="ghost" style={{ padding: '2px 8px' }} onClick={() => void regenerate(n.id)}>
                  Regenerate
                </button>
                <button
                  className="ghost"
                  style={{ padding: '2px 8px' }}
                  onClick={() => void makeVariations(n.id, 2)}
                >
                  +2 variations
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

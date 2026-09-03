import { useEffect, useRef } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { getMediaUrl } from '@/state/mediaUrls';
import { route, type GenerativeTask } from '@/ai/orchestrator';
import { PromptForm } from './studio/PromptForm';
import { ReferenceBoard } from './studio/ReferenceBoard';
import { GenerationHistory } from './studio/GenerationHistory';
import { StoryboardView } from './studio/StoryboardView';
import { DirectorView } from './studio/DirectorView';
import type { GenKind } from '@/ai/gen/queue';

const MODES: Array<{ id: string; label: string; task: GenerativeTask; kind?: GenKind }> = [
  { id: 't2v', label: 'Text → Video', task: 'text-to-video', kind: 'text-to-video' },
  { id: 'i2v', label: 'Image → Video', task: 'image-to-video', kind: 'image-to-video' },
  { id: 'ref', label: 'Reference → Video', task: 'reference-to-video' },
  { id: 'v2v', label: 'Video → Video', task: 'video-to-video' },
  { id: 'extend', label: 'Extend Video', task: 'extend-video' },
  { id: 'region', label: 'Region Edit', task: 'region-edit' },
];

/**
 * AI Video Studio (spec §20, §146, §147). Text→Video and Image→Video run
 * against a real local backend (the procedural generator, or a diffusion
 * runtime once connected). Modes without a backend show an honest disabled
 * state — never a fake result (spec §159, §160).
 */
export function StudioPanel() {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const mode = useGenStore((s) => s.mode);
  const setMode = useGenStore((s) => s.setMode);
  const studioView = useGenStore((s) => s.studioView);
  const setStudioView = useGenStore((s) => s.setStudioView);
  const reuseOffer = useGenStore((s) => s.reuseOffer);
  const dismissReuse = useGenStore((s) => s.dismissReuse);
  const lastResultAssetId = useGenStore((s) => s.lastResultAssetId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastAsset = assets.find((a) => a.id === lastResultAssetId);

  useEffect(() => {
    let cancelled = false;
    if (lastAsset) {
      void getMediaUrl(lastAsset).then((url) => {
        if (!cancelled && url && videoRef.current) {
          videoRef.current.src = url;
          videoRef.current.load();
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [lastAsset]);

  if (!project) return null;

  return (
    <div className="panel-body" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="row">
        <h2>AI Video Studio</h2>
        <div className="row" style={{ gap: 4, marginLeft: 16 }}>
          <button
            className={studioView === 'generate' ? 'primary' : ''}
            onClick={() => setStudioView('generate')}
          >
            Generate
          </button>
          <button
            className={studioView === 'storyboard' ? 'primary' : ''}
            onClick={() => setStudioView('storyboard')}
          >
            Storyboard
          </button>
          <button
            className={studioView === 'director' ? 'primary' : ''}
            onClick={() => setStudioView('director')}
          >
            Director
          </button>
        </div>
        <span className="spacer" />
        <span className="pill good">Procedural generator ready · local · no model</span>
      </div>

      {studioView === 'storyboard' && (
        <div style={{ marginTop: 14 }}>
          <StoryboardView />
        </div>
      )}

      {studioView === 'director' && (
        <div style={{ marginTop: 14 }}>
          <DirectorView />
        </div>
      )}

      {studioView === 'generate' && (
      <>
      <div className="row" style={{ gap: 6, margin: '12px 0', flexWrap: 'wrap' }}>
        {MODES.map((m) => {
          const r = route(m.task);
          const enabled = !!r.provider && !!m.kind;
          const activeMode = m.kind === mode;
          return (
            <button
              key={m.id}
              className={activeMode ? 'primary' : ''}
              disabled={!enabled}
              title={enabled ? r.reason : 'No local backend for this yet (Phase 5).'}
              onClick={() => m.kind && setMode(m.kind)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '340px 1fr 340px',
          gap: 14,
          alignItems: 'start',
        }}
      >
        <div className="col" style={{ gap: 16 }}>
          <PromptForm />
          <ReferenceBoard />
        </div>

        <div className="col" style={{ gap: 10 }}>
          <div
            className="preview-frame"
            style={{
              aspectRatio: `${project.settings.resolution.width} / ${project.settings.resolution.height}`,
              width: '100%',
            }}
          >
            {lastAsset ? (
              <video ref={videoRef} controls loop style={{ width: '100%', height: '100%' }} />
            ) : (
              <div
                className="muted"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: 20,
                  textAlign: 'center',
                }}
              >
                Your generated clip will appear here. It becomes a normal asset — trim, colour,
                add effects, drop it on the timeline.
              </div>
            )}
          </div>
          {lastAsset && (
            <div className="muted mono" style={{ fontSize: 11 }}>
              {lastAsset.name} · {lastAsset.meta.width}×{lastAsset.meta.height} ·{' '}
              {(lastAsset.meta.sizeBytes / 1024 / 1024).toFixed(1)} MB
              {lastAsset.generation?.qualityScore != null &&
                ` · QC ${Math.round(lastAsset.generation.qualityScore * 100)}%`}
            </div>
          )}
        </div>

        <GenerationHistory />
      </div>
      </>
      )}

      {reuseOffer && (
        <div className="modal-backdrop" onClick={dismissReuse}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Identical request found</h2>
            <p className="muted">
              You already generated this exact prompt / settings
              {reuseOffer.row.qualityScore != null &&
                ` (QC ${Math.round(reuseOffer.row.qualityScore * 100)}%)`}
              . Reuse that result or generate a fresh one?
            </p>
            <div className="actions">
              <button
                onClick={() => {
                  reuseOffer.proceed();
                }}
              >
                Generate anyway
              </button>
              <button className="primary" onClick={dismissReuse}>
                Keep existing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

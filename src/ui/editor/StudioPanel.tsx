import { useEffect, useRef } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { getMediaUrl } from '@/state/mediaUrls';
import { useT, type MessageKey } from '@/i18n';
import { route, type GenerativeTask } from '@/ai/orchestrator';
import { PromptForm } from './studio/PromptForm';
import { ReferenceBoard } from './studio/ReferenceBoard';
import { GenerationHistory } from './studio/GenerationHistory';
import { StoryboardView } from './studio/StoryboardView';
import { DirectorView } from './studio/DirectorView';
import type { GenKind } from '@/ai/gen/queue';

const MODES: Array<{ id: string; key: MessageKey; task: GenerativeTask; kind?: GenKind }> = [
  { id: 't2v', key: 'mode.t2v', task: 'text-to-video', kind: 'text-to-video' },
  { id: 'i2v', key: 'mode.i2v', task: 'image-to-video', kind: 'image-to-video' },
  { id: 'ref', key: 'mode.ref', task: 'reference-to-video' },
  { id: 'v2v', key: 'mode.v2v', task: 'video-to-video' },
  { id: 'extend', key: 'mode.extend', task: 'extend-video' },
  { id: 'region', key: 'mode.region', task: 'region-edit' },
];

/**
 * AI Video Studio (spec §20, §146, §147). Text→Video and Image→Video run
 * against a real local backend (the procedural generator, or a diffusion
 * runtime once connected). Modes without a backend show an honest disabled
 * state — never a fake result (spec §159, §160).
 */
export function StudioPanel() {
  const t = useT();
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const mode = useGenStore((s) => s.mode);
  const setMode = useGenStore((s) => s.setMode);
  const studioView = useGenStore((s) => s.studioView);
  const setStudioView = useGenStore((s) => s.setStudioView);
  const reuseOffer = useGenStore((s) => s.reuseOffer);
  const dismissReuse = useGenStore((s) => s.dismissReuse);
  const lastResultAssetId = useGenStore((s) => s.lastResultAssetId);
  const setWorkspace = useUIStore((s) => s.setWorkspace);

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

  const activeId = route('text-to-video').provider?.id ?? 'procedural';
  const backendLabel =
    activeId === 'comfyui'
      ? t('studio.backendComfy')
      : activeId === 'fal'
        ? t('studio.backendFal')
        : activeId === 'pollinations'
          ? t('studio.backendPollinations')
          : t('studio.backendProcedural');
  const isProcedural = activeId === 'procedural';

  return (
    <div className="panel-body" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="studio-head">
        <h2>{t('studio.title')}</h2>
        <div className="chip-strip">
          <button
            className={studioView === 'generate' ? 'primary' : ''}
            onClick={() => setStudioView('generate')}
          >
            {t('studio.generate')}
          </button>
          <button
            className={studioView === 'storyboard' ? 'primary' : ''}
            onClick={() => setStudioView('storyboard')}
          >
            {t('studio.storyboard')}
          </button>
          <button
            className={studioView === 'director' ? 'primary' : ''}
            onClick={() => setStudioView('director')}
          >
            {t('studio.director')}
          </button>
        </div>
        <span className="spacer" />
        <span className={`pill ${isProcedural ? 'warn' : 'good'}`}>{backendLabel}</span>
      </div>

      {isProcedural && studioView === 'generate' && (
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>{t('studio.proceduralWarnTitle')}</strong>
          <div style={{ marginTop: 4 }}>{t('studio.proceduralWarnBody')}</div>
          <div style={{ marginTop: 10 }}>
            <button className="primary" onClick={() => setWorkspace('ai-setup')}>
              {t('studio.proceduralWarnCta')}
            </button>
          </div>
        </div>
      )}

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
      <div className="chip-strip" style={{ margin: '12px 0' }}>
        {MODES.map((m) => {
          const r = route(m.task);
          const enabled = !!r.provider && !!m.kind;
          const activeMode = m.kind === mode;
          return (
            <button
              key={m.id}
              className={activeMode ? 'primary' : ''}
              disabled={!enabled}
              title={enabled ? r.reason : t('studio.noBackend')}
              onClick={() => m.kind && setMode(m.kind)}
            >
              {t(m.key)}
            </button>
          );
        })}
      </div>

      <div className="studio-grid">
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
                {t('studio.resultHint')}
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

import { useEffect, useState } from 'react';
import { useUIStore } from '@/state/uiStore';
import { route, type GenerativeTask } from '@/ai/orchestrator';
import { localProvider } from '@/ai/providers/local/localProvider';

const MODES: { id: string; label: string; task: GenerativeTask | null }[] = [
  { id: 't2v', label: 'Text → Video', task: 'text-to-video' },
  { id: 'i2v', label: 'Image → Video', task: 'image-to-video' },
  { id: 'ref', label: 'Reference → Video', task: 'reference-to-video' },
  { id: 'v2v', label: 'Video → Video', task: 'video-to-video' },
  { id: 'extend', label: 'Extend Video', task: 'extend-video' },
  { id: 'region', label: 'Region Edit', task: 'region-edit' },
  { id: 'storyboard', label: 'Storyboard → Video', task: null },
  { id: 'director', label: 'AI Director', task: null },
];

/**
 * AI Video Studio (spec §20, §146). The layout and mode list are real; the
 * generative actions are gated on an installed local model. Until then every
 * control is an honest disabled state (spec §159, §160) — never a fake render.
 */
export function StudioPanel() {
  const setWorkspace = useUIStore((s) => s.setWorkspace);
  const [health, setHealth] = useState<string>('Checking local AI service…');

  useEffect(() => {
    void localProvider.health().then((h) => setHealth(h.detail));
  }, []);

  const caps = localProvider.capabilities;
  const anyCapability = Object.values(caps).some((v) => v === true);

  return (
    <div className="panel-body" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="row">
        <h2>AI Video Studio</h2>
        <div className="spacer" />
        <button onClick={() => setWorkspace('ai-setup')}>Open AI Setup</button>
      </div>

      <div className="notice" style={{ marginTop: 12 }}>
        <strong>Local generation is not active yet.</strong>
        <div style={{ marginTop: 6 }}>{health}</div>
        <div style={{ marginTop: 6 }} className="muted">
          The editor is fully usable without this. Generative modes below unlock automatically once a
          compatible local model is installed and the local inference service is running (Phase 3–4).
          No external AI API is ever required or called.
        </div>
      </div>

      <div className="studio-modes" style={{ marginTop: 16 }}>
        {MODES.map((m) => {
          const r = m.task ? route(m.task) : { provider: null, reason: 'Planned for Phase 5–6.' };
          return (
            <div key={m.id} className="studio-mode" style={{ opacity: r.provider ? 1 : 0.55 }}>
              <div style={{ fontWeight: 600 }}>{m.label}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                {r.provider ? 'Available' : 'Unavailable'}
              </div>
              <div className="pill" style={{ marginTop: 8 }}>
                {r.provider ? r.reason : 'Model not installed'}
              </div>
            </div>
          );
        })}
      </div>

      {!anyCapability && (
        <div className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          Provider: <span className="mono">{localProvider.id}</span> — capabilities currently all
          disabled. The UI reads provider capabilities, not model names (spec §201), so any local
          model you add later lights up the matching modes here without code changes.
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { localRuntime } from '@/ai/local/runtime';
import { LOCAL_MODELS } from '@/ai/local/types';

/** "Generate captions from audio" — local transcription (spec §45, §46, §50). */
export function TranscribeControls() {
  const project = useProjectStore((s) => s.project);
  const transcribeClip = useProjectStore((s) => s.transcribeClip);
  const localJob = useProjectStore((s) => s.localJob);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const setWorkspace = useUIStore((s) => s.setWorkspace);

  const speechModels = LOCAL_MODELS.filter((m) => m.task === 'transcribe');
  const installed = speechModels.filter((m) => localRuntime.isInstalled(m.id));
  const [modelId, setModelId] = useState(installed[0]?.id ?? speechModels[0]!.id);
  const [language, setLanguage] = useState('');

  const targetClip = useMemo(() => {
    if (!project) return undefined;
    const clips = project.timeline.clips;
    const sel = clips.find((c) => c.id === selectedClipIds[0]);
    if (sel) return sel;
    return clips.find((c) => {
      const t = project.timeline.tracks.find((x) => x.id === c.trackId);
      return t && (t.kind === 'audio' || t.kind === 'video');
    });
  }, [project, selectedClipIds]);

  const busy = localJob?.kind === 'transcribe';

  return (
    <div className="model-row" style={{ display: 'block', padding: 10, marginTop: 8 }}>
      <strong style={{ fontSize: 12 }}>Generate captions from audio (local)</strong>

      {installed.length === 0 ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          No speech model installed.{' '}
          <button className="ghost" style={{ padding: '1px 6px' }} onClick={() => setWorkspace('ai-setup')}>
            Open AI Setup
          </button>{' '}
          to download one (~40 MB, runs on-device).
        </div>
      ) : (
        <>
          <div className="rowfields" style={{ marginTop: 8 }}>
            <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              {installed.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              placeholder="lang (auto)"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              title="Optional ISO code, e.g. en, es. Leave blank to auto-detect (multilingual model)."
            />
          </div>
          <div className="muted" style={{ fontSize: 11, margin: '6px 0' }}>
            {targetClip
              ? `Transcribes ${selectedClipIds[0] ? 'the selected clip' : 'the first audio/video clip'}.`
              : 'Add an audio or video clip first.'}
          </div>
          <button
            className="primary"
            disabled={!targetClip || busy}
            onClick={() =>
              targetClip && void transcribeClip(targetClip.id, modelId, language.trim() || null, true)
            }
          >
            {busy ? `${localJob?.message ?? 'Working…'}` : 'Transcribe → captions'}
          </button>
          {busy && (
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
                  width: `${Math.round((localJob?.progress ?? 0) * 100)}%`,
                  height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

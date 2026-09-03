import { useState } from 'react';
import { useGenStore } from '@/state/genStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { AspectRatioId, Clip } from '@/domain/types';

const ASPECTS: AspectRatioId[] = ['9:16', '1:1', '4:5', '16:9', '21:9'];

/** Per-clip AI operations (spec §28, §64, §74, §83, §210). */
export function AiClipTools({ clip }: { clip: Clip }) {
  const assets = useProjectStore((s) => s.assets);
  const extendClip = useGenStore((s) => s.extendClip);
  const autoReframeClip = useGenStore((s) => s.autoReframeClip);
  const matchLook = useGenStore((s) => s.matchLook);
  const opJob = useGenStore((s) => s.opJob);
  const pushToast = useUIStore((s) => s.pushToast);

  const [target, setTarget] = useState<AspectRatioId>('9:16');
  const [refId, setRefId] = useState('');
  const [strength, setStrength] = useState(0.8);
  const [busy, setBusy] = useState(false);

  const refCandidates = assets.filter((a) => a.id !== clip.assetId && (a.kind === 'video' || a.kind === 'image'));
  const clipAsset = assets.find((a) => a.id === clip.assetId);
  const isVideo = clipAsset?.kind === 'video';

  return (
    <div className="model-row" style={{ display: 'block', padding: 10 }}>
      <strong style={{ fontSize: 12 }}>AI tools</strong>

      {opJob && (
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {opJob.message} · {Math.round(opJob.progress * 100)}%
        </div>
      )}

      <div className="row" style={{ gap: 4, marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11 }}>Extend</span>
        <button
          disabled={busy}
          style={{ padding: '2px 8px' }}
          onClick={() => {
            void extendClip(clip.id, 3);
            pushToast('info', 'Extend queued — see AI Studio jobs.');
          }}
        >
          +3s
        </button>
        <button
          disabled={busy}
          style={{ padding: '2px 8px' }}
          onClick={() => void extendClip(clip.id, 5)}
        >
          +5s
        </button>
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label>Auto-reframe {isVideo ? '' : '(video clips only)'}</label>
        <div className="row" style={{ gap: 4 }}>
          <select value={target} onChange={(e) => setTarget(e.target.value as AspectRatioId)}>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={busy || !isVideo || !!opJob}
            onClick={async () => {
              setBusy(true);
              await autoReframeClip(clip.id, target);
              setBusy(false);
              pushToast('success', `Auto-reframed to ${target} — new clip in Media.`);
            }}
          >
            Reframe
          </button>
        </div>
      </div>

      <div className="field">
        <label>Match look to reference</label>
        <select value={refId} onChange={(e) => setRefId(e.target.value)}>
          <option value="">Pick a reference clip / image…</option>
          {refCandidates.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Strength — {(strength * 100).toFixed(0)}%</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={strength}
          onChange={(e) => setStrength(Number(e.target.value))}
        />
      </div>
      <button
        disabled={busy || !refId || !!opJob}
        onClick={async () => {
          setBusy(true);
          const ok = await matchLook(clip.id, refId, strength);
          setBusy(false);
          if (ok) pushToast('success', 'Colour graded to match the reference.');
        }}
      >
        Match look
      </button>
    </div>
  );
}

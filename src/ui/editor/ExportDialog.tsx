import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { exportTimeline, webCodecsAvailable, type ExportFormat, type ExportProgress } from '@/export/exporter';

const SOCIAL_PRESETS = [
  { id: 'source', label: 'Project settings' },
  { id: 'reel', label: 'Reel / TikTok · 1080×1920', w: 1080, h: 1920 },
  { id: 'yt', label: 'YouTube · 1920×1080', w: 1920, h: 1080 },
  { id: 'square', label: 'Square · 1080×1080', w: 1080, h: 1080 },
] as const;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const pushToast = useUIStore((s) => s.pushToast);
  const [quality, setQuality] = useState(0.6);
  const [preset, setPreset] = useState<(typeof SOCIAL_PRESETS)[number]['id']>('source');
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!project) return;
    const { width, height } = project.settings.resolution;
    void webCodecsAvailable(width, height).then((codec) => {
      setMp4Supported(!!codec);
      if (!codec) setFormat('webm');
    });
  }, [project]);

  if (!project) return null;

  const run = async () => {
    setRunning(true);
    setProgress({ phase: 'preparing', progress: 0, message: 'Starting…' });
    const abort = new AbortController();
    abortRef.current = abort;

    const chosen = SOCIAL_PRESETS.find((p) => p.id === preset);
    const renderProject =
      chosen && 'w' in chosen
        ? { ...project, settings: { ...project.settings, resolution: { width: chosen.w, height: chosen.h } } }
        : project;

    try {
      const result = await exportTimeline(
        renderProject,
        assets,
        { quality, maxDurationSec: 900, format },
        setProgress,
        abort.signal,
      );
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.meta.name.replace(/[^\w.-]+/g, '_')}.${result.format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      pushToast(
        'success',
        `Exported ${result.format.toUpperCase()} · ${result.width}×${result.height} · ${result.durationSec.toFixed(
          1,
        )}s · ${(result.blob.size / 1024 / 1024).toFixed(1)} MB`,
      );
      onClose();
    } catch (e) {
      pushToast('error', `Export failed: ${String(e)}`);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>

        <div className="notice info" style={{ marginBottom: 12 }}>
          The final render composites every visual track with transform, colour, effects,
          transitions, adjustment layers and captions, and mixes audio with per-clip gain / pan /
          fades.
          {mp4Supported === false &&
            ' WebCodecs MP4 is unavailable in this browser — falling back to real-time WebM.'}
        </div>

        <div className="field">
          <label>Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="mp4" disabled={mp4Supported === false}>
              MP4 · H.264/AAC · offline, frame-exact {mp4Supported === false ? '(unavailable)' : ''}
            </option>
            <option value="webm">WebM · VP9/Opus · real-time capture</option>
          </select>
        </div>

        <div className="field">
          <label>Frame size</label>
          <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
            {SOCIAL_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Quality — {(quality * 100).toFixed(0)}%</label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </div>

        {progress && (
          <div className="notice info">
            <div>{progress.message}</div>
            <div
              style={{
                marginTop: 6,
                height: 6,
                background: 'var(--bg-0)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.round(progress.progress * 100)}%`,
                  height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
          </div>
        )}

        <div className="actions">
          {running ? (
            <button onClick={() => abortRef.current?.abort()}>Cancel</button>
          ) : (
            <button onClick={onClose}>Close</button>
          )}
          <button className="primary" disabled={running} onClick={() => void run()}>
            {running ? 'Rendering…' : 'Render & download'}
          </button>
        </div>
      </div>
    </div>
  );
}

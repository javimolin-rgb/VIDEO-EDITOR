import { useEffect, useMemo, useRef } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { PreviewEngine } from '@/video/previewEngine';
import { getMediaUrl } from '@/state/mediaUrls';
import { formatTimecode, formatClock } from '@/lib/time';
import { contentEndFrame } from '@/domain/timeline/operations';

export function PreviewPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);

  const project = useProjectStore((s) => s.project);
  const assets = useProjectStore((s) => s.assets);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const togglePlay = useUIStore((s) => s.togglePlay);

  const timeline = project?.timeline;
  const playhead = timeline?.playheadFrame ?? 0;
  const clipSig = useMemo(
    () =>
      timeline?.clips
        .map((c) => `${c.id}:${c.assetId}:${c.timelineStart}:${c.sourceIn}:${c.sourceOut}`)
        .join('|') ?? '',
    [timeline?.clips],
  );

  // Create engine + attach canvas once.
  useEffect(() => {
    if (!canvasRef.current || !project) return;
    const engine = new PreviewEngine();
    engine.attachCanvas(
      canvasRef.current,
      project.settings.resolution.width,
      project.settings.resolution.height,
      project.settings.backgroundColor,
    );
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.meta.id]);

  useEffect(() => {
    if (!project) return;
    engineRef.current?.setResolution(
      project.settings.resolution.width,
      project.settings.resolution.height,
      project.settings.backgroundColor,
    );
  }, [project?.settings.resolution.width, project?.settings.resolution.height, project?.settings.backgroundColor, project]);

  // Keep media elements in sync with the clip set.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !timeline) return;
    void engine.sync(assets, timeline.clips, getMediaUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipSig, assets]);

  // Start/stop underlying media playback.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !timeline) return;
    engine.setPlaying(isPlaying, timeline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Render the composite whenever the playhead or clip set changes.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !timeline) return;
    engine.render(timeline, playhead);
  }, [playhead, clipSig, timeline]);

  if (!project || !timeline) return null;

  const end = Math.max(timeline.durationFrames, contentEndFrame(timeline));

  return (
    <div className="preview-pane">
      <div className="preview-stage">
        <div
          className="preview-frame"
          style={{
            aspectRatio: `${project.settings.resolution.width} / ${project.settings.resolution.height}`,
          }}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div className="transport">
        <button className="ghost" onClick={() => setPlayhead(0)} title="Go to start">
          ⏮
        </button>
        <button className="primary" onClick={togglePlay} title="Play/Pause (Space)">
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button className="ghost" onClick={() => setPlayhead(end)} title="Go to end">
          ⏭
        </button>
        <span className="tc mono">{formatTimecode(playhead, timeline.timebase)}</span>
        <span className="muted">/ {formatClock(end, timeline.timebase)}</span>
      </div>
    </div>
  );
}

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

  // A signature that changes whenever anything the compositor reads changes.
  const renderSig = useMemo(
    () =>
      timeline
        ? JSON.stringify({
            c: timeline.clips,
            t: timeline.transitions,
            k: timeline.tracks.map((x) => [x.id, x.hidden, x.index]),
            cap: timeline.captionLayer,
            bg: project?.settings.backgroundColor,
          })
        : '',
    [timeline, project?.settings.backgroundColor],
  );
  const clipAssetSig = useMemo(
    () => timeline?.clips.map((c) => c.assetId).join('|') ?? '',
    [timeline?.clips],
  );

  useEffect(() => {
    if (!canvasRef.current || !project) return;
    const engine = new PreviewEngine();
    engine.attachCanvas(
      canvasRef.current,
      project.settings.resolution.width,
      project.settings.resolution.height,
    );
    engine.setProject(project);
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
    );
    engineRef.current?.setProject(project);
    engineRef.current?.requestRender(project.timeline.playheadFrame);
  }, [project]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !timeline) return;
    void engine.sync(assets, timeline.clips, getMediaUrl).then(() => engine.requestRender(playhead));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipAssetSig, assets]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !project) return;
    engine.setPlaying(isPlaying, project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    engineRef.current?.requestRender(playhead);
  }, [playhead, renderSig]);

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

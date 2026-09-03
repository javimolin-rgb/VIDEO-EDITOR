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
  const setWorkspace = useUIStore((s) => s.setWorkspace);

  const timeline = project?.timeline;
  const playhead = timeline?.playheadFrame ?? 0;

  // A cheap signature that changes whenever anything the compositor reads
  // changes — avoids JSON.stringify of the whole timeline on every render.
  const renderSig = useMemo(() => {
    if (!timeline) return '';
    const clips = timeline.clips
      .map(
        (c) =>
          `${c.id}${c.assetId}${c.trackId}${c.timelineStart},${c.sourceIn},${c.sourceOut},${c.speed},${c.opacity},${c.gain},${c.pan}` +
          `|${JSON.stringify(c.transform)}${JSON.stringify(c.color)}${c.effects.length}${Object.keys(c.keyframes).length}` +
          `|${c.fadeInFrames},${c.fadeOutFrames}`,
      )
      .join(';');
    const tr = timeline.transitions.map((t) => `${t.id}${t.type}${t.durationFrames}`).join(',');
    const tracks = timeline.tracks.map((x) => `${x.id}${x.hidden ? 1 : 0}${x.index}`).join(',');
    const cap = timeline.captionLayer.enabled
      ? `${timeline.captionLayer.cues.length}${timeline.captionLayer.style.preset}`
      : '0';
    return `${clips}#${tr}#${tracks}#${cap}#${project?.settings.backgroundColor ?? ''}`;
  }, [timeline, project?.settings.backgroundColor]);
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
  const isEmpty = timeline.clips.length === 0;

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
        {isEmpty && (
          <div className="preview-empty">
            <div style={{ fontSize: 26, marginBottom: 8 }}>🎬</div>
            <strong>The timeline is empty</strong>
            <div className="muted" style={{ maxWidth: 340, marginTop: 6 }}>
              Import a video or image on the left and drag it onto a track, or generate a clip in{' '}
              <button className="ghost" style={{ padding: '1px 6px' }} onClick={() => setWorkspace('studio')}>
                AI Studio
              </button>
              . The preview shows whatever sits under the playhead.
            </div>
          </div>
        )}
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

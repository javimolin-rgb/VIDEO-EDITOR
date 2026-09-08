import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { useLayoutMode } from '@/ui/hooks/useMediaQuery';
import { useT } from '@/i18n';
import { clipTimelineRange, type Clip, type TransitionType } from '@/domain/types';
import { contentEndFrame } from '@/domain/timeline/operations';
import { formatClock } from '@/lib/time';

type DragMode =
  | { type: 'playhead' }
  | { type: 'move'; clipId: string; grabFrameOffset: number; originTrackId: string }
  | { type: 'trim'; clipId: string; edge: 'start' | 'end' };

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const addTrack = useProjectStore((s) => s.addTrack);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const splitAtPlayhead = useProjectStore((s) => s.splitAtPlayhead);
  const addMarkerAtPlayhead = useProjectStore((s) => s.addMarkerAtPlayhead);
  const rippleDelete = useProjectStore((s) => s.rippleDelete);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const addTransition = useProjectStore((s) => s.addTransition);
  const detectShotsForClip = useProjectStore((s) => s.detectShotsForClip);
  const localJob = useProjectStore((s) => s.localJob);
  const pushToast = useUIStore((s) => s.pushToast);

  const pxPerFrame = useUIStore((s) => s.pxPerFrame);
  const snapEnabled = useUIStore((s) => s.snapEnabled);
  const zoomIn = useUIStore((s) => s.zoomIn);
  const zoomOut = useUIStore((s) => s.zoomOut);
  const toggleSnap = useUIStore((s) => s.toggleSnap);
  const setZoom = useUIStore((s) => s.setZoom);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const selectClips = useUIStore((s) => s.selectClips);
  const selectTransition = useUIStore((s) => s.selectTransition);
  const selectedTransitionId = useUIStore((s) => s.selectedTransitionId);
  const setActiveTrack = useUIStore((s) => s.setActiveTrack);
  const activeTrackId = useUIStore((s) => s.activeTrackId);
  const timelineExpanded = useUIStore((s) => s.timelineExpanded);
  const toggleTimelineExpanded = useUIStore((s) => s.toggleTimelineExpanded);

  const t = useT();
  const mode = useLayoutMode();
  const isMobile = mode === 'mobile';
  const lanesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [moreOpen]);

  const timeline = project?.timeline;
  const end = useMemo(
    () => (timeline ? Math.max(timeline.durationFrames, contentEndFrame(timeline), 300) : 300),
    [timeline],
  );
  const contentWidth = Math.max(end * pxPerFrame + 200, 800);

  const frameFromClientX = useCallback(
    (clientX: number): number => {
      const el = lanesRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      return Math.max(0, x / pxPerFrame);
    },
    [pxPerFrame],
  );

  const snap = useCallback(
    (frame: number, ignoreClipId?: string): number => {
      if (!snapEnabled || !timeline) return Math.round(frame);
      const targets: number[] = [0, timeline.playheadFrame];
      for (const c of timeline.clips) {
        if (c.id === ignoreClipId) continue;
        const r = clipTimelineRange(c);
        targets.push(r.start, r.end);
      }
      for (const m of timeline.markers) targets.push(m.frame);
      const threshold = 8 / pxPerFrame;
      let best = Math.round(frame);
      let bestDist = threshold;
      for (const target of targets) {
        const d = Math.abs(target - frame);
        if (d < bestDist) {
          best = target;
          bestDist = d;
        }
      }
      return best;
    },
    [snapEnabled, timeline, pxPerFrame],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !timeline) return;
      const frame = frameFromClientX(e.clientX);
      if (drag.type === 'playhead') {
        setPlayhead(Math.round(frame));
      } else if (drag.type === 'move') {
        const raw = frame - drag.grabFrameOffset;
        const snapped = snap(raw, drag.clipId);
        // Track change by vertical position.
        const laneEls = lanesRef.current?.querySelectorAll<HTMLElement>('[data-track-id]');
        let targetTrack = drag.originTrackId;
        if (laneEls) {
          for (const lane of laneEls) {
            const r = lane.getBoundingClientRect();
            if (e.clientY >= r.top && e.clientY <= r.bottom) {
              targetTrack = lane.dataset.trackId ?? targetTrack;
              break;
            }
          }
        }
        moveClip(drag.clipId, targetTrack, Math.max(0, snapped));
      } else if (drag.type === 'trim') {
        trimClip(drag.clipId, drag.edge, Math.max(0, snap(frame, drag.clipId)));
      }
    },
    [timeline, frameFromClientX, setPlayhead, snap, moveClip, trimClip],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onPointerMove]);

  const beginDrag = useCallback(
    (mode: DragMode) => {
      dragRef.current = mode;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
    },
    [onPointerMove, endDrag],
  );

  if (!project || !timeline) return null;

  const ticks = buildTicks(end, pxPerFrame, timeline.timebase.fps);

  // Two selected clips on the same track, ordered by start → transition candidate.
  const selectedPair = (() => {
    if (selectedClipIds.length !== 2) return null;
    const a = timeline.clips.find((c) => c.id === selectedClipIds[0]);
    const b = timeline.clips.find((c) => c.id === selectedClipIds[1]);
    if (!a || !b || a.trackId !== b.trackId) return null;
    const [from, to] = a.timelineStart <= b.timelineStart ? [a, b] : [b, a];
    return { from, to };
  })();

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <div className="tbar-group">
          <button className="icon-btn" onClick={zoomOut} title={t('tl.zoomOut')} aria-label={t('tl.zoomOut')}>
            −
          </button>
          {!isMobile && (
            <input
              type="range"
              className="tbar-zoom"
              min={0.02}
              max={4}
              step={0.01}
              value={pxPerFrame}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label={t('tl.zoomIn')}
            />
          )}
          <button className="icon-btn" onClick={zoomIn} title={t('tl.zoomIn')} aria-label={t('tl.zoomIn')}>
            +
          </button>
          <button
            className={snapEnabled ? 'active' : ''}
            onClick={toggleSnap}
            title={t('tl.snap')}
            aria-pressed={snapEnabled}
            style={{ padding: '5px 10px' }}
          >
            {t('tl.snap')}
          </button>
        </div>

        <div className="tbar-group">
          <button
            className="icon-btn"
            onClick={() => splitAtPlayhead(selectedClipIds)}
            title={t('tl.split')}
            aria-label={t('tl.split')}
          >
            ✂
          </button>
          <button
            className="icon-btn"
            disabled={selectedClipIds.length !== 1}
            onClick={() => selectedClipIds[0] && duplicateClip(selectedClipIds[0])}
            title={t('tl.duplicate')}
            aria-label={t('tl.duplicate')}
          >
            ⧉
          </button>
          <button
            className="icon-btn danger"
            disabled={selectedClipIds.length !== 1}
            onClick={() => selectedClipIds[0] && rippleDelete(selectedClipIds[0])}
            title={t('tl.rippleDelete')}
            aria-label={t('tl.rippleDelete')}
          >
            🗑
          </button>
        </div>

        <div className="spacer" />

        <div className="tbar-group menu-wrap" ref={moreRef}>
          <button
            className={`icon-btn ${moreOpen ? 'active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-label={t('tl.more')}
            aria-expanded={moreOpen}
          >
            ⋯
          </button>
          {moreOpen && (
            <div className="menu right" style={{ bottom: '100%', top: 'auto', marginBottom: 6 }}>
              <button
                onClick={() => {
                  addMarkerAtPlayhead();
                  setMoreOpen(false);
                }}
              >
                ⚑ {t('tl.addMarker')}
              </button>
              <button
                disabled={selectedClipIds.length !== 1 || localJob?.kind === 'shots'}
                onClick={async () => {
                  const id = selectedClipIds[0];
                  setMoreOpen(false);
                  if (!id) return;
                  const n = await detectShotsForClip(id, 0.45);
                  pushToast(
                    n > 0 ? 'success' : 'info',
                    n > 0 ? t('tl.shotsAdded', { n }) : t('tl.noShots'),
                  );
                }}
              >
                {localJob?.kind === 'shots' ? `⏳ ${t('tl.analysing')}` : `◫ ${t('tl.detectShots')}`}
              </button>
              <button
                disabled={!selectedPair}
                onClick={() => {
                  if (selectedPair) {
                    addTransition(
                      selectedPair.from.id,
                      selectedPair.to.id,
                      'dissolve' as TransitionType,
                      Math.round(timeline.timebase.fps * 0.5),
                    );
                  }
                  setMoreOpen(false);
                }}
              >
                ⇄ {t('tl.addTransition')}
              </button>
              <div className="sep" />
              <button
                onClick={() => {
                  addTrack('video');
                  setMoreOpen(false);
                }}
              >
                ＋ {t('tl.videoTrack')}
              </button>
              <button
                onClick={() => {
                  addTrack('audio');
                  setMoreOpen(false);
                }}
              >
                ＋ {t('tl.audioTrack')}
              </button>
              <button
                onClick={() => {
                  addTrack('adjustment');
                  setMoreOpen(false);
                }}
              >
                ＋ {t('tl.adjustmentLayer')}
              </button>
            </div>
          )}
          {isMobile && (
            <button
              className={`icon-btn ${timelineExpanded ? 'active' : ''}`}
              onClick={toggleTimelineExpanded}
              title={timelineExpanded ? t('tl.collapse') : t('tl.expand')}
              aria-label={timelineExpanded ? t('tl.collapse') : t('tl.expand')}
            >
              {timelineExpanded ? '▾' : '▴'}
            </button>
          )}
        </div>
      </div>

      <div className="track-headers" style={{ overflowY: 'hidden' }}>
        <div style={{ height: 22 }} />
        {timeline.tracks.map((track) => (
          <div
            key={track.id}
            className="track-header"
            style={{
              height: track.height,
              background: activeTrackId === track.id ? 'var(--bg-3)' : undefined,
            }}
            onClick={() => setActiveTrack(track.id)}
          >
            <span className="name">{track.name}</span>
            <div className="controls">
              <button
                className={track.muted ? 'primary' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTrack(track.id, { muted: !track.muted });
                }}
                title={t('tl.mute')}
              >
                M
              </button>
              <button
                className={track.hidden ? 'primary' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTrack(track.id, { hidden: !track.hidden });
                }}
                title={t('tl.hide')}
              >
                H
              </button>
              <button
                className={track.locked ? 'primary' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTrack(track.id, { locked: !track.locked });
                }}
                title={t('tl.lock')}
              >
                L
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="lanes" ref={lanesRef}>
        <div style={{ width: contentWidth, position: 'relative' }}>
          <div
            className="ruler"
            style={{ width: contentWidth }}
            onPointerDown={(e) => {
              setPlayhead(Math.round(frameFromClientX(e.clientX)));
              beginDrag({ type: 'playhead' });
            }}
          >
            {ticks.map((tk) => (
              <div key={tk.frame} className="tick" style={{ left: tk.frame * pxPerFrame }}>
                {tk.label}
              </div>
            ))}
          </div>

          {timeline.tracks.map((track) => {
            const trackClips = timeline.clips.filter((c) => c.trackId === track.id);
            return (
              <div
                key={track.id}
                className={`lane ${dragOverTrack === track.id ? 'dragover' : ''}`}
                data-track-id={track.id}
                style={{ height: track.height, width: contentWidth }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setActiveTrack(track.id);
                    selectClips([]);
                    setPlayhead(Math.round(frameFromClientX(e.clientX)));
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTrack(track.id);
                }}
                onDragLeave={() => setDragOverTrack(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTrack(null);
                  const assetId = e.dataTransfer.getData('application/x-asset-id');
                  if (assetId) {
                    addClipFromAsset(assetId, track.id, Math.round(frameFromClientX(e.clientX)));
                  }
                }}
              >
                {trackClips.map((clip) => (
                  <ClipView
                    key={clip.id}
                    clip={clip}
                    kind={track.kind}
                    pxPerFrame={pxPerFrame}
                    selected={selectedClipIds.includes(clip.id)}
                    onSelect={(additive) => selectClips([clip.id], additive)}
                    onMoveStart={(grabFrameOffset) =>
                      beginDrag({
                        type: 'move',
                        clipId: clip.id,
                        grabFrameOffset,
                        originTrackId: track.id,
                      })
                    }
                    onTrimStart={(edge) => beginDrag({ type: 'trim', clipId: clip.id, edge })}
                    frameFromClientX={frameFromClientX}
                  />
                ))}

                {timeline.transitions
                  .filter((tr) => tr.trackId === track.id)
                  .map((tr) => {
                    const toClip = timeline.clips.find((c) => c.id === tr.toClipId);
                    if (!toClip) return null;
                    const left = clipTimelineRange(toClip).start * pxPerFrame;
                    const width = Math.max(8, tr.durationFrames * pxPerFrame);
                    return (
                      <div
                        key={tr.id}
                        className={`transition-badge ${selectedTransitionId === tr.id ? 'selected' : ''}`}
                        style={{ left, width }}
                        title={`${tr.type} · ${tr.durationFrames}f`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectTransition(tr.id);
                        }}
                      >
                        ⇄
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {timeline.markers.map((m) => (
            <div key={m.id} className="marker" style={{ left: m.frame * pxPerFrame }} title={m.label} />
          ))}
          <div className="playhead" style={{ left: timeline.playheadFrame * pxPerFrame }} />
        </div>
      </div>
    </div>
  );
}

interface ClipViewProps {
  clip: Clip;
  kind: string;
  pxPerFrame: number;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onMoveStart: (grabFrameOffset: number) => void;
  onTrimStart: (edge: 'start' | 'end') => void;
  frameFromClientX: (clientX: number) => number;
}

function ClipView({
  clip,
  kind,
  pxPerFrame,
  selected,
  onSelect,
  onMoveStart,
  onTrimStart,
  frameFromClientX,
}: ClipViewProps) {
  const range = clipTimelineRange(clip);
  const left = range.start * pxPerFrame;
  const width = Math.max(6, (range.end - range.start) * pxPerFrame);
  const kindClass =
    kind === 'audio' ? 'kind-audio' : kind === 'video' ? 'kind-video' : 'kind-image';

  return (
    <div
      className={`clip ${kindClass} ${selected ? 'selected' : ''}`}
      style={{ left, width }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(e.shiftKey || e.metaKey);
        const grabFrame = frameFromClientX(e.clientX);
        onMoveStart(grabFrame - range.start);
      }}
    >
      <div
        className="handle left"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(false);
          onTrimStart('start');
        }}
      />
      <div className="label">{clip.label ?? clip.assetId}</div>
      <div
        className="handle right"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(false);
          onTrimStart('end');
        }}
      />
    </div>
  );
}

function buildTicks(
  endFrame: number,
  pxPerFrame: number,
  fps: number,
): { frame: number; label: string }[] {
  // Aim for a tick roughly every 90px.
  const targetPx = 90;
  const framesPerTarget = targetPx / pxPerFrame;
  const niceSeconds = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const secStep =
    niceSeconds.find((s) => s * fps >= framesPerTarget) ?? niceSeconds[niceSeconds.length - 1]!;
  const step = secStep * fps;
  const out: { frame: number; label: string }[] = [];
  for (let f = 0; f <= endFrame; f += step) {
    out.push({ frame: f, label: formatClock(f, { fps, dropFrame: false }) });
  }
  return out;
}

import { useEffect, useRef } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { contentEndFrame } from '@/domain/timeline/operations';

/**
 * Drives the playhead from a single requestAnimationFrame loop, decoupled from
 * React renders (spec §12, §171 — UI stays responsive). Real elapsed wall
 * time is converted to frames so playback speed is correct regardless of
 * frame drops.
 */
export function usePlaybackLoop(): void {
  const raf = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const accFrames = useRef(0);

  useEffect(() => {
    const tick = (now: number) => {
      const { isPlaying } = useUIStore.getState();
      const { project, setPlayhead } = useProjectStore.getState();

      if (isPlaying && project) {
        const fps = project.settings.fps;
        const last = lastRef.current ?? now;
        const dt = (now - last) / 1000;
        lastRef.current = now;
        accFrames.current += dt * fps;
        const whole = Math.floor(accFrames.current);
        if (whole >= 1) {
          accFrames.current -= whole;
          const end = Math.max(project.timeline.durationFrames, contentEndFrame(project.timeline));
          const next = project.timeline.playheadFrame + whole;
          if (next >= end) {
            setPlayhead(end);
            useUIStore.getState().pause();
          } else {
            setPlayhead(next);
          }
        }
      } else {
        lastRef.current = null;
        accFrames.current = 0;
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);
}

import { useProjectStore } from '@/state/projectStore';
import { hasKeyframes } from '@/domain/keyframes';
import type { AnimatableParam, Clip } from '@/domain/types';

/** Small diamond toggle that adds/removes a keyframe at the playhead (spec §106). */
export function KeyframeButton({ clip, param }: { clip: Clip; param: AnimatableParam }) {
  const toggle = useProjectStore((s) => s.toggleKeyframe);
  const clear = useProjectStore((s) => s.clearKeyframes);
  const on = hasKeyframes(clip, param);
  return (
    <button
      className="ghost"
      title={on ? 'Toggle keyframe at playhead (right-click clears)' : 'Add keyframe at playhead'}
      style={{ padding: '2px 6px', color: on ? 'var(--accent)' : 'var(--text-2)' }}
      onClick={() => toggle(clip.id, param)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (on) clear(clip.id, param);
      }}
    >
      {on ? '◆' : '◇'}
    </button>
  );
}

import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import type { Transition, TransitionType } from '@/domain/types';

const TYPES: TransitionType[] = ['dissolve', 'fade-color', 'wipe', 'slide', 'zoom'];

export function TransitionInspector({ transition }: { transition: Transition }) {
  const update = useProjectStore((s) => s.updateTransition);
  const remove = useProjectStore((s) => s.removeTransition);
  const selectTransition = useUIStore((s) => s.selectTransition);

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>Transition</h3>

      <div className="field">
        <label>Type</label>
        <select
          value={transition.type}
          onChange={(e) => update(transition.id, { type: e.target.value as TransitionType })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Duration — {transition.durationFrames} frames</label>
        <input
          type="range"
          min={2}
          max={90}
          step={1}
          value={transition.durationFrames}
          onChange={(e) => update(transition.id, { durationFrames: Number(e.target.value) })}
        />
      </div>

      {transition.type === 'fade-color' && (
        <div className="field">
          <label>Colour</label>
          <input
            type="color"
            value={String(transition.params.color ?? '#000000')}
            onChange={(e) =>
              update(transition.id, { params: { ...transition.params, color: e.target.value } })
            }
          />
        </div>
      )}

      {transition.type === 'wipe' && (
        <div className="field">
          <label>Direction</label>
          <select
            value={String(transition.params.direction ?? 'left')}
            onChange={(e) =>
              update(transition.id, { params: { ...transition.params, direction: e.target.value } })
            }
          >
            {['left', 'right', 'up', 'down'].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        className="danger"
        onClick={() => {
          remove(transition.id);
          selectTransition(null);
        }}
      >
        Remove transition
      </button>
    </div>
  );
}

import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';
import { getClip } from '@/domain/timeline/operations';
import { EFFECT_LIST, EFFECT_DEFS, createEffect } from '@/domain/effects/registry';

const CATEGORY_LABEL: Record<string, string> = {
  blur: 'Blur',
  stylize: 'Stylize',
  color: 'Colour',
  texture: 'Texture',
};

export function EffectsPanel() {
  const project = useProjectStore((s) => s.project);
  const patchClip = useProjectStore((s) => s.patchClip);
  const selectedClipIds = useUIStore((s) => s.selectedClipIds);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const clip =
    project && selectedClipIds.length === 1
      ? getClip(project.timeline, selectedClipIds[0]!)
      : undefined;

  const categories = [...new Set(EFFECT_LIST.map((d) => d.category))];

  return (
    <div>
      {!clip ? (
        <div className="notice">Select a single clip on the timeline to add effects to it.</div>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          Adding to <strong>{clip.label ?? 'clip'}</strong> · {clip.effects.length} applied.{' '}
          <button className="ghost" style={{ padding: '1px 6px' }} onClick={() => setRightPanel('inspector')}>
            Edit in Inspector
          </button>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 10 }}>
          <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {CATEGORY_LABEL[cat] ?? cat}
          </div>
          <div className="col" style={{ gap: 4, marginTop: 4 }}>
            {EFFECT_LIST.filter((d) => d.category === cat).map((d) => (
              <button
                key={d.type}
                disabled={!clip}
                onClick={() =>
                  clip &&
                  patchClip(clip.id, (c) => c.effects.push(createEffect(d.type)), `Add ${d.label}`)
                }
                style={{ justifyContent: 'flex-start' }}
              >
                + {EFFECT_DEFS[d.type].label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

import type { ReactNode } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { EFFECT_DEFS, EFFECT_LIST, clampEffectParam, createEffect } from '@/domain/effects/registry';
import type { Clip, EffectType } from '@/domain/types';
import { KeyframeButton } from './KeyframeButton';
import { AiClipTools } from './AiClipTools';

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  right,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  right?: ReactNode;
}) {
  return (
    <div className="field">
      <label className="row" style={{ justifyContent: 'space-between' }}>
        <span>
          {label} — {value.toFixed(2)}
        </span>
        {right}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function ClipInspector({ clip, assetName }: { clip: Clip; assetName: string | undefined }) {
  const patchClip = useProjectStore((s) => s.patchClip);
  const set = (recipe: (c: Clip) => void, label: string) => patchClip(clip.id, recipe, label);

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>{assetName ?? 'Clip'}</h3>

      <div className="field">
        <label>Label</label>
        <input
          value={clip.label ?? ''}
          placeholder={assetName ?? ''}
          onChange={(e) => set((c) => (c.label = e.target.value || null), 'Rename clip')}
        />
      </div>

      <Slider
        label="Opacity"
        value={clip.opacity}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.opacity = v), 'Set opacity')}
        right={<KeyframeButton clip={clip} param="opacity" />}
      />
      <Slider
        label="Gain"
        value={clip.gain}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => set((c) => (c.gain = v), 'Set gain')}
        right={<KeyframeButton clip={clip} param="gain" />}
      />
      <Slider
        label="Pan"
        value={clip.pan}
        min={-1}
        max={1}
        step={0.02}
        onChange={(v) => set((c) => (c.pan = v), 'Set pan')}
      />
      <Slider
        label="Speed"
        value={clip.speed}
        min={0.25}
        max={3}
        step={0.05}
        onChange={(v) => set((c) => (c.speed = v), 'Set speed')}
      />

      <div className="field">
        <label>Fades (frames)</label>
        <div className="rowfields">
          <input
            type="number"
            min={0}
            value={clip.fadeInFrames}
            onChange={(e) => set((c) => (c.fadeInFrames = Math.max(0, Number(e.target.value))), 'Fade in')}
          />
          <input
            type="number"
            min={0}
            value={clip.fadeOutFrames}
            onChange={(e) => set((c) => (c.fadeOutFrames = Math.max(0, Number(e.target.value))), 'Fade out')}
          />
        </div>
      </div>

      {/* Transform (spec §110) */}
      <h4 style={{ margin: '14px 0 6px' }}>Transform</h4>
      <Slider
        label="Position X"
        value={clip.transform.x}
        min={-2000}
        max={2000}
        step={1}
        onChange={(v) => set((c) => (c.transform.x = v), 'Move X')}
        right={<KeyframeButton clip={clip} param="transform.x" />}
      />
      <Slider
        label="Position Y"
        value={clip.transform.y}
        min={-2000}
        max={2000}
        step={1}
        onChange={(v) => set((c) => (c.transform.y = v), 'Move Y')}
        right={<KeyframeButton clip={clip} param="transform.y" />}
      />
      <Slider
        label="Scale"
        value={clip.transform.scale}
        min={0.1}
        max={4}
        step={0.01}
        onChange={(v) => set((c) => (c.transform.scale = v), 'Scale')}
        right={<KeyframeButton clip={clip} param="transform.scale" />}
      />
      <Slider
        label="Rotation"
        value={clip.transform.rotation}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => set((c) => (c.transform.rotation = v), 'Rotate')}
        right={<KeyframeButton clip={clip} param="transform.rotation" />}
      />

      {/* Colour (spec §63) */}
      <h4 style={{ margin: '14px 0 6px' }} className="row">
        <span>Colour</span>
        <span className="spacer" />
        <label className="row" style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={clip.color.enabled}
            onChange={(e) => set((c) => (c.color.enabled = e.target.checked), 'Toggle colour')}
          />
          on
        </label>
      </h4>
      <Slider
        label="Exposure"
        value={clip.color.exposure}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.color.exposure = v), 'Exposure')}
        right={<KeyframeButton clip={clip} param="color.exposure" />}
      />
      <Slider
        label="Contrast"
        value={clip.color.contrast}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.color.contrast = v), 'Contrast')}
        right={<KeyframeButton clip={clip} param="color.contrast" />}
      />
      <Slider
        label="Saturation"
        value={clip.color.saturation}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.color.saturation = v), 'Saturation')}
        right={<KeyframeButton clip={clip} param="color.saturation" />}
      />
      <Slider
        label="Temperature"
        value={clip.color.temperature}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.color.temperature = v), 'Temperature')}
      />
      <Slider
        label="Tint"
        value={clip.color.tint}
        min={-1}
        max={1}
        step={0.01}
        onChange={(v) => set((c) => (c.color.tint = v), 'Tint')}
      />

      {/* Effects (spec §107) */}
      <h4 style={{ margin: '14px 0 6px' }}>Effects</h4>
      <div className="field">
        <select
          value=""
          onChange={(e) => {
            const t = e.target.value as EffectType;
            if (t) set((c) => c.effects.push(createEffect(t)), `Add ${EFFECT_DEFS[t].label}`);
            e.target.value = '';
          }}
        >
          <option value="">+ Add effect…</option>
          {EFFECT_LIST.map((d) => (
            <option key={d.type} value={d.type}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {clip.effects.length === 0 && <div className="muted" style={{ fontSize: 11 }}>No effects.</div>}

      {clip.effects.map((fx, i) => {
        const def = EFFECT_DEFS[fx.type];
        return (
          <div key={fx.id} className="model-row" style={{ display: 'block', padding: 10 }}>
            <div className="row">
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={fx.enabled}
                onChange={(e) =>
                  set((c) => {
                    const f = c.effects.find((x) => x.id === fx.id);
                    if (f) f.enabled = e.target.checked;
                  }, 'Toggle effect')
                }
              />
              <strong style={{ fontSize: 12 }}>{def.label}</strong>
              <span className="spacer" />
              <button
                className="ghost"
                disabled={i === 0}
                onClick={() =>
                  set((c) => {
                    const idx = c.effects.findIndex((x) => x.id === fx.id);
                    if (idx > 0) {
                      const [m] = c.effects.splice(idx, 1);
                      c.effects.splice(idx - 1, 0, m!);
                    }
                  }, 'Reorder effect')
                }
                title="Move up"
              >
                ↑
              </button>
              <button
                className="ghost danger"
                onClick={() =>
                  set((c) => {
                    c.effects = c.effects.filter((x) => x.id !== fx.id);
                  }, `Remove ${def.label}`)
                }
              >
                ✕
              </button>
            </div>
            {def.params.map((p) => (
              <Slider
                key={p.key}
                label={p.label}
                value={fx.params[p.key] ?? p.default}
                min={p.min}
                max={p.max}
                step={p.step}
                onChange={(v) =>
                  set((c) => {
                    const f = c.effects.find((x) => x.id === fx.id);
                    if (f) f.params[p.key] = clampEffectParam(fx.type, p.key, v);
                  }, 'Adjust effect')
                }
              />
            ))}
          </div>
        );
      })}

      <h4 style={{ margin: '14px 0 6px' }}>AI</h4>
      <AiClipTools clip={clip} />

      <div className="muted mono" style={{ fontSize: 11, marginTop: 10 }}>
        src {clip.sourceIn}–{clip.sourceOut}f · @{clip.timelineStart}f · ◇ = add keyframe at playhead
      </div>
    </div>
  );
}

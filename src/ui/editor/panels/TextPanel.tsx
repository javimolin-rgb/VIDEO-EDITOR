import { useRef, useState } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { formatClock } from '@/lib/time';
import type { CaptionPreset } from '@/domain/types';
import { TranscribeControls } from './TranscribeControls';
import { VoiceOver } from './VoiceOver';

const PRESETS: CaptionPreset[] = ['minimal', 'bold', 'boxed', 'karaoke'];

/** Caption engine UI (spec §50–§52). */
export function TextPanel() {
  const project = useProjectStore((s) => s.project);
  const importText = useProjectStore((s) => s.importCaptionsText);
  const setEnabled = useProjectStore((s) => s.setCaptionsEnabled);
  const updateStyle = useProjectStore((s) => s.updateCaptionStyle);
  const updateCue = useProjectStore((s) => s.updateCaptionCue);
  const removeCue = useProjectStore((s) => s.removeCaptionCue);
  const fileRef = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState('');

  if (!project) return null;
  const layer = project.timeline.captionLayer;
  const tb = project.timeline.timebase;

  return (
    <div>
      <div className="row">
        <strong>Captions</strong>
        <span className="spacer" />
        <label className="row" style={{ fontSize: 11 }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={layer.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          show
        </label>
      </div>

      <TranscribeControls />

      {layer.cues.length === 0 ? (
        <>
          <div className="notice" style={{ marginTop: 8 }}>
            Import an SRT/VTT file, or paste caption text below. WebVTT word timings enable the
            karaoke style — or generate captions from a clip's audio with the on-device speech
            model above.
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => fileRef.current?.click()}>Import .srt / .vtt</button>
            <input
              ref={fileRef}
              type="file"
              accept=".srt,.vtt,.vtt.txt,text/vtt"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) importText(await f.text(), f.name);
                e.target.value = '';
              }}
            />
          </div>
          <textarea
            rows={5}
            placeholder={'1\n00:00:00,000 --> 00:00:02,000\nHello world'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            style={{ marginTop: 8 }}
          />
          <button
            className="primary"
            style={{ marginTop: 6 }}
            disabled={!paste.trim()}
            onClick={() => {
              importText(paste, 'pasted');
              setPaste('');
            }}
          >
            Parse pasted captions
          </button>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 11, margin: '8px 0' }}>
            {layer.cues.length} cues · source: {layer.sourceName ?? '—'}
          </div>

          <div className="field">
            <label>Style</label>
            <select
              value={layer.style.preset}
              onChange={(e) => updateStyle({ preset: e.target.value as CaptionPreset })}
            >
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Size — {layer.style.fontSizePct.toFixed(1)}% of height</label>
            <input
              type="range"
              min={2}
              max={12}
              step={0.1}
              value={layer.style.fontSizePct}
              onChange={(e) => updateStyle({ fontSizePct: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>Vertical position — {(layer.style.position * 100).toFixed(0)}%</label>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.01}
              value={layer.style.position}
              onChange={(e) => updateStyle({ position: Number(e.target.value) })}
            />
          </div>
          <div className="rowfields">
            <div className="field">
              <label>Text</label>
              <input
                type="color"
                value={layer.style.color}
                onChange={(e) => updateStyle({ color: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Highlight</label>
              <input
                type="color"
                value={layer.style.highlightColor}
                onChange={(e) => updateStyle({ highlightColor: e.target.value })}
              />
            </div>
          </div>
          <label className="row" style={{ fontSize: 12, marginBottom: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={layer.style.uppercase}
              onChange={(e) => updateStyle({ uppercase: e.target.checked })}
            />
            Uppercase
          </label>

          <h4 style={{ margin: '8px 0 6px' }}>Cues</h4>
          <div className="col" style={{ gap: 4, maxHeight: 260, overflow: 'auto' }}>
            {layer.cues.map((c) => (
              <div key={c.id} className="model-row" style={{ display: 'block', padding: 8 }}>
                <div className="row muted mono" style={{ fontSize: 10 }}>
                  <span>
                    {formatClock(c.startFrame, tb)} → {formatClock(c.endFrame, tb)}
                  </span>
                  <span className="spacer" />
                  <button className="ghost danger" style={{ padding: '0 6px' }} onClick={() => removeCue(c.id)}>
                    ✕
                  </button>
                </div>
                <input
                  value={c.text}
                  onChange={(e) => updateCue(c.id, { text: e.target.value })}
                  style={{ marginTop: 4 }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <VoiceOver />
    </div>
  );
}

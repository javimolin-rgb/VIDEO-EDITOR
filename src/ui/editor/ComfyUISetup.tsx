import { useMemo, useState } from 'react';
import { useUIStore } from '@/state/uiStore';
import {
  applyMap,
  describeGraph,
  loadComfyConfig,
  parseGraph,
  saveComfyConfig,
  type ComfyConfig,
  type ComfyGraph,
  type ComfyWorkflowMap,
  type FieldRef,
} from '@/ai/providers/comfyui/config';
import { comfyHealth } from '@/ai/providers/comfyui/client';

const T2V_FIELDS: Array<[keyof ComfyWorkflowMap, string]> = [
  ['positive', 'Positive prompt'],
  ['negative', 'Negative prompt'],
  ['width', 'Width'],
  ['height', 'Height'],
  ['length', 'Frame count'],
  ['fps', 'FPS'],
  ['seed', 'Seed'],
  ['steps', 'Steps'],
  ['cfg', 'CFG'],
];
const I2V_FIELDS: Array<[keyof ComfyWorkflowMap, string]> = [...T2V_FIELDS, ['image', 'First-frame image']];

function FieldMapper({
  graph,
  fields,
  map,
  onChange,
}: {
  graph: ComfyGraph | null;
  fields: Array<[keyof ComfyWorkflowMap, string]>;
  map: ComfyWorkflowMap;
  onChange: (m: ComfyWorkflowMap) => void;
}) {
  const nodes = useMemo(() => describeGraph(graph), [graph]);
  if (!graph) return null;

  const setRef = (field: keyof ComfyWorkflowMap, ref: Partial<FieldRef>) => {
    const cur = map[field] ?? { node: '', key: '' };
    onChange({ ...map, [field]: { ...cur, ...ref } });
  };

  return (
    <div className="col" style={{ gap: 4, marginTop: 6 }}>
      {fields.map(([field, label]) => {
        const ref = map[field];
        const node = nodes.find((n) => n.id === ref?.node);
        return (
          <div key={field} className="row" style={{ gap: 6, fontSize: 11 }}>
            <span style={{ width: 120, flexShrink: 0 }} className="muted">
              {label}
            </span>
            <select
              value={ref?.node ?? ''}
              onChange={(e) => setRef(field, { node: e.target.value, key: '' })}
              style={{ width: 200 }}
            >
              <option value="">— node —</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} · {n.classType}
                </option>
              ))}
            </select>
            <select
              value={ref?.key ?? ''}
              onChange={(e) => setRef(field, { key: e.target.value })}
              disabled={!node}
              style={{ width: 130 }}
            >
              <option value="">— input —</option>
              {node?.literalInputs.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ComfyUI backend setup (spec §237, §238). The user never edits node graphs
 * here — they paste a workflow exported from ComfyUI with "Save (API Format)"
 * and point at which node inputs receive the prompt / size / seed.
 */
export function ComfyUISetup() {
  const pushToast = useUIStore((s) => s.pushToast);
  const [cfg, setCfg] = useState<ComfyConfig>(loadComfyConfig());
  const [t2vText, setT2vText] = useState(cfg.t2vWorkflow ? JSON.stringify(cfg.t2vWorkflow, null, 1) : '');
  const [i2vText, setI2vText] = useState(cfg.i2vWorkflow ? JSON.stringify(cfg.i2vWorkflow, null, 1) : '');
  const [health, setHealth] = useState<string>('');

  const persist = (next: ComfyConfig) => {
    setCfg(next);
    saveComfyConfig(next);
  };

  const loadWorkflow = (text: string, which: 't2v' | 'i2v') => {
    if (!text.trim()) {
      persist({ ...cfg, [which === 't2v' ? 't2vWorkflow' : 'i2vWorkflow']: null });
      return;
    }
    try {
      const graph = parseGraph(text);
      persist({ ...cfg, [which === 't2v' ? 't2vWorkflow' : 'i2vWorkflow']: graph });
      pushToast('success', `${which.toUpperCase()} workflow loaded (${Object.keys(graph).length} nodes).`);
    } catch (e) {
      pushToast('error', String((e as Error).message ?? e));
    }
  };

  return (
    <div>
      <h4 style={{ margin: '18px 0 8px' }}>ComfyUI backend (real video generation)</h4>
      <p className="muted" style={{ fontSize: 12 }}>
        Run ComfyUI locally with a video model installed (LTX-Video for ≤12 GB VRAM, Wan 2.1 for
        ≤8 GB, HunyuanVideo for 24 GB+). Start it so the browser can reach it:
        <br />
        <span className="mono" style={{ fontSize: 11 }}>
          python main.py --listen 127.0.0.1 --port 8188 --enable-cors-header "*"
        </span>
      </p>

      <div className="field">
        <label>Server URL</label>
        <div className="row" style={{ gap: 4 }}>
          <input
            value={cfg.serverUrl}
            onChange={(e) => persist({ ...cfg, serverUrl: e.target.value.trim() })}
          />
          <button
            className="ghost"
            style={{ padding: '2px 8px' }}
            onClick={async () => {
              const h = await comfyHealth(cfg.serverUrl);
              setHealth(h.detail);
            }}
          >
            Test
          </button>
        </div>
        {health && (
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            {health}
          </div>
        )}
      </div>

      <div className="rowfields">
        <div className="field">
          <label>Default steps</label>
          <input
            type="number"
            value={cfg.steps}
            onChange={(e) => persist({ ...cfg, steps: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Default CFG</label>
          <input
            type="number"
            step={0.5}
            value={cfg.cfg}
            onChange={(e) => persist({ ...cfg, cfg: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="model-row" style={{ display: 'block', padding: 10 }}>
        <strong style={{ fontSize: 12 }}>Text → Video workflow (API format)</strong>
        <textarea
          rows={4}
          placeholder='Paste the JSON from ComfyUI → Save (API Format). e.g. {"3":{"class_type":"KSampler","inputs":{...}}, ...}'
          value={t2vText}
          onChange={(e) => setT2vText(e.target.value)}
          onBlur={() => loadWorkflow(t2vText, 't2v')}
          style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11 }}
        />
        <FieldMapper
          graph={cfg.t2vWorkflow}
          fields={T2V_FIELDS}
          map={cfg.t2vMap}
          onChange={(t2vMap) => persist({ ...cfg, t2vMap })}
        />
      </div>

      <div className="model-row" style={{ display: 'block', padding: 10, marginTop: 8 }}>
        <strong style={{ fontSize: 12 }}>Image → Video workflow (optional)</strong>
        <textarea
          rows={4}
          placeholder="Paste an API-format workflow with a LoadImage node."
          value={i2vText}
          onChange={(e) => setI2vText(e.target.value)}
          onBlur={() => loadWorkflow(i2vText, 'i2v')}
          style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11 }}
        />
        <FieldMapper
          graph={cfg.i2vWorkflow}
          fields={I2V_FIELDS}
          map={cfg.i2vMap}
          onChange={(i2vMap) => persist({ ...cfg, i2vMap })}
        />
      </div>

      <label className="row" style={{ fontSize: 12, marginTop: 10 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={cfg.enabled}
          onChange={(e) => persist({ ...cfg, enabled: e.target.checked })}
        />
        Use ComfyUI for generation when reachable (routes ahead of the procedural generator)
      </label>

      <button
        style={{ marginTop: 8 }}
        disabled={!cfg.t2vWorkflow}
        onClick={() => {
          try {
            applyMap(cfg.t2vWorkflow!, cfg.t2vMap, {
              positive: 'test',
              width: 768,
              height: 512,
              length: 49,
              seed: 1,
            });
            pushToast('success', 'Mapping looks valid — the mapped node inputs exist in the graph.');
          } catch (e) {
            pushToast('error', `Mapping problem: ${String(e)}`);
          }
        }}
      >
        Validate T2V mapping
      </button>
    </div>
  );
}

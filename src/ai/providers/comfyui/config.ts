/**
 * ComfyUI adapter config (spec §236, §237). ComfyUI is an *optional* local
 * backend — a separate process the user runs. The app talks to its HTTP API;
 * it never needs to understand node graphs (spec §238). Because ComfyUI video
 * workflows vary wildly by model and version, the user pastes a workflow they
 * exported with **Save (API Format)** and maps which node inputs receive the
 * prompt / size / seed / image.
 */

export interface FieldRef {
  /** Node id in the API-format graph. */
  node: string;
  /** Input key on that node. */
  key: string;
}

export interface ComfyWorkflowMap {
  positive?: FieldRef;
  negative?: FieldRef;
  width?: FieldRef;
  height?: FieldRef;
  /** Frame count (length). */
  length?: FieldRef;
  fps?: FieldRef;
  seed?: FieldRef;
  steps?: FieldRef;
  cfg?: FieldRef;
  /** I2V only: a LoadImage node's `image` input. */
  image?: FieldRef;
}

/** API-format workflow: { nodeId: { class_type, inputs } }. */
export type ComfyGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export interface ComfyConfig {
  serverUrl: string;
  enabled: boolean;
  t2vWorkflow: ComfyGraph | null;
  t2vMap: ComfyWorkflowMap;
  i2vWorkflow: ComfyGraph | null;
  i2vMap: ComfyWorkflowMap;
  /** Extra sampler params if the user wants to fix them. */
  steps: number;
  cfg: number;
}

export const DEFAULT_COMFY: ComfyConfig = {
  serverUrl: 'http://127.0.0.1:8188',
  enabled: false,
  t2vWorkflow: null,
  t2vMap: {},
  i2vWorkflow: null,
  i2vMap: {},
  steps: 25,
  cfg: 3,
};

const KEY = 'aiv.comfyui';

export function loadComfyConfig(): ComfyConfig {
  try {
    return { ...DEFAULT_COMFY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ComfyConfig>) };
  } catch {
    return { ...DEFAULT_COMFY };
  }
}

export function saveComfyConfig(cfg: ComfyConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* private mode */
  }
}

export interface GraphNodeOption {
  id: string;
  classType: string;
  /** input keys that hold a literal (string/number), i.e. mappable. */
  literalInputs: string[];
}

/** List the nodes of a pasted graph, with their literal input keys, for the UI. */
export function describeGraph(graph: ComfyGraph | null): GraphNodeOption[] {
  if (!graph) return [];
  return Object.entries(graph).map(([id, node]) => ({
    id,
    classType: node.class_type,
    literalInputs: Object.entries(node.inputs)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k]) => k),
  }));
}

export function parseGraph(text: string): ComfyGraph {
  const raw = JSON.parse(text) as unknown;
  // Accept either the raw API export or a { prompt: {...} } wrapper.
  const graph = (raw as { prompt?: unknown }).prompt ?? raw;
  if (!graph || typeof graph !== 'object') throw new Error('Not a workflow object.');
  const entries = Object.values(graph as Record<string, unknown>);
  if (!entries.every((n) => n && typeof n === 'object' && 'class_type' in (n as object))) {
    throw new Error('This is not an API-format workflow. In ComfyUI use “Save (API Format)”.');
  }
  return graph as ComfyGraph;
}

/** Apply the mapped values onto a *clone* of the graph. */
export function applyMap(
  graph: ComfyGraph,
  map: ComfyWorkflowMap,
  values: Partial<Record<keyof ComfyWorkflowMap, string | number>>,
): ComfyGraph {
  const clone: ComfyGraph = JSON.parse(JSON.stringify(graph));
  for (const field of Object.keys(map) as Array<keyof ComfyWorkflowMap>) {
    const ref = map[field];
    const val = values[field];
    if (!ref || val === undefined) continue;
    const node = clone[ref.node];
    if (node && ref.key in node.inputs) node.inputs[ref.key] = val;
  }
  return clone;
}

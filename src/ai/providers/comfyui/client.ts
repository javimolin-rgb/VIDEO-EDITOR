/**
 * Thin ComfyUI HTTP/WS client. Queues an API-format graph, follows progress
 * over the websocket, and downloads the produced video/image sequence.
 */

import { createLogger } from '@/lib/logger';
import type { ComfyGraph } from './config';

const log = createLogger('ai');

export interface ComfyStats {
  deviceName: string;
  vramTotalGb: number | null;
  vramFreeGb: number | null;
}

export interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

const clientId = `aiv-${Math.random().toString(36).slice(2, 10)}`;

export async function comfyHealth(base: string): Promise<{ ok: boolean; detail: string; stats?: ComfyStats }> {
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/system_stats`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ok: false, detail: `ComfyUI HTTP ${res.status}` };
    const body = (await res.json()) as {
      devices?: Array<{ name: string; vram_total?: number; vram_free?: number }>;
    };
    const d = body.devices?.[0];
    return {
      ok: true,
      detail: d ? `ComfyUI up · ${d.name}` : 'ComfyUI up',
      stats: d
        ? {
            deviceName: d.name,
            vramTotalGb: d.vram_total ? d.vram_total / 1024 ** 3 : null,
            vramFreeGb: d.vram_free ? d.vram_free / 1024 ** 3 : null,
          }
        : undefined,
    };
  } catch {
    return {
      ok: false,
      detail:
        'ComfyUI is not reachable. Start it with --listen and --enable-cors-header "*", then set the URL here.',
    };
  }
}

export async function uploadImage(base: string, blob: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append('image', blob, name);
  form.append('overwrite', 'true');
  const res = await fetch(`${base.replace(/\/$/, '')}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status}`);
  const body = (await res.json()) as { name: string; subfolder?: string };
  return body.subfolder ? `${body.subfolder}/${body.name}` : body.name;
}

export interface RunHandle {
  promptId: string;
  cancel: () => Promise<void>;
  /** Resolves with the produced output files when execution finishes. */
  done: Promise<ComfyOutputFile[]>;
}

export async function queuePrompt(
  base: string,
  graph: ComfyGraph,
  onProgress: (fraction: number | null, message: string) => void,
  signal: AbortSignal,
): Promise<ComfyOutputFile[]> {
  const host = base.replace(/\/$/, '');
  const wsUrl = host.replace(/^http/, 'ws') + `/ws?clientId=${clientId}`;

  const res = await fetch(`${host}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ComfyUI rejected the workflow (${res.status}): ${txt.slice(0, 200)}`);
  }
  const { prompt_id: promptId } = (await res.json()) as { prompt_id: string };
  log.info('comfy prompt queued', { promptId });

  return new Promise<ComfyOutputFile[]>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const cleanup = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
    signal.addEventListener('abort', () => {
      void fetch(`${host}/interrupt`, { method: 'POST' }).catch(() => undefined);
      cleanup();
      reject(new Error('Generation cancelled'));
    });

    ws.onmessage = async (ev) => {
      if (typeof ev.data !== 'string') return;
      const msg = JSON.parse(ev.data) as { type: string; data: Record<string, unknown> };
      if (msg.type === 'progress') {
        const value = Number(msg.data.value ?? 0);
        const max = Number(msg.data.max ?? 1);
        onProgress(max > 0 ? value / max : null, `Sampling ${value}/${max}`);
      } else if (msg.type === 'executing' && msg.data.node) {
        onProgress(null, `Running node ${String(msg.data.node)}`);
      } else if (msg.type === 'execution_error') {
        cleanup();
        reject(new Error(`ComfyUI error: ${String(msg.data.exception_message ?? 'workflow failed')}`));
      } else if (
        msg.type === 'executing' &&
        msg.data.node === null &&
        msg.data.prompt_id === promptId
      ) {
        // Execution finished — collect outputs from history.
        cleanup();
        try {
          resolve(await collectOutputs(host, promptId));
        } catch (e) {
          reject(e as Error);
        }
      }
    };
    ws.onerror = () => {
      cleanup();
      reject(new Error('Lost connection to ComfyUI.'));
    };
  });
}

async function collectOutputs(host: string, promptId: string): Promise<ComfyOutputFile[]> {
  const res = await fetch(`${host}/history/${promptId}`);
  if (!res.ok) throw new Error(`ComfyUI history ${res.status}`);
  const body = (await res.json()) as Record<
    string,
    { outputs: Record<string, { images?: ComfyOutputFile[]; gifs?: ComfyOutputFile[]; videos?: ComfyOutputFile[] }> }
  >;
  const entry = body[promptId];
  if (!entry) throw new Error('ComfyUI produced no output.');
  const files: ComfyOutputFile[] = [];
  for (const out of Object.values(entry.outputs)) {
    files.push(...(out.videos ?? []), ...(out.gifs ?? []), ...(out.images ?? []));
  }
  if (files.length === 0) throw new Error('The workflow ran but saved no video/image.');
  return files;
}

export async function downloadOutput(base: string, file: ComfyOutputFile): Promise<Blob> {
  const host = base.replace(/\/$/, '');
  const q = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? '',
    type: file.type ?? 'output',
  });
  const res = await fetch(`${host}/view?${q}`);
  if (!res.ok) throw new Error(`ComfyUI view ${res.status}`);
  return res.blob();
}

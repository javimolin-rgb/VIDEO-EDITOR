/**
 * Hugging Face Space client — calls a public Gradio image-generation Space's
 * REST API. Keyless and CORS-open (Gradio reflects the request origin), so it
 * works from a static site with no token. Free Spaces sleep and enforce a
 * per-IP GPU quota, so the provider tries several Spaces in order.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('ai');

export interface SpaceConfig {
  /** "owner/name" → https://owner-name.hf.space */
  id: string;
  /** Gradio api endpoint name, e.g. "infer". */
  fn: string;
  /** Build the Gradio `data` array from the prompt + size + seed. */
  buildInput: (p: { prompt: string; width: number; height: number; seed: number }) => unknown[];
  /** Index of the image in the result array. */
  imageIndex: number;
}

/** Turn "owner/name" into the Space's base URL. */
function baseUrl(id: string): string {
  return `https://${id.replace(/[/_.]/g, '-').toLowerCase()}.hf.space`;
}

export const DEFAULT_SPACES: SpaceConfig[] = [
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    fn: 'infer',
    buildInput: ({ prompt, width, height, seed }) => [prompt, seed, false, width, height, 4],
    imageIndex: 0,
  },
  {
    id: 'multimodalart/FLUX.1-merged',
    fn: 'infer',
    buildInput: ({ prompt, width, height, seed }) => [prompt, seed, false, width, height, 8, 3.5],
    imageIndex: 0,
  },
  {
    id: 'black-forest-labs/FLUX.1-dev',
    fn: 'infer',
    buildInput: ({ prompt, width, height, seed }) => [prompt, seed, false, width, height, 3.5, 28],
    imageIndex: 0,
  },
];

interface GradioFile {
  url?: string;
  path?: string;
}

function extractImageUrl(base: string, result: unknown, idx: number): string | null {
  const arr = Array.isArray(result) ? result : [result];
  const item = arr[idx] ?? arr[0];
  const f = item as GradioFile | string | undefined;
  if (!f) return null;
  if (typeof f === 'string') return f.startsWith('http') ? f : null;
  if (f.url) return f.url;
  if (f.path) return `${base}/gradio_api/file=${f.path}`;
  return null;
}

function abortable<T>(signal: AbortSignal, p: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    p.then(resolve, reject);
  });
}

/** Run one Space; returns an image Blob or throws. */
async function callSpace(
  space: SpaceConfig,
  input: { prompt: string; width: number; height: number; seed: number },
  signal: AbortSignal,
  note: (s: string) => void,
): Promise<Blob> {
  const base = baseUrl(space.id);
  note(`Contacting ${space.id.split('/')[1]}…`);

  const post = await abortable(
    signal,
    fetch(`${base}/gradio_api/call/${space.fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: space.buildInput(input) }),
      signal,
    }),
  );
  if (post.status === 503) throw new Error('space-sleeping');
  if (!post.ok) throw new Error(`Space ${space.id} POST ${post.status}`);
  const { event_id: eventId } = (await post.json()) as { event_id?: string };
  if (!eventId) throw new Error(`Space ${space.id} gave no event id`);

  // Read the SSE stream until "complete" / "error".
  const res = await abortable(signal, fetch(`${base}/gradio_api/call/${space.fn}/${eventId}`, { signal }));
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let payload: unknown = null;
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 150_000) throw new Error('space-timeout');
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() ?? '';
    for (const ev of events) {
      const type = /^event:\s*(\w+)/m.exec(ev)?.[1];
      const dataLine = /^data:\s*(.*)$/m.exec(ev)?.[1];
      if (type === 'error') throw new Error('space-error');
      if (type === 'complete' && dataLine) {
        try {
          payload = JSON.parse(dataLine);
        } catch {
          payload = null;
        }
      } else if (dataLine && /queue|progress|estimation/i.test(ev)) {
        note(`${space.id.split('/')[1]}: in queue…`);
      }
    }
    if (payload) break;
  }
  reader.cancel().catch(() => undefined);
  if (!payload) throw new Error('space-noresult');

  const imgUrl = extractImageUrl(base, payload, space.imageIndex);
  if (!imgUrl) throw new Error('space-noimage');
  note('Downloading the image…');
  const imgRes = await abortable(signal, fetch(imgUrl, { mode: 'cors', signal }));
  if (!imgRes.ok) throw new Error(`image ${imgRes.status}`);
  const blob = await imgRes.blob();
  if (blob.size < 512 || !blob.type.startsWith('image/')) throw new Error('bad image');
  return blob;
}

/** Try each Space until one returns an image. */
export async function generateWithSpaces(
  spaces: SpaceConfig[],
  input: { prompt: string; width: number; height: number; seed: number },
  signal: AbortSignal,
  note: (s: string) => void,
): Promise<{ blob: Blob; space: string }> {
  let lastErr: Error | null = null;
  for (const space of spaces) {
    try {
      const blob = await callSpace(space, input, signal, note);
      return { blob, space: space.id };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e as Error;
      log.warn('HF Space failed, trying next', { space: space.id, error: String(e) });
      note(`${space.id.split('/')[1]} unavailable, trying another…`);
    }
  }
  throw new Error(
    `No free Hugging Face Space could generate right now (${lastErr?.message ?? 'unknown'}). ` +
      'They sleep and have hourly quotas — try again in a few minutes, or connect fal.ai / ComfyUI.',
  );
}

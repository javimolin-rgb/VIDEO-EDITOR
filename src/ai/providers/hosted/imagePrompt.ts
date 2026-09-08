import type { GenerationRequestBase } from '@/ai/provider';

const PHOTO_SUFFIX =
  'photorealistic, highly detailed, sharp focus, natural lighting, realistic materials, architectural visualization, 8k';

const META_LINE = /^\s*(\d+[).\]]|[-*•]|#{1,6}\s|MASTER PROMPT|CORE RULE|Workflow:|Rendering Style:|Strict Negative)/i;
const NEGATIVE_CUE = /\b(no |not |never |avoid |without |negative)\b/i;

/**
 * Turn a generation request into a compact prompt an image model can use.
 * Long pasted "master prompts" (numbered rules, camera-lock clauses, negative
 * constraint blocks) are stripped to their descriptive sentences so the model
 * sees a scene, not an instruction manual.
 */
export function buildImagePrompt(req: GenerationRequestBase): string {
  const raw = (req.prompt ?? '').replace(/\r/g, '').trim();

  let scene: string;
  if (raw.length <= 320 && !raw.includes('\n')) {
    scene = raw;
  } else {
    const sentences = raw
      .split(/\n+/)
      .filter((l) => !META_LINE.test(l))
      .join(' ')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12 && !NEGATIVE_CUE.test(s.slice(0, 24)));
    scene = sentences.slice(0, 3).join(' ').slice(0, 340);
  }

  if (!scene) scene = raw.slice(0, 200);

  const parts = [scene.trim().replace(/\s+/g, ' ')];
  const ar = req.aspectRatio ? `${req.aspectRatio} framing` : '';
  if (ar) parts.push(ar);
  parts.push(PHOTO_SUFFIX);
  return parts.filter(Boolean).join(', ');
}

/**
 * image.pollinations.ai URL for a prompt. Keyless. Kept to the minimal param
 * set — `nologo` / `enhance` and some models trip Pollinations' auth filter
 * for browser origins. `referrer` is what they allowlist per app.
 */
export function pollinationsUrl(
  prompt: string,
  opts: { width: number; height: number; seed: number; model: string; referrer?: string },
): string {
  const q = new URLSearchParams({
    width: String(Math.min(1536, Math.max(256, Math.round(opts.width)))),
    height: String(Math.min(1536, Math.max(256, Math.round(opts.height)))),
    seed: String(opts.seed >>> 0),
  });
  if (opts.model && opts.model !== 'flux') q.set('model', opts.model);
  if (opts.referrer) q.set('referrer', opts.referrer);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q.toString()}`;
}

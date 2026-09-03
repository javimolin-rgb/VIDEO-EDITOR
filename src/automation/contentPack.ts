/**
 * AI content pack (spec §182) + hook note (spec §84). Deterministic text
 * derived from the transcript / caption lines — no LLM, no invented facts.
 * Language stays heuristic ("consider…", "you could…").
 */

import { extractVisualConcepts } from '@/ai/director/broll';

const CTA_RE = /\b(shop|buy|get|try|visit|subscribe|link in bio|order|download|sign up|learn more|watch)\b/i;

export interface ContentPack {
  title: string;
  description: string;
  tags: string[];
  cta: string;
  hookNote: string;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildContentPack(lines: string[], product?: string): ContentPack {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const sentences = (text.match(/[^.!?]+[.!?]?/g) ?? [text]).map((s) => s.trim()).filter(Boolean);

  const first = sentences[0] ?? product ?? 'Untitled';
  const title = titleCase(first.replace(/[.!?]+$/, '').slice(0, 64)).trim();

  const description =
    sentences.slice(0, 3).join(' ').slice(0, 280) || `A short video${product ? ` about ${product}` : ''}.`;

  const concepts = new Set<string>();
  if (product) concepts.add(product.toLowerCase());
  for (const l of lines) for (const c of extractVisualConcepts(l, 3)) concepts.add(c);
  const tags = [...concepts].slice(0, 8);

  const ctaLine = [...sentences].reverse().find((s) => CTA_RE.test(s));
  const cta = ctaLine ? ctaLine.replace(/[.!?]+$/, '') : 'Watch to the end.';

  const opener = sentences[0] ?? '';
  const hookNote = /\?$/.test(opener)
    ? 'Opens with a question — good. Make sure the first frame has movement or a subject on screen.'
    : opener.split(/\s+/).length > 14
      ? 'The opening line is long. Consider a 3–5 word hook on screen in the first second.'
      : 'Opens with a statement. A question, a number, or a visual reveal in the first second often lifts retention (heuristic — confirm with your own analytics).';

  return { title: title || 'Untitled', description, tags, cta, hookNote };
}

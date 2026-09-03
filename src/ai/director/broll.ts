/**
 * Generative B-roll concept extraction (spec §43). Pulls the concrete visual
 * nouns out of a narration line so the editor can search local assets first
 * and only generate what it can't find.
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', "it's", 'this', 'that', 'these',
  'those', 'we', 'you', 'they', 'i', 'he', 'she', 'as', 'so', 'if', 'then', 'than', 'has', 'have',
  'had', 'will', 'would', 'can', 'could', 'our', 'your', 'their', 'my', 'his', 'her', 'not', 'no',
  'do', 'does', 'did', 'about', 'into', 'over', 'up', 'out', 'more', 'most', 'very', 'just', 'now',
  'today', 'here', 'there', 'when', 'where', 'what', 'who', 'how', 'all', 'some', 'any', 'each',
]);

/** Concrete concepts (1–3 word phrases), most salient first. */
export function extractVisualConcepts(text: string, limit = 4): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const phrases: string[] = [];
  let buf: string[] = [];
  for (const w of words) {
    if (STOP.has(w) || w.length < 3) {
      if (buf.length) {
        phrases.push(buf.join(' '));
        buf = [];
      }
      continue;
    }
    buf.push(w);
    if (buf.length === 3) {
      phrases.push(buf.join(' '));
      buf = [];
    }
  }
  if (buf.length) phrases.push(buf.join(' '));

  // Rank: longer phrases and rarer words first.
  const seen = new Set<string>();
  const ranked = phrases
    .map((p) => p.trim())
    .filter((p) => p.length >= 3)
    .filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    })
    .sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);

  return ranked.slice(0, limit);
}

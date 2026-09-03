/**
 * Creative brief generation (spec §183). Turns a short objective + product
 * into a structured brief and a readable summary. Heuristic, deterministic.
 */

import type { CreativeBrief } from './types';
import { DEFAULT_BRIEF } from './types';

const STYLE_WORDS = [
  'cinematic',
  'editorial',
  'fashion',
  'documentary',
  'commercial',
  'minimal',
  'analog',
  'luxury',
];

export function inferBrief(objective: string, product: string): CreativeBrief {
  const text = `${objective} ${product}`.toLowerCase();
  const style = STYLE_WORDS.find((w) => text.includes(w)) ?? DEFAULT_BRIEF.style;

  let platform: CreativeBrief['platform'] = 'reel';
  if (/tiktok/.test(text)) platform = 'tiktok';
  else if (/youtube|\byt\b|landscape|16:9|16 9/.test(text)) platform = 'youtube';
  else if (/story|stories/.test(text)) platform = 'story';
  else if (/square|1:1|feed post/.test(text)) platform = 'square';

  const durMatch = text.match(/(\d{1,3})\s*(s|sec|second)/);
  const durationSec = durMatch ? Math.min(60, Math.max(4, Number(durMatch[1]))) : DEFAULT_BRIEF.durationSec;

  const luxury = /luxury|premium|elegant|refined/.test(text);
  const energetic = /energetic|fast|dynamic|hype|bold/.test(text);
  const mood = luxury ? 'warm, refined, unhurried' : energetic ? 'punchy, high-energy' : DEFAULT_BRIEF.mood;

  const shotCount = Math.max(3, Math.min(10, Math.round(durationSec / 4)));

  return {
    objective: objective.trim() || 'Showcase the product',
    product: product.trim() || 'the product',
    audience: DEFAULT_BRIEF.audience,
    platform,
    durationSec,
    style,
    mood,
    shotCount,
  };
}

export function briefSummary(b: CreativeBrief): string {
  return [
    `Objective: ${b.objective}.`,
    `Product: ${b.product}.`,
    `Audience: ${b.audience}.`,
    `Platform: ${b.platform} (${b.durationSec}s).`,
    `Visual direction: ${b.style}, ${b.mood}.`,
    `Structure: hook → ${b.shotCount - 2} product beats → close/CTA.`,
  ].join('\n');
}

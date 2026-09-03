/**
 * Caption ingest + rendering (spec §50, §51, §52). Parses SRT and WebVTT
 * (including inline `<00:00:02.000>` word timings when present) into
 * `CaptionCue[]`, and draws the active cue with the chosen style. The same
 * `drawCaptions` runs in the preview and the final render.
 */

import { newId } from '@/lib/id';
import { secondsToFrames } from '@/lib/time';
import type { CaptionCue, CaptionLayer, CaptionWord } from '@/domain/types';

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

function toSeconds(m: RegExpMatchArray): number {
  const hh = m[1] ?? '0';
  const mm = m[2] ?? '0';
  const ss = m[3] ?? '0';
  const ms = m[4] ?? '0';
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, '0')) / 1000;
}

interface ParseResult {
  format: 'srt' | 'vtt' | 'unknown';
  cues: CaptionCue[];
}

export function parseCaptions(text: string, fps: number): ParseResult {
  const isVtt = /^\uFEFF?WEBVTT/.test(text.trimStart());
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (/^WEBVTT/.test(lines[0]!)) continue;
    // Optional numeric/id line first.
    let idx = 0;
    if (lines[idx] && !lines[idx]!.includes('-->')) idx++;
    const timingLine = lines[idx];
    if (!timingLine || !timingLine.includes('-->')) continue;

    const [startRaw, endRaw] = timingLine.split('-->');
    const sm = startRaw!.match(TIME_RE);
    const em = endRaw!.match(TIME_RE);
    if (!sm || !em) continue;
    const startSec = toSeconds(sm);
    const endSec = toSeconds(em);

    const bodyLines = lines.slice(idx + 1);
    const body = bodyLines.join('\n');
    const words = extractWordTimings(body, startSec, endSec, fps);
    const plain = body.replace(/<[^>]+>/g, '').trim();
    if (!plain) continue;

    cues.push({
      id: newId('marker'),
      startFrame: secondsToFrames(startSec, { fps, dropFrame: false }),
      endFrame: secondsToFrames(endSec, { fps, dropFrame: false }),
      text: plain,
      words: words.length ? words : undefined,
    });
  }

  cues.sort((a, b) => a.startFrame - b.startFrame);
  return { format: isVtt ? 'vtt' : cues.length ? 'srt' : 'unknown', cues };
}

function extractWordTimings(
  body: string,
  startSec: number,
  endSec: number,
  fps: number,
): CaptionWord[] {
  if (!body.includes('<')) return [];
  // Split on inline timestamp tags; text between tags belongs to the preceding time.
  const parts = body.split(/<(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})>/);
  const words: CaptionWord[] = [];
  let currentStart = startSec;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const m = parts[i]!.match(TIME_RE);
      if (m) currentStart = toSeconds(m);
      continue;
    }
    const chunk = parts[i]!.replace(/<[^>]+>/g, '').trim();
    if (!chunk) continue;
    for (const w of chunk.split(/\s+/)) {
      words.push({
        text: w,
        startFrame: secondsToFrames(currentStart, { fps, dropFrame: false }),
        endFrame: secondsToFrames(endSec, { fps, dropFrame: false }),
      });
    }
  }
  // Give each word an end at the next word's start.
  for (let i = 0; i < words.length - 1; i++) {
    words[i]!.endFrame = words[i + 1]!.startFrame;
  }
  return words;
}

// ─── rendering ──────────────────────────────────────────────────────────────

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length === 0) line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  layer: CaptionLayer,
  frame: number,
  w: number,
  h: number,
): void {
  const cue = layer.cues.find((c) => frame >= c.startFrame && frame < c.endFrame);
  if (!cue) return;

  const style = layer.style;
  const fontPx = Math.round((style.fontSizePct / 100) * h);
  const lineHeight = Math.round(fontPx * 1.25);
  const text = style.uppercase ? cue.text.toUpperCase() : cue.text;
  const lines = wrap(text, style.maxCharsPerLine);

  ctx.save();
  ctx.font = `700 ${fontPx}px ${style.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const blockH = lines.length * lineHeight;
  const centerY = Math.round(h * style.position);
  let y = centerY - blockH / 2 + lineHeight / 2;
  const cx = w / 2;

  for (const line of lines) {
    const metrics = ctx.measureText(line);
    const padX = fontPx * 0.5;
    const padY = fontPx * 0.28;

    if (style.preset === 'boxed') {
      ctx.fillStyle = style.backgroundColor;
      roundRect(
        ctx,
        cx - metrics.width / 2 - padX,
        y - lineHeight / 2 - padY,
        metrics.width + padX * 2,
        lineHeight + padY * 2,
        fontPx * 0.18,
      );
      ctx.fill();
    }

    if (style.preset === 'karaoke' && cue.words && cue.words.length) {
      drawKaraokeLine(ctx, line, cue, frame, cx, y, style.color, style.highlightColor);
    } else {
      if (style.preset === 'bold' || style.preset === 'minimal') {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = style.preset === 'bold' ? fontPx * 0.16 : fontPx * 0.08;
        ctx.strokeText(line, cx, y);
      }
      ctx.fillStyle = style.color;
      ctx.fillText(line, cx, y);
    }
    y += lineHeight;
  }
  ctx.restore();
}

function drawKaraokeLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  cue: CaptionCue,
  frame: number,
  cx: number,
  y: number,
  color: string,
  highlight: string,
): void {
  const tokens = line.split(/\s+/);
  const spaceW = ctx.measureText(' ').width;
  const totalW = tokens.reduce((sum, t) => sum + ctx.measureText(t).width, 0) + spaceW * (tokens.length - 1);
  let x = cx - totalW / 2;
  ctx.textAlign = 'left';
  for (const tok of tokens) {
    const match = cue.words?.find((wd) => wd.text.replace(/[^\p{L}\p{N}']/gu, '') === tok.replace(/[^\p{L}\p{N}']/gu, ''));
    const spoken = match ? frame >= match.startFrame : false;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeText(tok, x, y);
    ctx.fillStyle = spoken ? highlight : color;
    ctx.fillText(tok, x, y);
    x += ctx.measureText(tok).width + spaceW;
  }
  ctx.textAlign = 'center';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

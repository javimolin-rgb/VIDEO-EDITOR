/** Rolling FPS estimate for the preview compositor (spec §247). */

let times: number[] = [];

export function markFrame(): void {
  const now = performance.now();
  times.push(now);
  const cutoff = now - 1000;
  if (times.length > 120 || (times[0] ?? now) < cutoff) {
    times = times.filter((t) => t >= cutoff);
  }
}

export function getFps(): number {
  if (times.length < 2) return 0;
  const span = (times[times.length - 1]! - times[0]!) / 1000;
  return span > 0 ? Math.round((times.length - 1) / span) : 0;
}

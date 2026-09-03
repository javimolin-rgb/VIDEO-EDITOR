/**
 * Channel-scoped logging (spec §246). Each subsystem gets its own logger so
 * diagnostics can be filtered and later exported.
 */

export type LogChannel =
  | 'ui'
  | 'domain'
  | 'storage'
  | 'video'
  | 'export'
  | 'ai'
  | 'runtime';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: number;
  channel: LogChannel;
  level: LogLevel;
  msg: string;
  data?: unknown;
}

const RING_SIZE = 2000;
const ring: LogEntry[] = [];

const levelWeight: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold: LogLevel = import.meta.env?.DEV ? 'debug' : 'info';

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

function push(entry: LogEntry): void {
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  if (levelWeight[entry.level] < levelWeight[threshold]) return;
  const tag = `%c[${entry.channel}]`;
  const style =
    entry.level === 'error'
      ? 'color:#ff6b6b'
      : entry.level === 'warn'
        ? 'color:#ffa94d'
        : 'color:#748ffc';
  const fn =
    entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
  if (entry.data !== undefined) fn(tag, style, entry.msg, entry.data);
  else fn(tag, style, entry.msg);
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(channel: LogChannel): Logger {
  const make =
    (level: LogLevel) =>
    (msg: string, data?: unknown): void =>
      push({ ts: Date.now(), channel, level, msg, data });
  return { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') };
}

/** Snapshot of the in-memory log ring, for the debug panel / diagnostic export. */
export function dumpLogs(): readonly LogEntry[] {
  return ring.slice();
}

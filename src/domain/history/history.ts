/**
 * Snapshot history for undo/redo (spec §19, §122, §276).
 *
 * Phase 1 uses whole-project snapshots: simple, correct, and cheap because a
 * project without embedded media is small JSON. Each entry is tagged so the
 * UI can show an AI activity log (spec §121) and distinguish AI changes from
 * manual edits for "undo AI change" (spec §19).
 */

export type HistoryEntryKind = 'edit' | 'ai' | 'import' | 'system';

export interface HistoryEntry<T> {
  id: string;
  label: string;
  kind: HistoryEntryKind;
  at: number;
  snapshot: T;
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[];
  present: HistoryEntry<T>;
  future: HistoryEntry<T>[];
}

export interface HistoryOptions {
  limit: number;
}

const DEFAULT_LIMIT = 100;

let counter = 0;
function entryId(): string {
  counter += 1;
  return `h${counter}_${Date.now().toString(36)}`;
}

export function initHistory<T>(initial: T, label = 'Project opened'): HistoryState<T> {
  return {
    past: [],
    present: { id: entryId(), label, kind: 'system', at: Date.now(), snapshot: initial },
    future: [],
  };
}

export function commit<T>(
  state: HistoryState<T>,
  snapshot: T,
  label: string,
  kind: HistoryEntryKind = 'edit',
  opts: HistoryOptions = { limit: DEFAULT_LIMIT },
): HistoryState<T> {
  const past = [...state.past, state.present];
  while (past.length > opts.limit) past.shift();
  return {
    past,
    present: { id: entryId(), label, kind, at: Date.now(), snapshot },
    future: [],
  };
}

export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  const prev = state.past[state.past.length - 1];
  if (!prev) return state;
  return {
    past: state.past.slice(0, -1),
    present: prev,
    future: [state.present, ...state.future],
  };
}

export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  const next = state.future[0];
  if (!next) return state;
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}

export function canUndo<T>(state: HistoryState<T>): boolean {
  return state.past.length > 0;
}

export function canRedo<T>(state: HistoryState<T>): boolean {
  return state.future.length > 0;
}

/** Newest-first list of applied changes, for the activity log UI. */
export function timeline<T>(state: HistoryState<T>): HistoryEntry<T>[] {
  return [...state.past, state.present].reverse();
}

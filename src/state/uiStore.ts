/**
 * UI-only state (spec §170): what is selected, which workspace is open, zoom,
 * transport. Never persisted with the project.
 */

import { create } from 'zustand';

export type Workspace = 'edit' | 'studio' | 'ai-setup';
export type LeftPanel = 'media' | 'generate' | 'effects' | 'audio' | 'text';
export type RightPanel = 'inspector' | 'transcript' | 'activity' | 'settings';

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface UIState {
  workspace: Workspace;
  leftPanel: LeftPanel;
  rightPanel: RightPanel;

  selectedClipIds: string[];
  selectedAssetId: string | null;
  selectedTransitionId: string | null;
  activeTrackId: string | null;

  /** Timeline horizontal zoom, in pixels per frame. */
  pxPerFrame: number;
  snapEnabled: boolean;

  isPlaying: boolean;
  /** Wall-clock ms of the last rAF tick used to advance the playhead. */
  lastTickAt: number | null;

  toasts: Toast[];
  commandPaletteOpen: boolean;

  setWorkspace: (w: Workspace) => void;
  setLeftPanel: (p: LeftPanel) => void;
  setRightPanel: (p: RightPanel) => void;

  selectClips: (ids: string[], additive?: boolean) => void;
  clearClipSelection: () => void;
  selectAsset: (id: string | null) => void;
  selectTransition: (id: string | null) => void;
  setActiveTrack: (id: string | null) => void;

  setZoom: (pxPerFrame: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSnap: () => void;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setTick: (ts: number | null) => void;

  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  setCommandPalette: (open: boolean) => void;
}

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 12;

export const useUIStore = create<UIState>((set) => ({
  workspace: 'edit',
  leftPanel: 'media',
  rightPanel: 'inspector',

  selectedClipIds: [],
  selectedAssetId: null,
  selectedTransitionId: null,
  activeTrackId: null,

  pxPerFrame: 0.4,
  snapEnabled: true,

  isPlaying: false,
  lastTickAt: null,

  toasts: [],
  commandPaletteOpen: false,

  setWorkspace: (workspace) => set({ workspace }),
  setLeftPanel: (leftPanel) => set({ leftPanel }),
  setRightPanel: (rightPanel) => set({ rightPanel }),

  selectClips: (ids, additive = false) =>
    set((s) => ({
      selectedClipIds: additive
        ? Array.from(new Set([...s.selectedClipIds, ...ids]))
        : ids,
      selectedTransitionId: null,
    })),
  clearClipSelection: () => set({ selectedClipIds: [] }),
  selectAsset: (selectedAssetId) => set({ selectedAssetId }),
  selectTransition: (selectedTransitionId) =>
    set({ selectedTransitionId, selectedClipIds: [] }),
  setActiveTrack: (activeTrackId) => set({ activeTrackId }),

  setZoom: (pxPerFrame) =>
    set({ pxPerFrame: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerFrame)) }),
  zoomIn: () => set((s) => ({ pxPerFrame: Math.min(MAX_ZOOM, s.pxPerFrame * 1.4) })),
  zoomOut: () => set((s) => ({ pxPerFrame: Math.max(MIN_ZOOM, s.pxPerFrame / 1.4) })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  play: () => set({ isPlaying: true, lastTickAt: performance.now() }),
  pause: () => set({ isPlaying: false, lastTickAt: null }),
  togglePlay: () =>
    set((s) => (s.isPlaying ? { isPlaying: false, lastTickAt: null } : { isPlaying: true, lastTickAt: performance.now() })),
  setTick: (lastTickAt) => set({ lastTickAt }),

  pushToast: (kind, message) =>
    set((s) => ({
      toasts: [...s.toasts, { id: Math.random().toString(36).slice(2), kind, message }].slice(-4),
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setCommandPalette: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));

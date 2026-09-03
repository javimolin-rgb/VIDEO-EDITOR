/**
 * GitHub project sync state. Manual push/pull, plus optional auto-sync that
 * debounces a push after autosave settles.
 */

import { create } from 'zustand';
import { createLogger } from '@/lib/logger';
import {
  DEFAULT_GH,
  listRemoteProjects,
  loadGitHubConfig,
  pullProject,
  pushProject,
  saveGitHubConfig,
  testConnection,
  type GitHubConfig,
  type RemoteProject,
} from '@/cloud/github';
import { useProjectStore } from './projectStore';

const log = createLogger('storage');

export type SyncStatus = 'idle' | 'testing' | 'pushing' | 'pulling' | 'ok' | 'error';

interface SyncState {
  config: GitHubConfig;
  status: SyncStatus;
  message: string;
  lastSyncedAt: number | null;
  lastSyncedProjectId: string | null;
  remote: RemoteProject[];

  setConfig: (patch: Partial<GitHubConfig>) => void;
  test: () => Promise<void>;
  pushNow: () => Promise<void>;
  pull: (projectId: string) => Promise<void>;
  refreshRemote: () => Promise<void>;
}

let debounce: ReturnType<typeof setTimeout> | null = null;
let lastAutoPushKey = '';

export const useSyncStore = create<SyncState>((set, get) => ({
  config: loadGitHubConfig(),
  status: 'idle',
  message: '',
  lastSyncedAt: null,
  lastSyncedProjectId: null,
  remote: [],

  setConfig: (patch) => {
    const config = { ...get().config, ...patch };
    saveGitHubConfig(config);
    set({ config });
  },

  async test() {
    set({ status: 'testing', message: 'Checking…' });
    const r = await testConnection(get().config);
    set({ status: r.ok ? 'ok' : 'error', message: r.detail });
  },

  async pushNow() {
    const project = useProjectStore.getState().project;
    const { config } = get();
    if (!project || !config.enabled) return;
    set({ status: 'pushing', message: 'Pushing to GitHub…' });
    try {
      const { bytes } = await pushProject(config, project.meta.id);
      set({
        status: 'ok',
        message: `Pushed ${(bytes / 1024 / 1024).toFixed(1)} MB`,
        lastSyncedAt: Date.now(),
        lastSyncedProjectId: project.meta.id,
      });
      void get().refreshRemote();
    } catch (e) {
      set({ status: 'error', message: String((e as Error).message ?? e) });
    }
  },

  async pull(projectId) {
    const { config } = get();
    set({ status: 'pulling', message: 'Pulling from GitHub…' });
    try {
      const id = await pullProject(config, projectId);
      await useProjectStore.getState().openProject(id);
      set({ status: 'ok', message: 'Pulled and opened.', lastSyncedAt: Date.now(), lastSyncedProjectId: id });
    } catch (e) {
      set({ status: 'error', message: String((e as Error).message ?? e) });
    }
  },

  async refreshRemote() {
    const { config } = get();
    if (!config.repo || !config.token) return;
    try {
      set({ remote: await listRemoteProjects(config) });
    } catch (e) {
      log.warn('list remote failed', e);
    }
  },
}));

// ─── auto-sync: debounce a push after autosave settles ─────────────────────

useProjectStore.subscribe((state, prev) => {
  const { config } = useSyncStore.getState();
  if (!config.enabled || !config.autoSync) return;
  if (!state.project) return;
  // Fire when a save just completed (lastSavedAt advanced) and not mid-edit.
  if (state.lastSavedAt === prev.lastSavedAt || state.dirty) return;

  const key = `${state.project.meta.id}:${state.lastSavedAt}`;
  if (key === lastAutoPushKey) return;
  lastAutoPushKey = key;

  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    void useSyncStore.getState().pushNow();
  }, 15_000);
});

export function reloadSyncConfig(): void {
  useSyncStore.setState({ config: loadGitHubConfig() });
}
export { DEFAULT_GH };

/**
 * Diagnostic snapshot (spec §246). A single JSON the user can download and
 * attach to a bug report. Contains no media and no personal data beyond
 * project names.
 */

import { dumpLogs } from './logger';
import { getFps } from './fps';
import { detectHardware } from '@/ai/hardware';
import { listModels } from '@/ai/registry';
import { localRuntime } from '@/ai/local/runtime';
import { generationQueue } from '@/ai/gen/queue';
import { storageBreakdown } from '@/storage/repository';
import { useProjectStore } from '@/state/projectStore';
import { useSettingsStore } from '@/state/settingsStore';

export interface Diagnostics {
  generatedAt: string;
  app: { version: string; userAgent: string };
  settings: ReturnType<typeof pickSettings>;
  hardware: Awaited<ReturnType<typeof detectHardware>>;
  models: Array<{ id: string; task: string; registryState: string; installed: boolean }>;
  queue: ReturnType<typeof generationQueue.snapshot>;
  storage: Awaited<ReturnType<typeof storageBreakdown>>;
  previewFps: number;
  project: { id: string; name: string; clips: number; assets: number } | null;
  logs: ReturnType<typeof dumpLogs>;
}

function pickSettings() {
  const s = useSettingsStore.getState();
  return { theme: s.theme, uiScale: s.uiScale, language: s.language, reducedMotion: s.reducedMotion };
}

export async function buildDiagnostics(): Promise<Diagnostics> {
  const [hardware, storage] = await Promise.all([detectHardware(), storageBreakdown()]);
  const installed = new Set(localRuntime.installedIds());
  const project = useProjectStore.getState().project;

  return {
    generatedAt: new Date().toISOString(),
    app: { version: __APP_VERSION__, userAgent: navigator.userAgent },
    settings: pickSettings(),
    hardware,
    models: listModels().map((m) => ({
      id: m.descriptor.id,
      task: m.descriptor.task,
      registryState: m.state,
      installed: installed.has(m.descriptor.id),
    })),
    queue: generationQueue.snapshot().map((j) => ({ ...j, result: null })),
    storage,
    previewFps: getFps(),
    project: project
      ? {
          id: project.meta.id,
          name: project.meta.name,
          clips: project.timeline.clips.length,
          assets: project.assetIds.length,
        }
      : null,
    logs: dumpLogs(),
  };
}

export async function downloadDiagnostics(): Promise<void> {
  const data = await buildDiagnostics();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-video-editor-diagnostics-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

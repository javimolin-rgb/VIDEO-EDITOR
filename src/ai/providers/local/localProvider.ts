/**
 * Local provider adapter. It is the *default and fallback* provider
 * (spec §289). Until a local inference service (Phase 3 / §149–§151) is
 * connected and a model is installed, its capabilities are all false and the
 * UI must present honest "not available on this hardware / model not
 * installed" states (spec §159, §160, §283) — never a fake result.
 */

import { anyVideoModelInstalled } from '@/ai/registry';
import {
  NO_CAPABILITIES,
  type JobStatus,
  type ProviderCapabilities,
  type VideoGenerationProvider,
} from '@/ai/provider';

const LOCAL_SERVICE_URL = 'http://127.0.0.1:8787';

export class LocalProvider implements VideoGenerationProvider {
  readonly id = 'local';
  readonly name = 'Local (this device)';

  get capabilities(): ProviderCapabilities {
    // Capabilities are unlocked only when the local service reports a runnable
    // model. For now the registry has none installed.
    if (!anyVideoModelInstalled()) return NO_CAPABILITIES;
    return {
      ...NO_CAPABILITIES,
      textToVideo: true,
      imageToVideo: true,
      maxDurationSec: 5,
      supportedAspectRatios: ['16:9', '9:16', '1:1'],
    };
  }

  async health(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(`${LOCAL_SERVICE_URL}/health`, { signal: AbortSignal.timeout(600) });
      if (!res.ok) return { ok: false, detail: `local service HTTP ${res.status}` };
      return { ok: true, detail: 'local service reachable' };
    } catch {
      return {
        ok: false,
        detail:
          'Local AI service is not running. Editing works fully offline; ' +
          'generative features unlock once the service and a model are installed.',
      };
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return {
      jobId,
      phase: 'failed',
      progress: null,
      message: 'No local model installed',
      etaSeconds: null,
      error: {
        code: 'ai/no-local-model',
        message: 'No local generative model is installed yet.',
        fix: 'Open AI Setup and install a video model to enable generation.',
      },
    };
  }

  async cancelJob(): Promise<void> {
    // Nothing running.
  }
}

export const localProvider = new LocalProvider();

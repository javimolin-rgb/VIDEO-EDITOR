/**
 * User-facing error catalogue (spec §119). Every entry answers: what happened,
 * why, and how to fix it — never a raw stack or CUDA code.
 */

import { t } from '@/i18n';
import type { AppError } from './result';

export type ErrorCode =
  | 'import/unsupported'
  | 'export/failed'
  | 'ai/model-not-installed'
  | 'hardware/insufficient';

export function makeError(code: ErrorCode, technical?: string): AppError {
  switch (code) {
    case 'import/unsupported':
      return {
        code,
        message: t('error.import.unsupported.message'),
        cause: t('error.import.unsupported.cause') + (technical ? ` (${technical})` : ''),
        fix: t('error.import.unsupported.fix'),
      };
    case 'export/failed':
      return {
        code,
        message: t('error.export.failed.message'),
        cause: technical,
        fix: t('error.export.failed.fix'),
      };
    case 'ai/model-not-installed':
      return {
        code,
        message: t('error.model.notInstalled.message'),
        cause: t('error.model.notInstalled.cause'),
        fix: t('error.model.notInstalled.fix'),
      };
    case 'hardware/insufficient':
      return {
        code,
        message: t('error.hardware.insufficient.message'),
        cause: technical,
        fix: t('error.hardware.insufficient.fix'),
      };
    default:
      return { code: 'unknown', message: technical ?? 'Unexpected error.' };
  }
}

export function isAppError(v: unknown): v is AppError {
  return !!v && typeof v === 'object' && 'code' in v && 'message' in v;
}

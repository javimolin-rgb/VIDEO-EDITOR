/**
 * Lightweight typed result. Domain operations that can fail for
 * *expected* reasons return `Result` instead of throwing, so the UI can
 * present actionable errors (spec §119).
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export interface AppError {
  /** Stable machine code, e.g. `import/unsupported-codec`. */
  code: string;
  /** What happened, in plain language. */
  message: string;
  /** Why it happened / context. */
  cause?: string;
  /** Concrete next step for the user. */
  fix?: string;
}

export function appError(code: string, message: string, extra?: Omit<AppError, 'code' | 'message'>): AppError {
  return { code, message, ...extra };
}

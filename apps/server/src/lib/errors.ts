/**
 * Typed application errors. Route handlers throw AppError; the
 * error-handler middleware maps code → HTTP status + JSON body.
 * Unknown errors collapse to 500 internal + "Internal error" message
 * so raw stack traces or driver-specific messages never leak.
 */

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'upstream'
  | 'internal';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, opts?: { cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = opts?.cause;
  }
}

export function httpStatusFor(code: ErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'validation':
      return 400;
    case 'conflict':
      return 409;
    case 'upstream':
      return 502;
    case 'internal':
      return 500;
    default:
      return 500;
  }
}

export function toErrorBody(err: unknown): { error: ErrorCode; message: string } {
  if (err instanceof AppError) {
    return { error: err.code, message: err.message };
  }
  return { error: 'internal', message: 'Internal error' };
}

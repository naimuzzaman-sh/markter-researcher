/**
 * Minimal logger contract so shared services don't depend on a framework.
 * - `apps/api` passes a NestJS `Logger`.
 * - `apps/mcp` passes a stderr-only logger (stdout is reserved for MCP protocol frames).
 * - Tests pass a no-op.
 */
export interface SharedLogger {
  warn(message: string): void;
  error(message: string, stack?: string): void;
}

/** Default logger used when callers don't inject one. */
export const defaultLogger: SharedLogger = {
  warn: (m) => console.warn(m),
  error: (m, s) => console.error(m, s ?? ''),
};

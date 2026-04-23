/**
 * Tiny structured JSON logger. Writes one JSON line per event to stderr
 * so stdout stays clean for future MCP stdio transports or pipe usage.
 * No deps — pino-style interface without the runtime cost.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type Logger = {
  debug(msg: string, extra?: Record<string, unknown>): void;
  info(msg: string, extra?: Record<string, unknown>): void;
  warn(msg: string, extra?: Record<string, unknown>): void;
  error(msg: string, extra?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
};

function serializeValue(v: unknown): unknown {
  if (v instanceof Error) {
    return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  }
  return v;
}

function emit(
  level: LogLevel,
  msg: string,
  context: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  const record: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...context,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      record[k] = serializeValue(v);
    }
  }
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

function makeLogger(context: Record<string, unknown>): Logger {
  return {
    debug: (msg, extra) => emit('debug', msg, context, extra),
    info: (msg, extra) => emit('info', msg, context, extra),
    warn: (msg, extra) => emit('warn', msg, context, extra),
    error: (msg, extra) => emit('error', msg, context, extra),
    child: (bindings) => makeLogger({ ...context, ...bindings }),
  };
}

export function createLogger(context: Record<string, unknown> = {}): Logger {
  return makeLogger(context);
}

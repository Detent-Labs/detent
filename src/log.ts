/**
 * Structured logging: one JSON line per call, `{ts, level, msg, ...context}`.
 * `error` writes via `console.error` (stderr); `info`/`warn` via
 * `console.log` (stdout). A container log collector captures both streams
 * regardless — the split serves local terminal legibility, not correctness.
 *
 * `LOG_LEVEL` is read once at module load, gating emission by threshold
 * (`debug` < `info` < `warn` < `error`, default `info`).
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveThreshold(raw: string | undefined): Level {
  if (raw && raw in LEVEL_ORDER) return raw as Level;
  return "info";
}

const threshold = resolveThreshold(process.env.LOG_LEVEL);

function emit(level: Level, msg: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[threshold]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...context });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, context?: Record<string, unknown>) => emit("debug", msg, context),
  info: (msg: string, context?: Record<string, unknown>) => emit("info", msg, context),
  warn: (msg: string, context?: Record<string, unknown>) => emit("warn", msg, context),
  error: (msg: string, context?: Record<string, unknown>) => emit("error", msg, context),
};

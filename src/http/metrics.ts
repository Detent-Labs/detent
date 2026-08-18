/**
 * `GET /metrics`: Prometheus text-exposition format, computed fresh from the
 * database on every scrape (no in-process aggregation — see design.md,
 * "in-process counters ... reset on process restart and lie"). Framework-
 * agnostic like `health.ts`'s handlers, but returns `HttpBinaryResult`, not
 * `HttpResult`: `server.ts`'s `toResponse` always `JSON.stringify`s an
 * `HttpResult` body, which would corrupt exposition text. `HttpBinaryResult`
 * is the same type attachment download already uses for a non-JSON success
 * response (`errors.ts`'s `HttpBinaryResult` doc comment).
 */
import type { SQL } from "bun";
import { countOutboxByStatus, getTimerLagStats, countInstancesByStatus } from "../engine/admin-queries.js";
import type { HttpBinaryResult } from "./errors.js";

const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export async function handleMetrics(db: SQL): Promise<HttpBinaryResult> {
  let outboxByStatus: Record<string, number>;
  let timerLag: Awaited<ReturnType<typeof getTimerLagStats>>;
  let instancesByStatus: Record<string, number>;
  try {
    [outboxByStatus, timerLag, instancesByStatus] = await Promise.all([
      countOutboxByStatus(db),
      getTimerLagStats(db),
      countInstancesByStatus(db),
    ]);
  } catch {
    // A scrape failure reports 503, the same signal /readyz gives a failed
    // DB ping, so a scraper's own down-detection sees it rather than a
    // silently-zeroed gauge that would read as "healthy, nothing overdue".
    return { status: 503, contentType: CONTENT_TYPE, data: new TextEncoder().encode("") };
  }

  const lines: string[] = [];
  for (const [status, n] of Object.entries(outboxByStatus)) {
    lines.push(`workflow_outbox_backlog{status="${status}"} ${n}`);
  }
  lines.push(`workflow_timer_overdue_count ${timerLag.overdueCount}`);
  lines.push(`workflow_timer_lag_seconds ${timerLag.maxLagSeconds}`);
  lines.push(`workflow_instances_faulted ${instancesByStatus.faulted ?? 0}`);

  return { status: 200, contentType: CONTENT_TYPE, data: new TextEncoder().encode(lines.join("\n") + "\n") };
}

/**
 * Operator-facing reads and repairs that have no existing API: outbox rows by
 * status, per-status counts, pending timers, and the two dead-letter repairs
 * (requeue, discard). Three call sites, three statements — no generic query
 * builder or filter DSL. Neither repair touches `instances`, `history_entries`
 * or `instance_events`, so neither can interact with the `transitionSeq` OCC
 * invariants.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { instance as instanceSchema, type Instance, type InstanceId, type ProcessId, type StepId } from "../schema/definition.js";
import { encodeCursor, decodeCursor } from "../pagination.js";

export type Page<T> = { items: T[]; cursor?: string };

/** A projection, never `SELECT *`: the action's `type` only, never its `config`, which may hold credentials. */
export type OutboxRow = {
  idempotencyKey: string;
  instanceId: InstanceId;
  transitionSeq: number;
  actionId: string;
  type: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
  claimedAt: string | null;
  lastError: string | null;
};

export type OutboxListFilter = { status?: string[]; instanceId?: string };

export type PendingTimer = {
  instanceId: InstanceId;
  processId: ProcessId;
  version: number;
  currentStepId: StepId;
  nextTimerAt: string;
};

const DEFAULT_LIST_LIMIT = 50;
/**
 * Exported so `http/admin-routes.ts` clamps to the same bound at the boundary.
 * Separate from `runtime/api.ts`'s constant of the same name: the outbox and
 * timer lists this module serves are not the instance lists that one bounds.
 */
export const MAX_LIST_LIMIT = 200;

function toOutboxRow(r: {
  idempotency_key: string;
  instance_id: string;
  transition_seq: number;
  action_id: string;
  action_type: string;
  status: string;
  attempts: number;
  next_attempt_at: string | Date;
  created_at: string | Date;
  claimed_at: string | Date | null;
  last_error: string | null;
}): OutboxRow {
  return {
    idempotencyKey: r.idempotency_key,
    instanceId: r.instance_id as InstanceId,
    transitionSeq: r.transition_seq,
    actionId: r.action_id,
    type: r.action_type,
    status: r.status,
    attempts: r.attempts,
    nextAttemptAt: new Date(r.next_attempt_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    claimedAt: r.claimed_at ? new Date(r.claimed_at).toISOString() : null,
    lastError: r.last_error,
  };
}

/**
 * Outbox rows filtered by `status[]`/`instanceId`, newest-first, keyset-paged
 * on `(created_at, idempotency_key)` — the same opaque cursor encoding
 * `listInstances` uses. Absent filters mean "unfiltered".
 */
export async function listOutbox(
  filter: OutboxListFilter = {},
  page: { limit?: number; cursor?: string } = {},
  db: SQL = sql,
): Promise<Page<OutboxRow>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorCreatedAt, cursorKey] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;

  // created_at::text (created_at_cursor) carries Postgres's full microsecond
  // precision, unlike the driver's own Date conversion of the plain
  // created_at column, which is only millisecond-precise. See
  // fix-instance-list-cursor-precision's design.md — the same fix
  // listInstances and listComments already apply.
  const rows = (await db`
    SELECT idempotency_key, instance_id, transition_seq, action_id, action->>'type' AS action_type,
           status, attempts, next_attempt_at, created_at, claimed_at, last_error,
           created_at::text AS created_at_cursor
    FROM outbox
    WHERE (${statusArr}::text[] IS NULL OR status = ANY(${statusArr}))
      AND (${filter.instanceId ?? null}::text IS NULL OR instance_id = ${filter.instanceId ?? null})
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, idempotency_key) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorKey ?? null})
      )
    ORDER BY created_at DESC, idempotency_key DESC
    LIMIT ${limit + 1}
  ` as unknown) as (Parameters<typeof toOutboxRow>[0] & { created_at_cursor: string })[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items = pageRows.map(toOutboxRow);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.created_at_cursor, last.idempotency_key]) : undefined;
  return { items, cursor };
}

/** One count per distinct `status` value present. A status with no rows is simply absent. */
export async function countOutboxByStatus(db: SQL = sql): Promise<Record<string, number>> {
  const rows = (await db`SELECT status, count(*)::int AS n FROM outbox GROUP BY status`) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export type TimerLagStats = { overdueCount: number; maxLagSeconds: number };

/**
 * Overdue-timer count and the lag (in seconds) of the most-overdue one, among
 * `running` instances with `next_timer_at` set. Mirrors `listPendingTimers`'s
 * `(body->>'status') = 'running' AND next_timer_at IS NOT NULL` filter so this
 * stays backed by `instances_timer_idx` instead of a full table scan.
 * `COALESCE(..., 0)` covers the case where nothing is overdue: an empty
 * `FILTER` aggregates to SQL `NULL`, not `0`.
 */
export async function getTimerLagStats(db: SQL = sql): Promise<TimerLagStats> {
  const [row] = (await db`
    SELECT
      count(*) FILTER (WHERE next_timer_at < now())::int AS overdue_count,
      COALESCE(EXTRACT(EPOCH FROM (now() - min(next_timer_at) FILTER (WHERE next_timer_at < now()))), 0)::float8 AS max_lag_seconds
    FROM instances
    WHERE (body->>'status') = 'running' AND next_timer_at IS NOT NULL
  `) as { overdue_count: number; max_lag_seconds: number }[];
  return { overdueCount: row!.overdue_count, maxLagSeconds: row!.max_lag_seconds };
}

/**
 * One count per distinct `body->>'status'` value present across `instances`.
 * A general shape, not a single-purpose faulted-only query, mirroring
 * `countOutboxByStatus`. Unlike that query, this one has no matching
 * functional index (`instances_selection_idx` is a composite on
 * `(processId, version, status)`, not usable by a bare `GROUP BY status`), so
 * it scans the whole table — acceptable at today's scale; see design.md's
 * Risks section if scrape load ever makes this measurable.
 */
export async function countInstancesByStatus(db: SQL = sql): Promise<Record<string, number>> {
  const rows = (await db`SELECT body->>'status' AS status, count(*)::int AS n FROM instances GROUP BY body->>'status'`) as {
    status: string;
    n: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/**
 * Running instances whose `next_timer_at` is set, ordered ascending so the
 * most overdue comes first, keyset-paged on `(next_timer_at, instance_id)`.
 */
export async function listPendingTimers(page: { limit?: number; cursor?: string } = {}, db: SQL = sql): Promise<Page<PendingTimer>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorTime, cursorId] = page.cursor ? decodeCursor(page.cursor, 2) : [undefined, undefined];

  // next_timer_at::text (next_timer_at_cursor) carries Postgres's full
  // microsecond precision, unlike the driver's own Date conversion of the
  // plain next_timer_at column, which is only millisecond-precise. See
  // fix-instance-list-cursor-precision's design.md — the same fix
  // listInstances and listComments already apply.
  const rows = (await db`
    SELECT instance_id, body, next_timer_at, next_timer_at::text AS next_timer_at_cursor FROM instances
    WHERE (body->>'status') = 'running' AND next_timer_at IS NOT NULL
      AND (
        ${cursorTime ?? null}::timestamptz IS NULL
        OR (next_timer_at, instance_id) > (${cursorTime ?? null}::timestamptz, ${cursorId ?? null})
      )
    ORDER BY next_timer_at ASC, instance_id ASC
    LIMIT ${limit + 1}
  ` as unknown) as { instance_id: string; body: unknown; next_timer_at: string | Date; next_timer_at_cursor: string }[];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items = pageRows.map((r) => {
    const inst = instanceSchema.parse(typeof r.body === "string" ? JSON.parse(r.body) : r.body) as Instance;
    return {
      instanceId: inst.instanceId,
      processId: inst.processId,
      version: inst.version,
      currentStepId: inst.currentStepId,
      nextTimerAt: new Date(r.next_timer_at).toISOString(),
    };
  });
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([last.next_timer_at_cursor, last.instance_id]) : undefined;
  return { items, cursor };
}

/** The current row for `idempotencyKey`, any status, or `null` if it does not exist. Lets a caller distinguish "no such row" (404) from "wrong status" (409) after a repair reports no rows affected. */
export async function getOutboxRow(idempotencyKey: string, db: SQL = sql): Promise<OutboxRow | null> {
  const rows = (await db`
    SELECT idempotency_key, instance_id, transition_seq, action_id, action->>'type' AS action_type,
           status, attempts, next_attempt_at, created_at, claimed_at, last_error
    FROM outbox WHERE idempotency_key = ${idempotencyKey}
  ` as unknown) as Parameters<typeof toOutboxRow>[0][];
  return rows[0] ? toOutboxRow(rows[0]) : null;
}

/**
 * Requeue a dead letter: `status` back to `pending`, `attempts` reset to 0 (it
 * dead-lettered because it exhausted its retry budget — without the reset it
 * would dead-letter again on the next drain), `next_attempt_at` to now,
 * `claimed_at` cleared. Guarded by `WHERE status = 'dead-letter'`; returns the
 * updated row, or `null` if no row matched (missing, or not a dead letter).
 */
export async function requeueOutboxRow(idempotencyKey: string, db: SQL = sql): Promise<OutboxRow | null> {
  const rows = (await db`
    UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), claimed_at = NULL
    WHERE idempotency_key = ${idempotencyKey} AND status = 'dead-letter'
    RETURNING idempotency_key, instance_id, transition_seq, action_id, action->>'type' AS action_type,
              status, attempts, next_attempt_at, created_at, claimed_at, last_error
  ` as unknown) as Parameters<typeof toOutboxRow>[0][];
  return rows[0] ? toOutboxRow(rows[0]) : null;
}

/**
 * Discard a dead letter: `status` to `discarded`, guarded by
 * `WHERE status = 'dead-letter'`. Never `DELETE`s the row — `idempotency_key`
 * is the primary key and the deduplication anchor, so removing it would let a
 * replayed transition re-enqueue the same action. `discarded` is inert:
 * `drainOutbox` claims only a due `pending` row or a lease-expired `claimed`
 * row, and `migrateInstances` remaps it in `field_version` lock-step with the
 * rest of an instance's rows, since only a *live-claimed* row blocks migration.
 */
export async function discardOutboxRow(idempotencyKey: string, db: SQL = sql): Promise<OutboxRow | null> {
  const rows = (await db`
    UPDATE outbox SET status = 'discarded'
    WHERE idempotency_key = ${idempotencyKey} AND status = 'dead-letter'
    RETURNING idempotency_key, instance_id, transition_seq, action_id, action->>'type' AS action_type,
              status, attempts, next_attempt_at, created_at, claimed_at, last_error
  ` as unknown) as Parameters<typeof toOutboxRow>[0][];
  return rows[0] ? toOutboxRow(rows[0]) : null;
}

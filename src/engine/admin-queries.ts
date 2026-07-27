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
const MAX_LIST_LIMIT = 200;

function encodeCursor(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}
function decodeCursor(cursor: string): string[] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as string[];
}

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
  const [cursorCreatedAt, cursorKey] = page.cursor ? decodeCursor(page.cursor) : [undefined, undefined];
  const statusArr = filter.status && filter.status.length > 0 ? db.array(filter.status, "TEXT") : null;

  const rows = (await db`
    SELECT idempotency_key, instance_id, transition_seq, action_id, action->>'type' AS action_type,
           status, attempts, next_attempt_at, created_at, claimed_at, last_error
    FROM outbox
    WHERE (${statusArr}::text[] IS NULL OR status = ANY(${statusArr}))
      AND (${filter.instanceId ?? null}::text IS NULL OR instance_id = ${filter.instanceId ?? null})
      AND (
        ${cursorCreatedAt ?? null}::timestamptz IS NULL
        OR (created_at, idempotency_key) < (${cursorCreatedAt ?? null}::timestamptz, ${cursorKey ?? null})
      )
    ORDER BY created_at DESC, idempotency_key DESC
    LIMIT ${limit + 1}
  ` as unknown) as Parameters<typeof toOutboxRow>[0][];

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const items = pageRows.map(toOutboxRow);
  const last = pageRows[pageRows.length - 1];
  const cursor = hasMore && last ? encodeCursor([new Date(last.created_at).toISOString(), last.idempotency_key]) : undefined;
  return { items, cursor };
}

/** One count per distinct `status` value present. A status with no rows is simply absent. */
export async function countOutboxByStatus(db: SQL = sql): Promise<Record<string, number>> {
  const rows = (await db`SELECT status, count(*)::int AS n FROM outbox GROUP BY status`) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/**
 * Running instances whose `next_timer_at` is set, ordered ascending so the
 * most overdue comes first, keyset-paged on `(next_timer_at, instance_id)`.
 */
export async function listPendingTimers(page: { limit?: number; cursor?: string } = {}, db: SQL = sql): Promise<Page<PendingTimer>> {
  const limit = Math.min(page.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
  const [cursorTime, cursorId] = page.cursor ? decodeCursor(page.cursor) : [undefined, undefined];

  const rows = (await db`
    SELECT instance_id, body, next_timer_at FROM instances
    WHERE (body->>'status') = 'running' AND next_timer_at IS NOT NULL
      AND (
        ${cursorTime ?? null}::timestamptz IS NULL
        OR (next_timer_at, instance_id) > (${cursorTime ?? null}::timestamptz, ${cursorId ?? null})
      )
    ORDER BY next_timer_at ASC, instance_id ASC
    LIMIT ${limit + 1}
  ` as unknown) as { instance_id: string; body: unknown; next_timer_at: string | Date }[];

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
  const cursor = hasMore && last ? encodeCursor([new Date(last.next_timer_at).toISOString(), last.instance_id]) : undefined;
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

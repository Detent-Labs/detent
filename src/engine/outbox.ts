/**
 * Outbox delivery worker. Trigger actions are enqueued into `outbox` atomically
 * with their transition's commit (see transition.ts); this worker delivers the
 * pending rows post-commit, at-least-once, to a handler seam, with exponential
 * backoff and a dead-letter terminus for permanently-failing rows.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import type { Action } from "../schema/definition.js";

export const MAX_ATTEMPTS = 5;
// ponytail: fixed exponential backoff (1s, 2s, 4s, …); make per-action configurable
// only if delivery SLAs ever diverge.
const BACKOFF_BASE_MS = 1000;

export type OutboxRow = { idempotency_key: string; action: Action; attempts: number };

/**
 * Handler seam. The handler-registry change replaces this body with real
 * `{ type, config }` resolution + `Action.output` writeback. At-least-once
 * delivery can invoke it twice (crash after deliver, before mark), so it MUST
 * stay idempotent — trivially so while it is a no-op.
 */
export async function deliver(_row: OutboxRow): Promise<void> {}

/**
 * Claim due pending rows (`FOR UPDATE SKIP LOCKED`, so a second worker never
 * grabs the same row), deliver each, and mark it. A failure increments the
 * attempt count with backoff; at `MAX_ATTEMPTS` the row dead-letters. Returns the
 * count delivered this pass.
 *
 * ponytail: delivery runs inside the claim transaction, so the row lock is held
 * across `deliverFn`. Fine for the in-process no-op seam; when the handler does
 * real I/O, split claim/deliver/mark so a slow handler does not pin a DB tx.
 */
export async function drainOutbox(
  db: SQL = sql,
  deliverFn: (row: OutboxRow) => Promise<void> = deliver,
): Promise<number> {
  let delivered = 0;
  await db.begin(async (tx) => {
    const rows = (await tx`SELECT idempotency_key, action, attempts FROM outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 100`) as OutboxRow[];

    for (const row of rows) {
      const action = (typeof row.action === "string" ? JSON.parse(row.action as unknown as string) : row.action) as Action;
      try {
        await deliverFn({ ...row, action });
        await tx`UPDATE outbox SET status = 'delivered', delivered_at = now()
          WHERE idempotency_key = ${row.idempotency_key}`;
        delivered++;
      } catch {
        const attempts = row.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await tx`UPDATE outbox SET status = 'dead-letter', attempts = ${attempts}
            WHERE idempotency_key = ${row.idempotency_key}`;
        } else {
          const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
          await tx`UPDATE outbox SET attempts = ${attempts},
            next_attempt_at = now() + (${backoffMs} * interval '1 millisecond')
            WHERE idempotency_key = ${row.idempotency_key}`;
        }
      }
    }
  });
  return delivered;
}

/** Poll `drainOutbox` on an interval. Returns a stop handle. */
export function startOutboxWorker(db: SQL = sql, intervalMs = 500): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async (): Promise<void> => {
    try {
      await drainOutbox(db);
    } catch {
      // transient (e.g. DB blip); the next tick retries.
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

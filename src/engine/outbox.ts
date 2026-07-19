/**
 * Outbox delivery worker. Trigger actions are enqueued into `outbox` atomically
 * with their transition's commit (see transition.ts); this worker delivers the
 * pending rows post-commit, at-least-once.
 *
 * Delivery is a claim / deliver / mark split: (tx1) claim a due row with a lease
 * and commit, releasing the row lock; run the handler OUTSIDE any transaction
 * (it does real I/O); (tx2) a CAS on the `claimed` state applies the writeback,
 * appends the ActionOutcome, and marks the row delivered in one commit. The lease
 * bounds duplicate handler runs; the CAS gives exactly-once data + audit;
 * handler idempotency on the UUIDv5 key is the real once-guarantee for external
 * effects.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { resolve, type Registry } from "./registry.js";
import { evalOutput } from "../cel/eval.js";
import type { Action, ActionOutcome } from "../schema/definition.js";

export const MAX_ATTEMPTS = 5;
// ponytail: fixed exponential backoff (1s, 2s, 4s, …); make per-action configurable
// only if delivery SLAs ever diverge.
const BACKOFF_BASE_MS = 1000;
// A claimed row whose lease has elapsed is treated as abandoned (crashed worker)
// and reclaimed by a later drain. ponytail: 30s covers ordinary handler I/O;
// raise only if a real handler legitimately runs longer.
export const CLAIM_LEASE_MS = 30_000;

/** A row a delivery worker has claimed: the frozen action plus its coordinates. */
export type ClaimedRow = {
  idempotency_key: string;
  instance_id: string;
  transition_seq: number;
  action: Action;
  attempts: number;
};

/** A permanent (non-retryable) delivery failure — dead-letters without consuming retries. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentError";
  }
}

/**
 * Resolve the handler by `action.type`, invoke it with `action.config`, and
 * evaluate `Action.output` over the returned `result` into a fieldId->value
 * patch. An unregistered type is a PermanentError (dead-letter, no retry). Runs
 * outside any DB transaction; MUST stay idempotent on the idempotency key.
 */
export type DeliverFn = (row: ClaimedRow, registry: Registry) => Promise<Record<string, unknown>>;

export const deliver: DeliverFn = async (row, registry) => {
  const def = resolve(registry, row.action.type);
  if (!def) throw new PermanentError(`no handler registered for type: ${row.action.type}`);
  const result = await def.handler({
    action: row.action,
    config: row.action.config,
    idempotencyKey: row.idempotency_key,
    instanceId: row.instance_id,
  });
  return evalOutput(row.action.output, result);
};

const parseAction = (a: unknown): Action => (typeof a === "string" ? JSON.parse(a) : a) as Action;

/** Append one ActionOutcome to the originating transition's HistoryEntry (located by instance + seq). */
async function appendOutcome(
  tx: SQL,
  row: ClaimedRow,
  o: { status: ActionOutcome["status"]; attempts: number; suppressed?: boolean },
): Promise<void> {
  const outcome: ActionOutcome = {
    actionId: row.action.id,
    resolvedHandler: row.action.type,
    idempotencyKey: row.idempotency_key,
    status: o.status,
    attempts: o.attempts,
    at: new Date().toISOString(),
    ...(o.suppressed ? { suppressed: true } : {}),
  };
  await tx`UPDATE history_entries
    SET entry = jsonb_set(entry, '{actions}', coalesce(entry->'actions', '[]'::jsonb) || ${[outcome]}::jsonb)
    WHERE instance_id = ${row.instance_id} AND transition_seq = ${row.transition_seq}`;
}

/**
 * One drain pass. Claim due rows (fresh `pending` plus `claimed` rows past their
 * lease) `FOR UPDATE SKIP LOCKED`, commit the claim, then for each: run the
 * handler off the lock, and in a CAS-gated second transaction apply the writeback
 * + outcome + delivered mark. Returns the count delivered this pass.
 */
export async function drainOutbox(
  db: SQL = sql,
  registry: Registry = new Map(),
  deliverFn: DeliverFn = deliver,
  leaseMs: number = CLAIM_LEASE_MS,
): Promise<number> {
  // tx1: atomically claim due rows (and re-lease stale claims). The single UPDATE
  // is its own transaction, so the lock is released as soon as it returns.
  const claimed = (await db`UPDATE outbox SET status = 'claimed', claimed_at = now()
    WHERE idempotency_key IN (
      SELECT idempotency_key FROM outbox
      WHERE (status = 'pending' AND next_attempt_at <= now())
         OR (status = 'claimed' AND claimed_at < now() - (${leaseMs} * interval '1 millisecond'))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    )
    RETURNING idempotency_key, instance_id, transition_seq, action, attempts`) as ClaimedRow[];

  let delivered = 0;
  for (const raw of claimed) {
    const row: ClaimedRow = { ...raw, action: parseAction(raw.action) };
    const attempts = row.attempts + 1;

    // Run the handler off the lock. patch === undefined marks a failure;
    // permanent distinguishes a dead-letter from a transient retry.
    let patch: Record<string, unknown> | undefined;
    let permanent = false;
    try {
      patch = await deliverFn(row, registry);
    } catch (e) {
      permanent = e instanceof PermanentError;
    }

    // tx2: CAS on the claimed state. A reclaimed-then-late peer whose row is
    // already 'delivered' finds zero rows and applies nothing.
    await db.begin(async (tx) => {
      if (patch !== undefined) {
        const cas = (await tx`UPDATE outbox SET status = 'delivered', delivered_at = now(), attempts = ${attempts}
          WHERE idempotency_key = ${row.idempotency_key} AND status = 'claimed'
          RETURNING idempotency_key`) as unknown[];
        if (cas.length === 0) return; // already delivered by a peer

        // Writeback, gated on running in the same UPDATE (no TOCTOU). Only a
        // running instance accepts a write; completed/cancelled/faulted are
        // data-immutable and suppress. fieldId is a validated field_<uuid>, so the
        // path array literal is injection-safe.
        let affected = 0;
        for (const [fid, val] of Object.entries(patch)) {
          // [val]->0 wraps any JSON value as a proper jsonb value (a bare param
          // would land as a jsonb scalar string). fieldId is a validated
          // field_<uuid>, so the path array literal is injection-safe.
          // Also flag the instance for re-resolution: a changed `data` may now
          // satisfy an automatic path the instance is parked on. Set in the same
          // UPDATE so it is flagged iff a running row is affected — a suppressed
          // writeback (0 rows) flags nothing. 'pending' overwrites any in-flight
          // 'claimed', so a re-flag mid-pass is never lost.
          const r = (await tx`UPDATE instances
            SET body = jsonb_set(body, ${`{data,${fid}}`}::text[], (${[val]}::jsonb) -> 0, true),
                resolve_state = 'pending'
            WHERE instance_id = ${row.instance_id} AND (body->>'status') = 'running'
            RETURNING instance_id`) as unknown[];
          affected += r.length;
        }
        const suppressed = Object.keys(patch).length > 0 && affected === 0;
        await appendOutcome(tx, row, { status: "succeeded", attempts, suppressed });
        delivered++;
      } else if (permanent || attempts >= MAX_ATTEMPTS) {
        const cas = (await tx`UPDATE outbox SET status = 'dead-letter', attempts = ${attempts}
          WHERE idempotency_key = ${row.idempotency_key} AND status = 'claimed'
          RETURNING idempotency_key`) as unknown[];
        if (cas.length === 0) return;
        await appendOutcome(tx, row, { status: "dead-letter", attempts });
      } else {
        // Transient: back off and return to pending (drop the lease) for a later drain.
        const backoffMs = BACKOFF_BASE_MS * 2 ** (attempts - 1);
        await tx`UPDATE outbox SET status = 'pending', attempts = ${attempts}, claimed_at = NULL,
          next_attempt_at = now() + (${backoffMs} * interval '1 millisecond')
          WHERE idempotency_key = ${row.idempotency_key} AND status = 'claimed'`;
      }
    });
  }
  return delivered;
}

/** Poll `drainOutbox` on an interval. Returns a stop handle. */
export function startOutboxWorker(
  db: SQL = sql,
  registry: Registry = new Map(),
  intervalMs = 500,
): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async (): Promise<void> => {
    try {
      await drainOutbox(db, registry);
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

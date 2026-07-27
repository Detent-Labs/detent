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
import { pollForever } from "./poll.js";
import { durationMs } from "./duration.js";
import { evalOutput } from "../cel/eval.js";
import type { Action, ActionOutcome } from "../schema/definition.js";

export const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000;

/** An action's own `retry.maxAttempts`, or the engine default when it declares none. */
function maxAttemptsFor(action: Action): number {
  return action.retry?.maxAttempts ?? MAX_ATTEMPTS;
}

/** An action's own `retry.backoff`/`retry.baseDelay`-driven delay for this attempt, or the engine default schedule when it declares none. */
function backoffMsFor(action: Action, attempts: number): number {
  const policy = action.retry;
  const baseDelayMs = policy?.baseDelay !== undefined ? durationMs(policy.baseDelay) : BACKOFF_BASE_MS;
  switch (policy?.backoff ?? "exponential") {
    case "none":
      return 0;
    case "fixed":
      return baseDelayMs;
    case "exponential":
      return baseDelayMs * 2 ** (attempts - 1);
  }
}
// A claimed row whose lease has elapsed is treated as abandoned (crashed worker)
// and reclaimed by a later drain. ponytail: 30s covers ordinary handler I/O;
// raise only if a real handler legitimately runs longer.
export const CLAIM_LEASE_MS = 30_000;

/**
 * A row a delivery worker has claimed: the frozen action plus its coordinates.
 * `event_id` names the InstanceEvent that enqueued the action when one did (a
 * reminder fire); null when a transition did, whose record is found by
 * (instance_id, transition_seq).
 */
export type ClaimedRow = {
  idempotency_key: string;
  instance_id: string;
  transition_seq: number;
  action: Action;
  attempts: number;
  event_id: string | null;
  /**
   * The instance's version when this row was enqueued (see store.ts/transition.ts's
   * enqueue sites). Used only to fold the delivery-side version race: see the tx2
   * writeback predicate below.
   */
  field_version: number;
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

/**
 * Append one ActionOutcome to the runtime record that enqueued the action.
 *
 * The record is carried on the row, not derived. (instance_id, transition_seq)
 * identifies a transition exactly — the seq is the OCC token and advances once per
 * hop — but an event does not advance it, so deriving from the pair misfiles a
 * reminder's outcome onto whichever transition entered the step, and on a step an
 * instance was created on (seq 0, no HistoryEntry) matches no row at all and
 * discards the outcome silently. With `event_id` set the outcome goes to that
 * event; otherwise the transition path is unchanged.
 */
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
  if (row.event_id !== null && row.event_id !== undefined) {
    await tx`UPDATE instance_events
      SET event = jsonb_set(event, '{actions}', coalesce(event->'actions', '[]'::jsonb) || ${[outcome]}::jsonb)
      WHERE id = ${row.event_id}`;
    return;
  }
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
    RETURNING idempotency_key, instance_id, transition_seq, action, attempts, event_id, field_version`) as ClaimedRow[];

  let delivered = 0;
  for (const raw of claimed) {
   // Per-row error boundary: a corrupt action row or a throw from the tx2 mark
   // transaction (a transient error in the CAS / writeback / outcome append)
   // leaves this row claimed for lease-reclaim and lets the loop continue,
   // rather than aborting the pass and stranding the rest of the batch. It must
   // not itself mark the row — lease reclaim is the recovery, and a second write
   // here could race the aborted tx2.
   try {
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
          //
          // The version-fold: gated on the instance's CURRENT version still matching
          // this row's field_version, in the same UPDATE (no TOCTOU). Closes the
          // residual race where a lease-expired-but-not-actually-dead worker's
          // in-memory patch (computed from the pre-migration field ids) completes
          // after migrateOne already remapped this row and moved the instance to a
          // new version — the predicate fails, affected stays 0, and it folds into
          // the ordinary suppression accounting below rather than writing under a
          // stale field id.
          const r = (await tx`UPDATE instances
            SET body = jsonb_set(body, ${`{data,${fid}}`}::text[], (${[val]}::jsonb) -> 0, true),
                resolve_state = 'pending'
            WHERE instance_id = ${row.instance_id} AND (body->>'status') = 'running'
              AND (body->>'version')::int = ${row.field_version}
            RETURNING instance_id`) as unknown[];
          affected += r.length;
        }
        const suppressed = Object.keys(patch).length > 0 && affected === 0;
        await appendOutcome(tx, row, { status: "succeeded", attempts, suppressed });
        delivered++;
      } else if (permanent || attempts >= maxAttemptsFor(row.action)) {
        const cas = (await tx`UPDATE outbox SET status = 'dead-letter', attempts = ${attempts}
          WHERE idempotency_key = ${row.idempotency_key} AND status = 'claimed'
          RETURNING idempotency_key`) as unknown[];
        if (cas.length === 0) return;
        await appendOutcome(tx, row, { status: "dead-letter", attempts });
      } else {
        // Transient: back off and return to pending (drop the lease) for a later drain.
        const backoffMs = backoffMsFor(row.action, attempts);
        await tx`UPDATE outbox SET status = 'pending', attempts = ${attempts}, claimed_at = NULL,
          next_attempt_at = now() + (${backoffMs} * interval '1 millisecond')
          WHERE idempotency_key = ${row.idempotency_key} AND status = 'claimed'`;
      }
    });
   } catch {
     // Corrupt row or a failed mark transaction: leave it claimed (reclaimed
     // after its lease) and move on to the rest of the batch.
   }
  }
  return delivered;
}

/** Poll `drainOutbox` on an interval. Returns a stop handle. */
export function startOutboxWorker(
  db: SQL = sql,
  registry: Registry = new Map(),
  intervalMs = 500,
): { stop: () => void } {
  return pollForever(() => drainOutbox(db, registry), intervalMs);
}

/**
 * Re-resolution worker. An automatic wait-state's result-driven exit depends on
 * data written back asynchronously by an action; the writeback flags the instance
 * `resolve_state='pending'` (see outbox.ts). This worker claims flagged instances,
 * loads the pinned frozen body via an injected resolver, and re-runs
 * resolveAutomatic with a system actor — driving the instance off the wait-state
 * if a guard now matches, or leaving it parked otherwise.
 *
 * Claim / CAS-clear mirrors the outbox: a writeback that re-flags 'pending' during
 * a pass overwrites 'claimed', so the CAS-clear (WHERE resolve_state='claimed')
 * finds nothing and the instance is re-resolved next pass. No mark is lost.
 */

import type { SQL } from "bun";
import { sql } from "./store.js";
import { resolveAutomatic } from "./transition.js";
import { createDefaultAssignmentRegistry, type AssignmentRegistry } from "./registry.js";
import { definitionHash } from "../schema/hash.js";
import { instance as instanceSchema, type Instance, type ProcessBody } from "../schema/definition.js";
import { SYSTEM_ACTOR } from "../cel/eval.js";
import { logSkippedItem } from "./poll.js";

export { SYSTEM_ACTOR };

// A 'claimed' row whose lease has elapsed is an abandoned claim (crashed mid-pass)
// and is reclaimed by a later drain, so a crash between claim and clear does not
// strand the instance. Resolution is a fast in-process op; 30s mirrors the outbox
// and comfortably covers a normal pass.
export const CLAIM_LEASE_MS = 30_000;

/**
 * Resolve an instance's pinned frozen body. No definition store exists yet, so
 * this is injected. A resolver returning `undefined` leaves the instance flagged
 * for a later pass (the worker is inert in production until one is wired).
 */
export type ResolveBody = (
  processId: string,
  version: number,
) => ProcessBody | undefined | Promise<ProcessBody | undefined>;

function parseInstance(raw: unknown): Instance {
  return instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
}

/**
 * One re-resolution pass. Claim `pending` running instances `FOR UPDATE SKIP
 * LOCKED`, run resolveAutomatic on each with its frozen body, then CAS-clear to
 * `idle`. Returns the number of instances processed (a resolver miss is not
 * counted). A parked instance that still matches nothing is a processed no-op.
 */
export async function drainResolutions(
  db: SQL = sql,
  resolveBody: ResolveBody = () => undefined,
  leaseMs: number = CLAIM_LEASE_MS,
  assignmentRegistry: AssignmentRegistry = createDefaultAssignmentRegistry(),
): Promise<number> {
  // Claim fresh 'pending' rows plus 'claimed' rows past their lease (an abandoned
  // claim from a crashed pass). Stamp resolve_claimed_at so this claim can itself
  // be reclaimed if this pass dies. FOR UPDATE SKIP LOCKED so concurrent drains
  // never claim the same row.
  const claimed = (await db`UPDATE instances SET resolve_state = 'claimed', resolve_claimed_at = now()
    WHERE instance_id IN (
      SELECT instance_id FROM instances
      WHERE (body->>'status') = 'running'
        AND (resolve_state = 'pending'
          OR (resolve_state = 'claimed' AND resolve_claimed_at < now() - (${leaseMs} * interval '1 millisecond')))
      ORDER BY instance_id
      FOR UPDATE SKIP LOCKED
      LIMIT 100
    )
    RETURNING instance_id, body`) as { instance_id: string; body: unknown }[];

  // A failing instance is left 'claimed' rather than requeued to 'pending':
  // requeueing makes the row selectable again on the very next pass, so a
  // persistent per-instance fault becomes a write loop at the poll interval,
  // and — since the claim scan is ordered by instance_id and capped — enough
  // such rows occupy the whole batch and starve every other flagged instance.
  // Leaving it 'claimed' reuses the lease-expiry predicate above as the retry
  // cadence instead: bounded, already implemented, already tested. The cost is
  // a transient failure waits up to one lease before its next attempt instead
  // of retrying at once — not observable for a worker whose job is to re-drive
  // a parked wait-state. A concurrent writeback still wins: outbox.ts's
  // writeback sets resolve_state = 'pending' unconditionally (not gated on the
  // current state), so it overwrites a 'claimed' row left behind by a failure
  // exactly as it would overwrite a fresh claim — a legitimately re-flagged
  // instance is never delayed by this.
  let processed = 0;
  for (const row of claimed) {
    try {
      // Body parse and body resolution are inside the boundary: a corrupt jsonb
      // row or a resolver that throws leaves this one instance claimed (for
      // lease-expiry retry) rather than aborting the pass and stranding every
      // other claimed instance.
      const inst = parseInstance(row.body);
      const body = await resolveBody(inst.processId, inst.version);
      if (!body) continue; // resolver miss: leave claimed; retried once the lease expires
      // Verify the resolver returned the body the instance is pinned to, same
      // check rehydrate() makes. A mismatch is a resolver misconfiguration;
      // leave claimed rather than run against the wrong definition.
      if (definitionHash(body) !== inst.definitionHash)
        throw new Error(`resolveBody returned a body not matching instance pin: ${inst.instanceId}`);
      // Re-drive automatic evaluation. A no-op on a manual/terminal step or a
      // still-unmatched wait-state; a matching guard transitions to rest. OCC on
      // transitionSeq makes a concurrent transition safe (this one loses and
      // stays claimed for the lease to reclaim).
      await resolveAutomatic(inst, body, SYSTEM_ACTOR, db, assignmentRegistry);
    } catch (e) {
      // Log before continuing: the drain returns normally, so the tick
      // boundary never sees this and an instance failing every pass is
      // otherwise invisible.
      logSkippedItem("resolution", { instanceId: row.instance_id }, e);
      continue; // leave claimed; the lease-expiry predicate is the retry cadence
    }
    await db`UPDATE instances SET resolve_state = 'idle'
      WHERE instance_id = ${row.instance_id} AND resolve_state = 'claimed'`;
    processed++;
  }
  return processed;
}

/**
 * Data retention and erasure (roadmap #20). `redactInstance` clears a
 * non-running instance's personal data — `instances.body.data`,
 * `instance_comments`, `instance_attachments`, `instance_drafts` — in one
 * transaction, and is the shared mechanism behind both the manual admin
 * route and the automatic sweep below. Neither `history_entries` nor
 * `instance_events` is touched; both already carry structural facts only,
 * never a field value.
 */
import type { SQL } from "bun";
import { sql, withTransaction } from "./store.js";
import { instance as instanceSchema, type Instance, type InstanceId } from "../schema/definition.js";
import { NotFoundError, InstanceRunningError } from "../errors.js";
import { logSkippedItem } from "./poll.js";
import { deleteInstanceDraft } from "./instance-drafts.js";

const BATCH = 500;

export async function redactInstance(instanceId: InstanceId, db: SQL = sql): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const rows = (await tx`SELECT body, redacted_at FROM instances WHERE instance_id = ${instanceId} FOR UPDATE`) as {
      body: unknown;
      redacted_at: string | null;
    }[];
    if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
    const inst = instanceSchema.parse(typeof rows[0].body === "string" ? JSON.parse(rows[0].body) : rows[0].body);
    if (inst.status === "running") throw new InstanceRunningError(instanceId, inst.status);
    // Idempotent: a second call against an already-redacted row is a no-op,
    // not an error, matching the outbox's own no-op-on-repeat shape.
    if (rows[0].redacted_at !== null) return inst;

    // `redactedAt` is written into `body` too, not just the `redacted_at`
    // column: `Instance.redactedAt` (what getInstanceView/InstanceView
    // expose) parses from `body`, same as every other Instance field. The
    // separate column exists only so the sweep's WHERE clause and its
    // partial index can filter without a jsonb scan; the two must agree.
    const at = new Date().toISOString();
    await tx`UPDATE instances SET body = body || ${{ data: {}, redactedAt: at }}::jsonb, redacted_at = ${at}
      WHERE instance_id = ${instanceId}`;
    await tx`DELETE FROM instance_comments WHERE instance_id = ${instanceId}`;
    await tx`DELETE FROM instance_attachments WHERE instance_id = ${instanceId}`;
    await deleteInstanceDraft(instanceId, tx);

    return { ...inst, data: {}, redactedAt: at };
  });
}

/**
 * One sweep tick, keyset-paged by `instance_id` in batches of `BATCH` —
 * mirrors `migrateInstances`/`findOrphanKeys`'s own scans — rather than
 * selecting every eligible instance in one unbounded query. `faulted`
 * instances are excluded: a fault is an anomaly an operator may still need
 * to inspect, not a normal completion. `COALESCE` falls back to `startedAt`
 * for an instance that predates `currentStepEnteredAt`, the same fallback
 * every other reader of that field already applies — without it, the
 * oldest instances (exactly the ones retention exists to bound) would never
 * become eligible.
 */
export async function sweepRetention(db: SQL, days: number): Promise<void> {
  let last = "";
  for (;;) {
    const rows = (await db`SELECT instance_id FROM instances
      WHERE instance_id > ${last}
        AND redacted_at IS NULL
        AND body->>'status' IN ('completed', 'cancelled')
        AND COALESCE((body->>'currentStepEnteredAt')::timestamptz, (body->>'startedAt')::timestamptz)
          < now() - make_interval(days => ${days})
      ORDER BY instance_id LIMIT ${BATCH}`) as { instance_id: string }[];
    if (rows.length === 0) break;
    for (const { instance_id: id } of rows) {
      last = id; // keyset advances regardless of outcome, matching migrateInstances
      try {
        await redactInstance(id as InstanceId, db);
      } catch (e) {
        // One instance's failure does not stop the rest of the batch — the
        // same per-row fault isolation migrateInstances/findOrphanKeys use.
        // The line is the only record: the sweep returns normally, so the tick
        // boundary never sees this and an instance failing every sweep is
        // otherwise invisible.
        logSkippedItem("retention", { instanceId: id }, e);
      }
    }
  }
}

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
import { sql, withTransaction, setAuditAttribution } from "./store.js";
import { instance as instanceSchema, collectFieldsDeep, type Instance, type InstanceId } from "../schema/definition.js";
import { NotFoundError, InstanceRunningError } from "../errors.js";
import { logSkippedItem } from "./poll.js";
import { deleteInstanceDraft } from "./instance-drafts.js";
import { createDefinitionStore } from "./definitions.js";

const BATCH = 500;

export async function redactInstance(
  instanceId: InstanceId,
  db: SQL = sql,
  opts?: { actor?: string; reason?: string },
): Promise<Instance> {
  return withTransaction(db, async (tx) => {
    const rows = (await tx`SELECT body, redacted_at FROM instances WHERE instance_id = ${instanceId} FOR UPDATE`) as {
      body: unknown;
      redacted_at: string | null;
    }[];
    if (rows.length === 0) throw new NotFoundError(`instance not found: ${instanceId}`);
    const inst = instanceSchema.parse(typeof rows[0].body === "string" ? JSON.parse(rows[0].body) : rows[0].body);
    if (inst.status === "running") throw new InstanceRunningError(instanceId, inst.status);
    // Idempotent: a second call against an already-redacted row is a no-op,
    // not an error, matching the outbox's own no-op-on-repeat shape. This also
    // guards redact_instance_fields below from a second, spurious redact entry.
    if (rows[0].redacted_at !== null) return inst;

    // instance-audit-log-chain: attributes both the body.data wipe below and
    // redact_instance_fields's own trigger-free appends to this redaction
    // (design.md "Actor and source arrive through set_config").
    await setAuditAttribution(tx, opts?.actor ?? null, "redaction");

    // `redactedAt` is written into `body` too, not just the `redacted_at`
    // column: `Instance.redactedAt` (what getInstanceView/InstanceView
    // expose) parses from `body`, same as every other Instance field. The
    // separate column exists only so the sweep's WHERE clause and its
    // partial index can filter without a jsonb scan; the two must agree.
    const at = new Date().toISOString();
    await tx`UPDATE instances SET body = body || ${{ data: {}, redactedAt: at }}::jsonb, redacted_at = ${at}
      WHERE instance_id = ${instanceId}`;
    // The redactable field-id set comes from the instance's currently pinned
    // definition, resolved here rather than inside redact_instance_fields:
    // that function is SECURITY DEFINER, owned by an audit-only role with no
    // access to `definitions` (redactable-field-flag design.md "The
    // currently pinned version's catalog is the sole source of truth").
    const { resolveBody } = createDefinitionStore(tx);
    const body = await resolveBody(inst.processId, inst.version);
    if (!body) {
      throw new Error(`redactInstance: no published definition for ${inst.processId}@${inst.version}`);
    }
    const fieldIds = collectFieldsDeep(body.fields)
      .filter((f) => f.redactable === true)
      .map((f) => f.id);

    // Clears every prior value the instance's audit entries hold for a field
    // the currently pinned version marks redactable — the trigger above only
    // ever appends, never clears (design.md "Redaction is its own definer
    // function").
    await tx`SELECT redact_instance_fields(
      ${instanceId}, ${opts?.actor ?? null}, ${opts?.reason ?? null}, ${inst.transitionSeq}, ${tx.array(fieldIds, "TEXT")}
    )`;
    await tx`DELETE FROM instance_comments WHERE instance_id = ${instanceId}`;
    await tx`DELETE FROM instance_attachments WHERE instance_id = ${instanceId}`;
    await deleteInstanceDraft(instanceId, tx);
    // instance-visibility-set is the sixth relation: both its principal rows
    // and any revocation rows standing against them. Each names a person, so
    // neither outlives the values it stood beside. A redacted instance is
    // therefore absent from every participant's `scope=visible` list.
    await tx`DELETE FROM instance_principals WHERE instance_id = ${instanceId}`;
    await tx`DELETE FROM instance_principals_denied WHERE instance_id = ${instanceId}`;

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

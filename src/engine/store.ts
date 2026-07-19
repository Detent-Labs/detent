/**
 * Instance store: persist an instance and rehydrate it against its pinned frozen
 * body. Native Bun.sql, connection via DATABASE_URL. Two tables — `instances`
 * (one row per instance, jsonb body + promoted transition_seq for the OCC
 * predicate) and append-only `history_entries` — matching the schema's own
 * separation (Instance carries no history; HistoryEntry carries instanceId).
 */

import { SQL } from "bun";
import { instance as instanceSchema, type Instance, type ProcessBody, type ProcessId } from "../schema/definition.js";
import { definitionHash } from "../schema/hash.js";
import { armStepTimers, minFireAt } from "./duration.js";

/** Shared client. Constructed lazily-ish; a query throws if DATABASE_URL is unset. */
export const sql = new SQL(process.env.DATABASE_URL ?? "");

export async function initSchema(db: SQL = sql): Promise<void> {
  await db`CREATE TABLE IF NOT EXISTS instances (
    instance_id text PRIMARY KEY,
    transition_seq integer NOT NULL,
    body jsonb NOT NULL
  )`;
  await db`CREATE TABLE IF NOT EXISTS history_entries (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    entry jsonb NOT NULL
  )`;
  // Outbox: one row per enqueued trigger action. idempotency_key (PK) makes
  // re-enqueuing a replayed transition conflict instead of duplicating.
  await db`CREATE TABLE IF NOT EXISTS outbox (
    idempotency_key text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    action_id text NOT NULL,
    action jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz
  )`;
  // Claim/deliver/mark split: a claimed row carries a lease (claimed_at). status
  // is free text, so the 'claimed' state needs no constraint change. Idempotent
  // add so an existing outbox table gains the column.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS outbox_claim_idx ON outbox (status, next_attempt_at)`;
  // Re-resolution flag: a data-affecting writeback sets this to 'pending' so the
  // resolution worker re-drives automatic evaluation for a parked wait-state.
  // Idempotent add + index for the worker's claim scan.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_state text NOT NULL DEFAULT 'idle'`;
  // Lease stamp for the resolution worker's claim: a 'claimed' row past its lease
  // is an abandoned (crashed) claim and is reclaimed by a later drain.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_claimed_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_resolve_idx ON instances (resolve_state)`;
  // Timer scheduling: the min unfired fireAt of the current step's armed timers,
  // maintained at every arm/disarm. The scheduler polls WHERE next_timer_at <= now().
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS next_timer_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_timer_idx ON instances (next_timer_at)`;
}

/**
 * Create an instance pinned to { processId, version, definitionHash }, at the
 * definition's initialStep, transitionSeq 0, and persist it.
 * ponytail: instanceId is UUIDv4; the contract calls for UUIDv7 (time-sortable).
 * transitionSeq already orders history per instance, so upgrade to v7 only when
 * cross-instance time ordering is needed.
 */
export async function createInstance(
  body: ProcessBody,
  opts: { processId: ProcessId; version: number },
  db: SQL = sql,
): Promise<Instance> {
  // Arm the initial step's timers here, atomically with the INSERT — creation is a
  // step entry, and a resting initial wait-state needs its bound. Doing it in a
  // separate post-INSERT UPDATE would leave a crash window that permanently strands
  // the timer (no worker re-arms a next_timer_at=NULL running instance). If
  // resolveAutomatic later transitions off the initial step, the first commit
  // replaces these timers (disarming). Arming is deterministic (no guard, no
  // actor), so it stays within createInstance's persistence-only remit.
  const startedAt = new Date().toISOString();
  const timers = armStepTimers(
    body.workflow.steps.find((s) => s.id === body.workflow.initialStep),
    startedAt,
  );
  const inst: Instance = instanceSchema.parse({
    instanceId: `inst_${crypto.randomUUID()}`,
    processId: opts.processId,
    version: opts.version,
    definitionHash: definitionHash(body),
    currentStepId: body.workflow.initialStep,
    transitionSeq: 0,
    data: {},
    timers,
    status: "running",
    startedAt,
  });
  // Bind the object directly: Bun.sql encodes it as a jsonb object. A
  // JSON.stringify(...)::jsonb param would store a jsonb *scalar string* that
  // jsonb_set (used by the transition/writeback) cannot traverse.
  await db`INSERT INTO instances (instance_id, transition_seq, body, next_timer_at)
    VALUES (${inst.instanceId}, ${inst.transitionSeq}, ${inst}, ${minFireAt(timers)})`;
  return inst;
}

export class PinMismatch extends Error {
  constructor(instanceId: string, pinned: string, got: string) {
    super(`pin mismatch: instance ${instanceId} pinned ${pinned}, supplied body hashes to ${got}`);
    this.name = "PinMismatch";
  }
}

/**
 * Load an instance and verify the supplied body is the one it is pinned to by
 * recomputing its hash. Refuses on mismatch rather than running against the
 * wrong body.
 */
export async function rehydrate(instanceId: string, body: ProcessBody, db: SQL = sql): Promise<Instance> {
  const rows = (await db`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  if (rows.length === 0) throw new Error(`instance not found: ${instanceId}`);
  // Bun.sql returns jsonb as text; parse when it does.
  const raw = rows[0].body;
  const inst = instanceSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  const got = definitionHash(body);
  if (got !== inst.definitionHash) throw new PinMismatch(instanceId, inst.definitionHash, got);
  return inst;
}

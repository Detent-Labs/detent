/**
 * Instance store: persist an instance and rehydrate it against its pinned frozen
 * body. Native Bun.sql, connection via DATABASE_URL. `instances` holds one row
 * per instance (jsonb body + promoted transition_seq for the OCC predicate);
 * append-only `history_entries` and `instance_events` hold the runtime record,
 * matching the schema's own separation (Instance carries neither; both records
 * carry instanceId).
 */

import { SQL } from "bun";
import {
  instance as instanceSchema,
  type Instance,
  type InstanceEvent,
  type InstanceEventId,
  type ProcessBody,
  type ProcessId,
  type StepId,
} from "../schema/definition.js";
import { definitionHash } from "../schema/hash.js";
import { armStepTimers, minFireAt } from "./duration.js";
import { idempotencyKey } from "./idempotency.js";
import { SPAWN_ACTION_TYPE, STATIC_ASSIGNMENT_STRATEGY_TYPE } from "./registry.js";

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
  // Append-only runtime events that are not transitions, shaped like
  // history_entries. `kind` is promoted out of the jsonb so the log is queryable
  // by kind ("which instances dropped a timer, and why") without a jsonb scan.
  await db`CREATE TABLE IF NOT EXISTS instance_events (
    id text PRIMARY KEY,
    instance_id text NOT NULL,
    transition_seq integer NOT NULL,
    kind text NOT NULL,
    event jsonb NOT NULL
  )`;
  await db`CREATE INDEX IF NOT EXISTS instance_events_instance_idx ON instance_events (instance_id, transition_seq)`;
  await db`CREATE INDEX IF NOT EXISTS instance_events_kind_idx ON instance_events (kind)`;
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
  // Outcome routing: the runtime record that enqueued this action. An
  // InstanceEvent id when a reminder fire enqueued it, NULL when a transition did
  // (its outcome is located by (instance_id, transition_seq), which identifies a
  // transition exactly and an event not at all). Idempotent add.
  await db`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS event_id text`;
  await db`CREATE INDEX IF NOT EXISTS outbox_claim_idx ON outbox (status, next_attempt_at)`;
  // Re-resolution flag: a data-affecting writeback sets this to 'pending' so the
  // resolution worker re-drives automatic evaluation for a parked wait-state.
  // Idempotent add + index for the worker's claim scan.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_state text NOT NULL DEFAULT 'idle'`;
  // Lease stamp for the resolution worker's claim: a 'claimed' row past its lease
  // is an abandoned (crashed) claim and is reclaimed by a later drain.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS resolve_claimed_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_resolve_idx ON instances (resolve_state)`;
  // Cancel-cascade sweep durability: 'idle' (never cancelled, or not yet attempted),
  // 'pending' (cancelled; the direct-child sweep has not completed without a
  // conflicted or failed child), 'done' (a sweep pass found zero conflicted/failed
  // children). Read by instance_id only (cancelInstance's own resume check), never
  // scanned by a worker, so no index.
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS cancel_sweep_state text NOT NULL DEFAULT 'idle'`;
  // Timer scheduling: the min unfired fireAt of the current step's armed timers,
  // maintained at every arm/disarm. The scheduler polls WHERE next_timer_at <= now().
  await db`ALTER TABLE instances ADD COLUMN IF NOT EXISTS next_timer_at timestamptz`;
  await db`CREATE INDEX IF NOT EXISTS instances_timer_idx ON instances (next_timer_at)`;
  // Definition store: one row per published version, keyed by (process_id, version).
  // Holds the frozen compiled body plus its pin metadata; the resolution/timer
  // workers resolve an instance's body from here. Immutable — the PK forbids a
  // body overwrite at an existing (process_id, version).
  await db`CREATE TABLE IF NOT EXISTS definitions (
    process_id text NOT NULL,
    version integer NOT NULL,
    definition_hash text NOT NULL,
    status text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    body jsonb NOT NULL,
    PRIMARY KEY (process_id, version)
  )`;
  // Idempotent-publish lookup: an identical re-publish matches by (process_id, hash).
  await db`CREATE INDEX IF NOT EXISTS definitions_hash_idx ON definitions (process_id, definition_hash)`;
  // Migration plans: the rule moving instances from one version to another, keyed by
  // its version pair and independent of `definitions` (a published body stays
  // immutable while its plan is corrected before use, and several source versions may
  // target one target). `applied_at` is NULL until the first instance migrates under
  // it; registration upserts under `WHERE applied_at IS NULL` to freeze it atomically.
  await db`CREATE TABLE IF NOT EXISTS migration_plans (
    process_id text NOT NULL,
    from_version integer NOT NULL,
    to_version integer NOT NULL,
    spec jsonb NOT NULL,
    applied_at timestamptz,
    PRIMARY KEY (process_id, from_version, to_version)
  )`;
  // The migration population scan selects {processId, version, status} once per
  // batch across every instance. Those fields live inside the jsonb body, so without
  // an index each batch sequentially scans the whole instances relation.
  await db`CREATE INDEX IF NOT EXISTS instances_selection_idx
    ON instances ((body->>'processId'), (body->>'version'), (body->>'status'))`;
}

/**
 * Run `fn` in a transaction, joining one already in progress rather than opening
 * a second. Bun rejects `begin` on a transaction-scoped client ("cannot call
 * begin inside a transaction use savepoint() instead") and exposes `savepoint`
 * only on that client, so its presence is the discriminator.
 *
 * A throw inside a savepoint propagates out of the enclosing `begin` and rolls
 * the whole outer transaction back, so joining never silently contains an inner
 * failure — the caller's all-or-nothing still holds.
 *
 * Every engine write path that could ever be reached from inside another one uses
 * this rather than `begin` directly. Nesting is a *runtime* throw, not a type
 * error, so a direct `begin` is a trap that only fires in production once some
 * caller wraps it. `drainOutbox`'s post-delivery transaction is the exception and
 * stays on `begin`: it is the outermost writer by construction, since the outbox
 * worker runs handlers outside any transaction.
 */
export function withTransaction<T>(db: SQL, fn: (tx: SQL) => Promise<T>): Promise<T> {
  const joinable = db as SQL & { savepoint?: (fn: (tx: SQL) => Promise<T>) => Promise<T> };
  if (typeof joinable.savepoint === "function") return joinable.savepoint(fn);
  return db.begin(fn) as Promise<T>;
}

/**
 * Mint an event id. UUIDv4 like the other runtime ids — see createInstance's
 * note on the v7 deferral; a third convention would be worse than the one gap.
 */
export function newInstanceEventId(): InstanceEventId {
  return `evt_${crypto.randomUUID()}` as InstanceEventId;
}

/**
 * Append one runtime event. Takes the transaction handle rather than opening its
 * own: an event must land in the same commit as the state change that caused it,
 * so it cannot survive a rollback and the commit cannot land without it.
 *
 * Ids are random per call, so `ON CONFLICT (id) DO NOTHING` never fires today; it
 * is a backstop against a double-append of one event object, not the mechanism
 * that keeps a replayable emitter honest. Each emitter is guarded by a
 * rows-affected check on the state change it accompanies — createInstance's
 * `RETURNING instance_id`, fireTimer's OCC predicate — so a replay that changed
 * nothing appends nothing. An emitter that ever needs conflict-based idempotency
 * instead would have to derive its id deterministically.
 */
export async function appendInstanceEvent(tx: SQL, event: InstanceEvent): Promise<void> {
  await tx`INSERT INTO instance_events (id, instance_id, transition_seq, kind, event)
    VALUES (${event.id}, ${event.instanceId}, ${event.transitionSeq}, ${event.kind}, ${event})
    ON CONFLICT (id) DO NOTHING`;
}

/** Append several events in one transaction; an empty list writes nothing. */
export async function appendInstanceEvents(tx: SQL, events: readonly InstanceEvent[]): Promise<void> {
  for (const e of events) await appendInstanceEvent(tx, e);
}

/**
 * Create an instance pinned to { processId, version, definitionHash }, at the
 * definition's initialStep, transitionSeq 0, and persist it. Creation is not a
 * transition — no HistoryEntry, no trigger actions — but it is a step entry, so
 * it carries the entry consequences the initial step declares: its timers are
 * armed, and if it is a subprocess step its spawn is enqueued (both inside the
 * INSERT transaction; see below).
 * ponytail: instanceId is UUIDv4; the contract calls for UUIDv7 (time-sortable).
 * transitionSeq already orders history per instance, so upgrade to v7 only when
 * cross-instance time ordering is needed.
 */
export async function createInstance(
  body: ProcessBody,
  opts: {
    processId: ProcessId;
    version: number;
    // Subprocess spawn: a deterministic child id (idempotent spawn), seed data
    // (from the parent's inputMapping), and the parent link. Omitted for a
    // top-level instance (random id, empty data, no parent).
    instanceId?: string;
    data?: Instance["data"];
    parent?: { instanceId: string; stepId: StepId };
  },
  db: SQL = sql,
): Promise<Instance> {
  // Arm the initial step's timers here, atomically with the INSERT — creation is a
  // step entry, and a resting initial wait-state needs its bound. Doing it in a
  // separate post-INSERT UPDATE would leave a crash window that permanently strands
  // the timer (no worker re-arms a next_timer_at=NULL running instance). If
  // resolveAutomatic later transitions off the initial step, the first commit
  // replaces these timers (disarming). Arming reads only the seed data and the
  // system actor, so it stays within createInstance's persistence-only remit.
  // The instance is validated first with no timers and armed against itself, so a
  // deadline on the initial step evaluates over the real seed data and instance
  // projection rather than a stand-in.
  const startedAt = new Date().toISOString();
  const initial = body.workflow.steps.find((s) => s.id === body.workflow.initialStep);
  // Mirrors planStepEntry's derivation (target.terminal ? "completed" :
  // instance.status): a process whose initialStep is terminal — a legitimate
  // shape (e.g. a migration target instances relocate onto, never created
  // from directly) — must not create a permanently-"running" instance that
  // can never complete.
  const seed: Instance = instanceSchema.parse({
    instanceId: opts.instanceId ?? `inst_${crypto.randomUUID()}`,
    processId: opts.processId,
    version: opts.version,
    definitionHash: definitionHash(body),
    currentStepId: body.workflow.initialStep,
    transitionSeq: 0,
    data: opts.data ?? {},
    timers: [],
    ...(opts.parent ? { parent: opts.parent } : {}),
    status: initial?.terminal ? "completed" : "running",
    startedAt,
  });
  const { armed: timers, drops } = armStepTimers(initial, startedAt, body, seed);
  // Creation is a step entry like any other, so an assignment-bearing initial
  // step gets candidates resolved here too — mirroring timer arming just
  // above, which planStepEntry also does not cover for creation.
  let assignment: Instance["assignment"];
  if (initial?.assignment) {
    const strategy = initial.assignment.strategy;
    const candidates = strategy.type === STATIC_ASSIGNMENT_STRATEGY_TYPE
      ? ((strategy.config as { candidates?: string[] }).candidates ?? [])
      : [];
    assignment = { candidates, claimedBy: undefined, claimedAt: undefined };
  }
  const inst: Instance = { ...seed, timers, assignment };
  // A timer the initial step declared but arming could not compute a fireAt for.
  // Recorded at seq 0 — creation advances no sequence, and an event records the
  // seq in force rather than advancing it.
  const events: InstanceEvent[] = drops.map((d) => ({
    id: newInstanceEventId(),
    instanceId: inst.instanceId,
    transitionSeq: inst.transitionSeq,
    version: inst.version,
    kind: "timer.unarmed" as const,
    payload: { timerId: d.timerId, reason: d.reason },
    at: startedAt,
  }));
  // Creation at a subprocess initial step is a step entry like any other and
  // carries the same consequence: the child is spawned. planStepEntry enqueues
  // this on a transition; creation is not a transition and does not route
  // through the seam, so it restates the one row here rather than teaching the
  // seam a seq-0/no-HistoryEntry mode. Enqueuing inside the INSERT transaction
  // is load-bearing: a post-create enqueue leaves a crash window that strands
  // the instance forever on a wait-state nothing re-enqueues — the same argument
  // that put timer arming here. The coordinates are the ordinary ones with the
  // sequence being 0, so the handler (which derives the deterministic child id
  // from them) needs no special case and nesting composes through the outbox.
  //
  // The accompanying event is what the spawn's ActionOutcome attaches to.
  // Creation writes no HistoryEntry, so an event_id-less row would fall back to
  // the transition record at (instanceId, 0), match nothing, and discard the
  // outcome silently — precisely the failure event_id exists to close.
  //
  // This stays within the store's persistence-only remit: nothing is evaluated,
  // the row is a static function of the initial step and the instance id.
  const subStep = initial?.type === "subprocess" ? initial : undefined;
  const spawn = subStep && {
    id: `action_spawn_${subStep.id}`,
    type: SPAWN_ACTION_TYPE,
    config: { subprocessStepId: subStep.id, parentSeq: 0 },
  };
  const spawnEvent: InstanceEvent | undefined = subStep && {
    id: newInstanceEventId(),
    instanceId: inst.instanceId,
    transitionSeq: inst.transitionSeq,
    version: inst.version,
    kind: "subprocess.spawn-enqueued" as const,
    payload: { stepId: subStep.id },
    at: startedAt,
  };
  if (spawnEvent) events.push(spawnEvent);
  // Bind the object directly: Bun.sql encodes it as a jsonb object. A
  // JSON.stringify(...)::jsonb param would store a jsonb *scalar string* that
  // jsonb_set (used by the transition/writeback) cannot traverse.
  // ON CONFLICT DO NOTHING: a redelivered subprocess spawn (deterministic id)
  // is a no-op; the spawn handler checks prior existence to skip re-driving it.
  // RETURNING is what reconciles the events and the spawn row with that no-op:
  // they are written only inside the transaction whose INSERT actually created
  // the row, so a spawn that inserted nothing records nothing and enqueues
  // nothing, and a replay cannot double them. The conflicting attempt sees zero
  // rows and returns before writing either. That is also why the outbox insert
  // needs no ON CONFLICT: outside the guard, a redelivered child creation would
  // collide on the deterministic outbox key and fail the handler.
  await withTransaction(db, async (tx) => {
    // resolve_state starts 'pending', not the column's 'idle' default: both
    // callers (startInstance, the subprocess spawn handler) immediately cascade
    // the instance they just created, and a crash between this INSERT and that
    // cascade's first hop would otherwise leave a cascade-eligible initial step
    // unmarked — the same gap applyStepEntry closes for every later commit.
    const inserted = (await tx`INSERT INTO instances (instance_id, transition_seq, body, next_timer_at, resolve_state)
      VALUES (${inst.instanceId}, ${inst.transitionSeq}, ${inst}, ${minFireAt(timers)}, 'pending')
      ON CONFLICT (instance_id) DO NOTHING
      RETURNING instance_id`) as unknown[];
    if (inserted.length === 0) return;
    await appendInstanceEvents(tx, events);
    if (spawn && spawnEvent) {
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action, event_id)
        VALUES (${idempotencyKey(inst.instanceId, inst.transitionSeq, spawn.id)}, ${inst.instanceId}, ${inst.transitionSeq}, ${spawn.id}, ${spawn}, ${spawnEvent.id})`;
    }
  });
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

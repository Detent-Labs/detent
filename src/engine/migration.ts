/**
 * Instance migration: the plan store and the operation moving running instances
 * from one published version of a process onto another under one rule.
 *
 * A migration plan is a row keyed `(processId, fromVersion, toVersion)`, registered
 * independently of definition publish and editable until the first instance migrates
 * under it — then frozen by an atomic guard. The operation itself (below) reads the
 * plan once, stamps it applied before touching any instance, and migrates each
 * running instance in its own row-locked transaction through the shared step-entry
 * seam.
 */

import { SQL } from "bun";
import {
  migrationSpec,
  instance as instanceSchema,
  CANCEL_SINK_STEP_ID,
  type MigrationSpec,
  type MigrationSkipReason,
  type ProcessBody,
  type ProcessId,
  type FieldDef,
  type Instance,
  type InstanceEvent,
  type Step,
  type Timer,
  type TimerState,
  type TimerProvenance,
  type Action,
} from "../schema/definition.js";
import { celType, validateMigrationSpec } from "../cel/check.js";
import { evalTransforms, type TransformDrop } from "../cel/eval.js";
import { definitionHash } from "../schema/hash.js";
import { createDefinitionStore } from "./definitions.js";
import { planStepEntry, applyStepEntry, ConcurrencyConflict } from "./transition.js";
import { armStepTimers, type TimerDrop } from "./duration.js";
import type { ResolveBody } from "./resolution.js";
import { sql, newInstanceEventId, appendInstanceEvent, withTransaction } from "./store.js";
import { CLAIM_LEASE_MS } from "./outbox.js";
import { log } from "../log.js";

/** A migration plan is invalid, unresolvable, or already frozen. */
export class MigrationPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationPlanError";
  }
}

/** Flatten a catalog to fieldId -> CEL type string, recursing groups. */
function fieldTypeById(fields: FieldDef[]): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (fs: FieldDef[]) => {
    for (const f of fs) {
      if (typeof f.type === "string" && f.type === "group") {
        if (f.fields) walk(f.fields);
      } else {
        m.set(f.id, celType(f.type));
      }
    }
  };
  walk(fields);
  return m;
}

/**
 * Validate a spec against both bodies (4.2–4.4). Throws MigrationPlanError on the
 * first violation. Structural resolution first, then type compatibility, then the
 * transform expressions (delegated to the CEL layer). All of this runs at
 * registration so a rule that resolves nowhere fails once, before any instance
 * moves — the same write-path placement plugin-config and CEL checking take.
 */
function validatePlan(spec: MigrationSpec, fromBody: ProcessBody, toBody: ProcessBody): void {
  const srcSteps = new Set(fromBody.workflow.steps.map((s) => s.id as string));
  const tgtSteps = new Set(toBody.workflow.steps.map((s) => s.id as string));
  const srcFields = fieldTypeById(fromBody.fields);
  const tgtFields = fieldTypeById(toBody.fields);

  // stepMap: keys in the source body, values in the target — and never the reserved
  // cancel-sink, which compileProcessBody injects into every body (so it passes a
  // bare existence check) while parking the instance on the cancellation terminal.
  for (const [k, v] of Object.entries(spec.stepMap ?? {})) {
    if (v === undefined) continue;
    if (!srcSteps.has(k)) throw new MigrationPlanError(`stepMap key ${k} is not a step in the source body`);
    if (!tgtSteps.has(v)) throw new MigrationPlanError(`stepMap value ${v} is not a step in the target body`);
    if (v === (CANCEL_SINK_STEP_ID as string))
      throw new MigrationPlanError(`stepMap value ${v} is the reserved cancel-sink`);
  }

  // fieldMap: keys in the source catalog, values in the target.
  for (const [k, v] of Object.entries(spec.fieldMap ?? {})) {
    if (v === undefined) continue;
    if (!srcFields.has(k)) throw new MigrationPlanError(`fieldMap key ${k} is not a field in the source catalog`);
    if (!tgtFields.has(v)) throw new MigrationPlanError(`fieldMap value ${v} is not a field in the target catalog`);
  }

  // transforms keys in the target catalog (the expressions themselves are the CEL
  // delegation below; this is the structural half).
  for (const k of Object.keys(spec.transforms ?? {}))
    if (!tgtFields.has(k)) throw new MigrationPlanError(`transforms key ${k} is not a field in the target catalog`);

  // unmappableStep in the target body and never the cancel-sink (the presence-iff
  // relationship with onUnmappable is already a schema refinement).
  if (spec.unmappableStep !== undefined) {
    const u = spec.unmappableStep as string;
    if (!tgtSteps.has(u)) throw new MigrationPlanError(`unmappableStep ${u} is not a step in the target body`);
    if (u === (CANCEL_SINK_STEP_ID as string))
      throw new MigrationPlanError(`unmappableStep ${u} is the reserved cancel-sink`);
  }

  // Type compatibility: every fieldMap pair, and every field id declared by BOTH
  // catalogs with no fieldMap entry. The identity-carried case has no entry to hang a
  // per-pair check on, yet its declared type may have changed between versions — a
  // value landing in a field the target types differently makes every guard reading
  // it raise, which guard totality turns into a silently wrong branch.
  for (const [k, v] of Object.entries(spec.fieldMap ?? {})) {
    if (v === undefined) continue;
    if (srcFields.get(k) !== tgtFields.get(v))
      throw new MigrationPlanError(
        `fieldMap ${k} (${srcFields.get(k)}) -> ${v} (${tgtFields.get(v)}) crosses incompatible types`,
      );
  }
  const mapped = new Set(Object.keys(spec.fieldMap ?? {}));
  for (const [id, srcType] of srcFields) {
    if (mapped.has(id)) continue;
    if (tgtFields.has(id) && tgtFields.get(id) !== srcType)
      throw new MigrationPlanError(
        `field ${id} is carried by identity but changes type (${srcType} -> ${tgtFields.get(id)})`,
      );
  }

  // transform expressions: parse + type-check against the source catalog, result type
  // against the target field.
  const issues = validateMigrationSpec(spec, fromBody, toBody);
  if (issues.length) throw new MigrationPlanError(`${issues[0].loc}: ${issues[0].message}`);
}

/**
 * Register (or correct) a migration plan for `(processId, fromVersion, toVersion)`.
 * Both versions must be published and differ. The spec is validated against both
 * bodies, then upserted under `WHERE applied_at IS NULL` in one atomic statement:
 * an existing key that has been applied yields zero affected rows and is refused, so
 * a registration racing an invocation can never store a spec after instances have
 * migrated under a different one. A read-then-write would leave exactly that window.
 */
export async function registerMigrationPlan(
  processId: ProcessId,
  fromVersion: number,
  toVersion: number,
  spec: MigrationSpec,
  db: SQL = sql,
): Promise<void> {
  if (fromVersion === toVersion) throw new MigrationPlanError("fromVersion equals toVersion");
  const store = createDefinitionStore(db);
  const fromBody = await store.resolveBody(processId, fromVersion);
  if (!fromBody) throw new MigrationPlanError(`source version ${fromVersion} is not published`);
  const toBody = await store.resolveBody(processId, toVersion);
  if (!toBody) throw new MigrationPlanError(`target version ${toVersion} is not published`);

  // Re-parse: enforce the injectivity and presence-iff refinements at runtime even if
  // a caller assembled the spec object directly.
  const parsed = migrationSpec.parse(spec);
  validatePlan(parsed, fromBody, toBody);

  // Atomic freeze guard. A fresh insert returns its row; a conflict on an unapplied
  // key updates and returns; a conflict on an applied key fails the WHERE, updates
  // nothing, and returns zero rows.
  const rows = (await db`INSERT INTO migration_plans (process_id, from_version, to_version, spec)
    VALUES (${processId}, ${fromVersion}, ${toVersion}, ${parsed})
    ON CONFLICT (process_id, from_version, to_version)
      DO UPDATE SET spec = EXCLUDED.spec WHERE migration_plans.applied_at IS NULL
    RETURNING process_id`) as unknown[];
  if (rows.length === 0)
    throw new MigrationPlanError(`plan ${processId} ${fromVersion}->${toVersion} is already applied and frozen`);
}

/**
 * Read a registered plan. Returns the spec and whether it has been applied, or
 * undefined when no plan exists for the key.
 */
export async function resolveMigrationPlan(
  processId: ProcessId,
  fromVersion: number,
  toVersion: number,
  db: SQL = sql,
): Promise<{ spec: MigrationSpec; appliedAt: string | null } | undefined> {
  const rows = (await db`SELECT spec, applied_at FROM migration_plans
    WHERE process_id = ${processId} AND from_version = ${fromVersion} AND to_version = ${toVersion}
    LIMIT 1`) as { spec: unknown; applied_at: string | null }[];
  if (rows.length === 0) return undefined;
  const raw = rows[0];
  return {
    spec: migrationSpec.parse(typeof raw.spec === "string" ? JSON.parse(raw.spec) : raw.spec),
    appliedAt: raw.applied_at ? new Date(raw.applied_at).toISOString() : null,
  };
}

// ============================================================
// The operation: migrate a version's running instances.
// ============================================================

/** Instance ids grouped by outcome. Ids, not counts — an operator acts on them. */
export type MigrationResult = {
  migrated: string[];
  skipped: string[];
  conflicted: string[];
  failed: string[];
};

/** One instance's `data` keys absent from its pinned version's field catalog. */
export type OrphanKeyEntry = { instanceId: string; keys: string[] };

/** Result of `findOrphanKeys`: instances carrying orphan keys, and unreadable rows. */
export type OrphanKeyScan = { orphans: OrphanKeyEntry[]; unreadable: string[] };

/** Keyset page size. Ids only, so a large page is cheap. */
const BATCH = 100;

/**
 * Remap `data` onto the target version from a pre-migration snapshot, as one patch.
 * `fieldMap` renames are computed against the snapshot (never applied sequentially: a
 * swap read as mutation collapses, and a rename into an occupied field would depend on
 * key order), then `transforms` overlay. Unmapped keys are retained under their own
 * id, including ones the target catalog no longer declares — a retained orphan is safe
 * (guard-context re-keying skips ids the target does not declare) and dropping it would
 * destroy data.
 */
function remapData(
  spec: MigrationSpec,
  fromBody: ProcessBody,
  snapshot: Instance,
): { data: Instance["data"]; drops: TransformDrop[] } {
  const src = snapshot.data as Record<string, unknown>;
  const fieldMap = spec.fieldMap ?? {};
  const sources = new Set(Object.keys(fieldMap));
  const out: Record<string, unknown> = {};
  // Retain every key that is not a rename source (a source is vacated unless it is
  // also some mapping's target, handled next).
  for (const [k, v] of Object.entries(src)) if (!sources.has(k)) out[k] = v;
  // Images from the snapshot: B := snapshot[A]. A source with no value moves nothing.
  for (const [a, b] of Object.entries(fieldMap)) {
    if (b === undefined) continue;
    if (a in src) out[b] = src[a];
  }
  // transforms (also over the snapshot) overlay the renames; a raising or
  // out-of-range transform is omitted from the patch, leaving its target as the
  // rename/retain left it — the caller records each drop as a
  // migration.transform-dropped event.
  const { patch, drops } = evalTransforms(spec, fromBody, snapshot);
  Object.assign(out, patch);
  return { data: out as Instance["data"], drops };
}

/**
 * Rewrite a safe outbox row's Action.output target field ids through the plan's
 * fieldMap image: a target id present as a fieldMap key is replaced by its image;
 * every other id is retained by identity — including onto a field the target
 * catalog no longer declares (orphan write-through, matching remapData's own
 * retained-orphan policy). Computed once from the full map per key, not applied as
 * sequential renames, so an A<->B swap resolves correctly.
 */
function remapActionOutput(spec: MigrationSpec, action: Action): Action {
  if (!action.output) return action;
  const fieldMap = (spec.fieldMap ?? {}) as Record<string, string>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(action.output)) out[fieldMap[k] ?? k] = v;
  return { ...action, output: out as Action["output"] };
}

/**
 * Does a carried timer's recorded provenance still match what the target step
 * currently declares for that same id? `undefined` provenance (armed before
 * this field existed) is trusted as matching — reconciliation has no signal to
 * compare against, so it keeps today's id-only behavior for exactly that timer
 * until it is next armed. `armedAt` is excluded from the comparison: re-entering
 * an unchanged declaration at a different instant must still count as unchanged.
 */
function timerProvenanceMatches(carried: TimerProvenance | undefined, declared: Timer): boolean {
  if (!carried) return true;
  if (declared.duration !== undefined) return carried.kind === "duration" && carried.duration === declared.duration;
  return carried.kind === "deadline" && carried.src === declared.deadline!.src;
}

/**
 * Reconcile the instance's carried timers against the target step's declarations,
 * exhaustively (the fired-and-still-declared case is the one a three-way reading
 * omits, resurrecting a fired timer):
 *   carried + fired + still declared             -> kept as fired, regardless of provenance;
 *   carried + unfired + still declared + matching
 *     provenance (or none recorded)               -> kept with its persisted fireAt;
 *   carried + unfired + still declared + mismatched
 *     provenance                                   -> re-armed, as if newly declared;
 *   carried + no longer declared                  -> dropped;
 *   declared + not carried                        -> armed at the migration instant, against
 *                                                     the target body, post-remap data, new seq.
 * Newly-armed deadline drops are returned for the caller to record as `timer.unarmed`.
 */
function reconcileTimers(
  snapshot: Instance,
  targetStep: Step,
  toBody: ProcessBody,
  entering: Instance,
  at: string,
): { timers: TimerState[]; drops: TimerDrop[] } {
  const carried = snapshot.timers ?? [];
  const declaredById = new Map((targetStep.timers ?? []).map((t) => [t.id as string, t]));
  const kept: TimerState[] = [];
  const rearmIds = new Set<string>();
  for (const t of carried) {
    const declared = declaredById.get(t.timerId as string);
    if (!declared) continue; // no longer declared -> dropped
    if (t.fired || timerProvenanceMatches(t.provenance, declared)) kept.push(t);
    else rearmIds.add(t.timerId as string); // unfired, still declared, provenance mismatch -> re-arm
  }
  const carriedIds = new Set(carried.map((t) => t.timerId as string));
  // Arm every timer this instance doesn't already carry unchanged: genuinely
  // newly-declared ones, plus any surviving id whose declaration drifted (rearmIds)
  // — a clone of the step with just those, so armStepTimers leaves `kept` untouched.
  const toArm = (targetStep.timers ?? []).filter((t) => !carriedIds.has(t.id as string) || rearmIds.has(t.id as string));
  const { armed, drops } = armStepTimers({ ...targetStep, timers: toArm }, at, toBody, entering);
  return { timers: [...kept, ...armed], drops };
}

/** Append a `migration.skipped` event at the instance's unchanged sequence. */
async function appendSkip(
  tx: SQL,
  inst: Instance,
  fromVersion: number,
  toVersion: number,
  reason: MigrationSkipReason,
): Promise<void> {
  const ev: InstanceEvent = {
    id: newInstanceEventId(),
    instanceId: inst.instanceId,
    transitionSeq: inst.transitionSeq,
    version: fromVersion, // the instance did not move; ids resolve on the source version
    kind: "migration.skipped",
    payload: { fromVersion, toVersion, reason },
    at: new Date().toISOString(),
  };
  await appendInstanceEvent(tx, ev);
  log.warn("instance migration skipped", { instanceId: inst.instanceId, fromVersion, toVersion, reason });
}

/**
 * Migrate one instance in its own row-locked transaction. Returns which category it
 * fell into; throws ConcurrencyConflict when it loses an OCC race (caller records it
 * as conflicted), or any other error when the row cannot be read or its pin does not
 * match the source body (caller records it as failed, with no event).
 */
async function migrateOne(
  id: string,
  fromVersion: number,
  toVersion: number,
  spec: MigrationSpec,
  fromBody: ProcessBody,
  toBody: ProcessBody,
  db: SQL,
): Promise<"migrated" | "skipped" | "none"> {
  return withTransaction(db, async (tx) => {
    // Lock this instance's undelivered outbox rows FIRST, before the instance row —
    // matching drainOutbox's own lock order (outbox row, then instance row) within
    // its delivery transaction, so a concurrent migration and delivery cannot
    // deadlock. Locked unconditionally: even an instance that turns out to be raced
    // out of eligibility below has had nothing written from these rows, so locking
    // this early is harmless.
    const outboxRows = (await tx`SELECT idempotency_key, action, field_version, status, claimed_at
      FROM outbox WHERE instance_id = ${id} AND status <> 'delivered'
      ORDER BY idempotency_key FOR UPDATE`) as {
      idempotency_key: string;
      action: unknown;
      field_version: number | null;
      status: string;
      claimed_at: string | Date | null;
    }[];
    // Eligibility partition: a live-claimed row (an active lease) may be
    // mid-handler-execution right now, with the source version's field ids already
    // baked into its in-memory ClaimedRow snapshot — nothing done to the stored row
    // can retroactively fix that computation. A `pending` row, or a `claimed` row
    // whose lease has expired (abandoned/crashed worker; the next drain re-claims and
    // re-reads the row fresh from the DB), is safe to remap in place below.
    const now = Date.now();
    const liveClaimed = outboxRows.some(
      (r) => r.status === "claimed" && r.claimed_at !== null && now - new Date(r.claimed_at).getTime() < CLAIM_LEASE_MS,
    );

    // 5.4 lock the instance row and compute everything from THIS read — the OCC
    // token does not cover `data`, so a payload computed from the batch read would
    // erase a concurrent action writeback silently.
    const rows = (await tx`SELECT body FROM instances WHERE instance_id = ${id} FOR UPDATE`) as { body: unknown }[];
    if (rows.length === 0) throw new Error(`instance vanished under lock: ${id}`);
    const inst = instanceSchema.parse(typeof rows[0].body === "string" ? JSON.parse(rows[0].body) : rows[0].body);
    // Per-instance body consistency: the row must be pinned to the source body we
    // resolved. A mismatch is a corrupt/foreign row — failed, not migrated.
    if (definitionHash(fromBody) !== inst.definitionHash) throw new Error(`pin mismatch under lock: ${id}`);
    // Raced out of eligibility between the scan and the lock (a concurrent transition
    // completed it, or another invocation already migrated it). Not our work.
    if (inst.status !== "running" || inst.version !== fromVersion) return "none";

    // 5.6 in-flight actions: only a live-claimed row still blocks migration (narrower
    // than "any undelivered row blocks" — see the eligibility partition above).
    if (liveClaimed) {
      await appendSkip(tx, inst, fromVersion, toVersion, "pending-actions");
      return "skipped";
    }

    // 5.7 resolve the target step: stepMap image, else identity if the target declares
    // it, else the unmappable policy (absent = reject-and-pin).
    const srcStepId = inst.currentStepId as string;
    const mapped = (spec.stepMap as Record<string, string> | undefined)?.[srcStepId];
    let targetStepId: string;
    if (mapped !== undefined) targetStepId = mapped;
    else if (toBody.workflow.steps.some((s) => (s.id as string) === srcStepId)) targetStepId = srcStepId;
    else if (spec.onUnmappable === "route-to-step") targetStepId = spec.unmappableStep as string;
    else {
      await appendSkip(tx, inst, fromVersion, toVersion, "step-unmappable");
      return "skipped";
    }
    const targetStep = toBody.workflow.steps.find((s) => (s.id as string) === targetStepId)!;
    const stepChanged = targetStepId !== srcStepId;

    // 5.7b live-child gate: a relocation that vacates a subprocess-typed step must not
    // commit while that step has a live linked child. A live child's return is keyed to
    // this step and contract; the migration cannot re-point it soundly (relocating onto
    // another subprocess step misdirects the return to the wrong child; onto a
    // non-subprocess step dead-letters it), so the instance is deferred — kept on its
    // pin, recorded, migrated by a later invocation once the child settles. A settled
    // child (terminal, outbox drained) is inert: core.returnSubprocess no longer fires
    // for it and the cancel cascade keys on parent.instanceId + status, never stepId.
    if (stepChanged) {
      const srcStep = fromBody.workflow.steps.find((s) => (s.id as string) === srcStepId);
      if (srcStep?.subprocess) {
        const liveChild = (await tx`SELECT 1 FROM instances c
          WHERE c.body->'parent'->>'instanceId' = ${id}
            AND c.body->'parent'->>'stepId' = ${srcStepId}
            AND (c.body->>'status' = 'running'
                 OR EXISTS (SELECT 1 FROM outbox o
                            WHERE o.instance_id = c.instance_id AND o.status <> 'delivered'))
          LIMIT 1`) as unknown[];
        if (liveChild.length > 0) {
          await appendSkip(tx, inst, fromVersion, toVersion, "child-in-flight");
          return "skipped";
        }
      }
    }

    // Remap the safe outbox rows locked above, now that the instance is committed
    // to migrating (every skip branch above has already returned). field_version
    // must equal fromVersion under correct operation: this same transaction locks
    // and bumps every one of this instance's outbox rows atomically with the
    // instance's own version bump, so a row can never fall out of lock-step. A
    // mismatch is a "should never happen" canary, handled like the definitionHash
    // pin mismatch above — throw, land in `failed`, no event — not a case to design
    // graceful handling for.
    for (const row of outboxRows) {
      if (row.field_version !== fromVersion)
        throw new Error(`field_version mismatch under lock: outbox row ${row.idempotency_key} (instance ${id})`);
    }
    for (const row of outboxRows) {
      const action = typeof row.action === "string" ? (JSON.parse(row.action) as Action) : (row.action as Action);
      const remapped = remapActionOutput(spec, action);
      await tx`UPDATE outbox SET action = ${remapped}, field_version = ${toVersion}
        WHERE idempotency_key = ${row.idempotency_key}`;
    }

    // 5.8 remap data from the snapshot (the locked read).
    const { data, drops: transformDrops } = remapData(spec, fromBody, inst);

    // 5.9 reconcile timers against the target step; arm newcomers over post-remap data.
    const at = new Date().toISOString();
    const nextSeq = inst.transitionSeq + 1;
    const entering: Instance = { ...inst, currentStepId: targetStep.id, transitionSeq: nextSeq, data, timers: [] };
    const { timers, drops } = reconcileTimers(inst, targetStep, toBody, entering, at);
    // Newly-armed deadline drops -> timer.unarmed events at the committed seq and the
    // TARGET version (the dropped timer is declared there). Supplied via the seam's
    // events channel, since a supplied timer set makes planStepEntry produce no drops.
    const dropEvents: InstanceEvent[] = drops.map((d) => ({
      id: newInstanceEventId(),
      instanceId: inst.instanceId,
      transitionSeq: nextSeq,
      version: toVersion,
      kind: "timer.unarmed" as const,
      payload: { timerId: d.timerId, reason: d.reason },
      at,
    }));
    // Dropped transforms -> migration.transform-dropped events, same seq/version
    // rule as the timer drops above: the target field is declared on the TARGET
    // catalog, so the event carries toVersion.
    const transformDropEvents: InstanceEvent[] = transformDrops.map((d) => ({
      id: newInstanceEventId(),
      instanceId: inst.instanceId,
      transitionSeq: nextSeq,
      version: toVersion,
      kind: "migration.transform-dropped" as const,
      payload: { fieldId: d.fieldId, reason: d.reason },
      at,
    }));

    // 5.10/5.11 compose the shared seam. onExit never runs; onEntry only on a genuine
    // relocation; spawn suppressed on an identity step (else a parked parent gains a
    // second child). status, the subprocess spawn/return and the HistoryEntry are all
    // derived by the seam — never reimplemented here.
    const actions = stepChanged ? (targetStep.onEntry ?? []) : [];
    const plan = planStepEntry(
      inst,
      targetStep,
      toBody,
      {
        pathId: null,
        cause: "migration",
        actorId: undefined,
        actions,
        timers,
        entryVersion: toVersion,
        suppressSpawn: !stepChanged,
        // An in-flight claim survives a migration untouched — see StepEntryOpts.
        carryAssignment: true,
        events: [...dropEvents, ...transformDropEvents],
      },
    );
    // applyStepEntry itself flags resolve_state = 'pending' on every commit, so
    // migration's cascade deferral (rather than nesting commits) falls out of
    // that general rule and needs no separate flag here.
    await applyStepEntry(tx, plan, { version: toVersion, definitionHash: definitionHash(toBody), data });

    // No child-link repoint: a relocation off a subprocess step with a live child was
    // already deferred by the 5.7b gate, and a settled child's parent.stepId is inert
    // (nothing re-reads it), so re-pointing it would be a write with no reader.
    return "migrated";
  });
}

/**
 * Migrate every running instance on `fromVersion` onto `toVersion` under the
 * registered plan. Refuses when no plan exists. The plan is read and stamped applied
 * in one atomic statement, before any instance — not a read followed by a separate
 * write, which would leave a window for a concurrent registration to store a spec
 * between the two and freeze a row that disagrees with what was actually applied —
 * so one invocation uses one spec throughout, and that spec is guaranteed to be the
 * one left frozen on the row. Instances are selected by keyset pagination on
 * `instance_id` (a bare LIMIT over the running/source-version predicate would return
 * a batch of skipped/conflicted instances forever), and each is migrated in its own
 * transaction inside its own error boundary. Returns instance ids grouped by outcome.
 */
export async function migrateInstances(
  processId: ProcessId,
  fromVersion: number,
  toVersion: number,
  db: SQL = sql,
  resolvers: { resolveBody: ResolveBody } = createDefinitionStore(db),
): Promise<MigrationResult> {
  // Read-and-freeze as one statement — not on the first success, or an invocation
  // that skips everything leaves the plan editable while it runs. A concurrent
  // registerMigrationPlan racing this UPDATE resolves through ordinary row-level
  // locking: whichever commits first is what the other observes, so the spec
  // returned here is always the spec left permanently stored on the row.
  const rows = (await db`UPDATE migration_plans SET applied_at = COALESCE(applied_at, now())
    WHERE process_id = ${processId} AND from_version = ${fromVersion} AND to_version = ${toVersion}
    RETURNING spec`) as { spec: unknown }[];
  if (rows.length === 0)
    throw new MigrationPlanError(`no plan registered for ${processId} ${fromVersion}->${toVersion}`);
  const rawSpec = rows[0].spec;
  const spec = migrationSpec.parse(typeof rawSpec === "string" ? JSON.parse(rawSpec) : rawSpec);

  const fromBody = await resolvers.resolveBody(processId, fromVersion);
  const toBody = await resolvers.resolveBody(processId, toVersion);
  if (!fromBody) throw new MigrationPlanError(`source version ${fromVersion} is not published`);
  if (!toBody) throw new MigrationPlanError(`target version ${toVersion} is not published`);

  const result: MigrationResult = { migrated: [], skipped: [], conflicted: [], failed: [] };
  let last = "";
  for (;;) {
    const rows = (await db`SELECT instance_id FROM instances
      WHERE instance_id > ${last}
        AND body->>'processId' = ${processId}
        AND (body->>'version')::int = ${fromVersion}
        AND body->>'status' = 'running'
      ORDER BY instance_id LIMIT ${BATCH}`) as { instance_id: string }[];
    if (rows.length === 0) break;
    for (const { instance_id: id } of rows) {
      last = id; // keyset advances regardless of outcome — this is what terminates
      try {
        const outcome = await migrateOne(id, fromVersion, toVersion, spec, fromBody, toBody, db);
        if (outcome === "migrated") result.migrated.push(id);
        else if (outcome === "skipped") result.skipped.push(id);
        // "none": raced out of eligibility, in no category
      } catch (e) {
        if (e instanceof ConcurrencyConflict) result.conflicted.push(id);
        else result.failed.push(id); // unreadable row or pin mismatch — no event
      }
    }
  }
  return result;
}

// ============================================================
// Read-only tooling: find orphan `data` keys on a version's instances.
// ============================================================

/**
 * Scan every instance pinned to `{processId, version}` for `data` keys absent from
 * that version's field catalog (retained by migration; see `remapData`). Read-only —
 * no instance, plan, or definition is modified. Covers every instance status, not
 * only running: a terminal instance's `data` is a permanent record and can carry an
 * orphan same as a running one. Keyset-paginated like `migrateInstances`; a row whose
 * body fails to parse is reported in `unreadable` instead of aborting the scan.
 */
export async function findOrphanKeys(
  processId: ProcessId,
  version: number,
  db: SQL = sql,
  resolvers: { resolveBody: ResolveBody } = createDefinitionStore(db),
): Promise<OrphanKeyScan> {
  const body = await resolvers.resolveBody(processId, version);
  if (!body) throw new MigrationPlanError(`version ${version} is not published`);
  const validIds = fieldTypeById(body.fields);

  const orphans: OrphanKeyEntry[] = [];
  const unreadable: string[] = [];
  let last = "";
  for (;;) {
    const rows = (await db`SELECT instance_id, body FROM instances
      WHERE instance_id > ${last}
        AND body->>'processId' = ${processId}
        AND (body->>'version')::int = ${version}
      ORDER BY instance_id LIMIT ${BATCH}`) as { instance_id: string; body: unknown }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      last = row.instance_id; // keyset advances regardless of outcome
      try {
        const inst = instanceSchema.parse(typeof row.body === "string" ? JSON.parse(row.body) : row.body);
        const keys = Object.keys(inst.data as Record<string, unknown>).filter((k) => !validIds.has(k));
        if (keys.length > 0) orphans.push({ instanceId: row.instance_id, keys });
      } catch {
        unreadable.push(row.instance_id);
      }
    }
  }
  return { orphans, unreadable };
}

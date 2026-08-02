/**
 * Runtime CEL evaluation for the engine: project the instance onto the formal
 * context and evaluate a path guard. Uses the same @marcbachmann/cel-js as the
 * authoring check (src/cel/check.ts), so a guard that type-checks evaluates with
 * identical semantics.
 */

import { evaluate } from "@marcbachmann/cel-js";
import { INSTANCE_SCHEMA } from "./check.js";
import { collectFieldsDeep } from "../schema/definition.js";
import type {
  ProcessBody,
  Instance,
  FieldDef,
  FieldId,
  Expression,
  MigrationSpec,
  MigrationTransformDroppedReason,
} from "../schema/definition.js";

export interface Actor {
  id: string;
  roles: string[];
}

/**
 * System identity for engine-driven evaluation with no acting user (automatic
 * re-resolution after a writeback, timer-forced transitions). Automatic guards
 * should not read `actor`; a wait-state guard that does is a latent authoring
 * question. Homed here (with the Actor type) so the engine's transition and
 * resolution modules share one constant without a dependency cycle.
 */
export const SYSTEM_ACTOR: Actor = { id: "system", roles: [] };

// The only field whose CEL name differs from the runtime Instance field.
// Every other INSTANCE_SCHEMA key names an identical Instance property.
const RENAME: Record<string, keyof Instance> = { id: "instanceId" };

/**
 * Project a runtime Instance onto exactly the fields INSTANCE_SCHEMA declares.
 * The whitelist is INSTANCE_SCHEMA's keys — the same schema the authoring check
 * registers — so this cannot expose a field the author could not type-check, nor
 * omit one they could. `instanceId` is mapped to `id`; `int`-typed fields become
 * bigint, which is how cel-js models CEL `int`.
 */
export function projectInstance(instance: Instance): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const celKey of Object.keys(INSTANCE_SCHEMA) as (keyof typeof INSTANCE_SCHEMA)[]) {
    const val = instance[RENAME[celKey] ?? (celKey as keyof Instance)];
    out[celKey] = INSTANCE_SCHEMA[celKey] === "int" ? BigInt(val as number) : val;
  }
  return out;
}

/**
 * Flatten the catalog to fieldId -> key (data is keyed by id; CEL by key). A
 * `group` field is a container, not a leaf value, so it contributes no entry
 * itself. Built over `collectFieldsDeep`, the one authoritative field-tree
 * walk shared with `definition.ts` and `check.ts`.
 */
function fieldKeyById(fields: FieldDef[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of collectFieldsDeep(fields)) {
    if (typeof f.type === "string" && f.type === "group") continue;
    m.set(f.id, f.key);
  }
  return m;
}

/**
 * Build the frozen guard context: `data` (re-keyed from fieldId to key),
 * projected `instance`, and `actor`. `result` and `child` are deliberately
 * absent, so a guard referencing them is unresolvable — matching the authoring
 * scope where those namespaces are not registered for a guard.
 */
export function buildGuardContext(body: ProcessBody, instance: Instance, actor: Actor): Record<string, unknown> {
  const byId = fieldKeyById(body.fields);
  const data: Record<string, unknown> = {};
  for (const [fid, val] of Object.entries(instance.data)) {
    const key = byId.get(fid);
    if (key !== undefined) data[key] = val;
  }
  return { data, instance: projectInstance(instance), actor: { id: actor.id, roles: actor.roles } };
}

/**
 * Build the context a migration `transforms` expression is evaluated against:
 * `data` re-keyed fieldId→key against the **source** catalog (the version the
 * instance is leaving, where the transform's identifiers resolve) and the
 * projected `instance`. Nothing else — no `actor` (migration is uniform over the
 * population), no `child`, no data sources — matching the authoring scope
 * `validateMigrationSpec` checks against.
 */
export function buildTransformContext(fromBody: ProcessBody, snapshot: Instance): Record<string, unknown> {
  const byId = fieldKeyById(fromBody.fields);
  const data: Record<string, unknown> = {};
  for (const [fid, val] of Object.entries(snapshot.data)) {
    const key = byId.get(fid);
    if (key !== undefined) data[key] = val;
  }
  return { data, instance: projectInstance(snapshot) };
}

/** A total-per-entry map evaluation dropped its target field, and why. Shared shape for `evalTransforms` and `evalFieldMap`. */
export type MapEntryDrop = { fieldId: FieldId; reason: MigrationTransformDroppedReason };

/**
 * Evaluate a target-FieldId → CEL expression map over `ctx`, total per entry:
 * an expression that raises, or whose value cannot be made JSON-safe, leaves
 * its target unwritten rather than failing the whole map — matching guard
 * totality. Values pass through `coerceJson`, so a CEL `int` (bigint) becomes
 * a number; a bigint left in the payload would make the instance fail
 * `instance.parse` on its next read.
 *
 * The two total-failure points are distinguished in `drops`, mirroring
 * `armStepTimers`'s `{ armed, drops }`: an `evaluate()` throw is
 * `"expression-raised"`, a `coerceJson()` throw (a result too large to
 * represent as a JSON-safe number) is `"value-out-of-range"`.
 */
function evalMapTotal(
  entries: [string, Expression | undefined][],
  ctx: Record<string, unknown>,
): { patch: Record<string, unknown>; drops: MapEntryDrop[] } {
  const patch: Record<string, unknown> = {};
  const drops: MapEntryDrop[] = [];
  for (const [fid, expr] of entries) {
    if (!expr) continue;
    let value: unknown;
    try {
      value = evaluate(expr.src, ctx);
    } catch {
      drops.push({ fieldId: fid as FieldId, reason: "expression-raised" });
      continue;
    }
    try {
      patch[fid] = coerceJson(value);
    } catch {
      drops.push({ fieldId: fid as FieldId, reason: "value-out-of-range" });
    }
  }
  return { patch, drops };
}

/**
 * Evaluate a migration spec's `transforms` over a pre-migration snapshot, returning
 * a target-FieldId → JSON-safe value patch. The caller records each drop as a
 * `migration.transform-dropped` event.
 */
export function evalTransforms(
  spec: MigrationSpec,
  fromBody: ProcessBody,
  snapshot: Instance,
): { patch: Record<string, unknown>; drops: MapEntryDrop[] } {
  return evalMapTotal(Object.entries(spec.transforms ?? {}), buildTransformContext(fromBody, snapshot));
}

/**
 * Evaluate a path guard to a boolean. A guardless path is always taken. Guards
 * are total (per the CEL contract): a runtime error — most commonly a field not
 * yet written into `data` — is not a match, so the path is not taken. This is the
 * wait-state idiom: `data.booking_status == 'booked'` is false while unset and
 * becomes true only once the writeback lands.
 */
export function evalGuard(guard: Expression | undefined, ctx: Record<string, unknown>): boolean {
  if (!guard) return true;
  try {
    return evaluate(guard.src, ctx) === true;
  } catch {
    return false;
  }
}

/**
 * Build the Action.output context: `result` only. data/instance/actor/child are
 * absent, so an output expression referencing them is unresolvable — matching the
 * authoring scope, where `check.ts::buildEnv` registers `result` alone at an
 * output site and publish rejects anything else. The two must stay in step: an
 * output expression is evaluated post-commit, so a namespace admitted here but
 * not there (or the reverse) is an expression that type-checks and then throws on
 * every delivery, re-invoking the external handler on each retry.
 */
export function buildOutputContext(result: unknown): Record<string, unknown> {
  return { result };
}

/**
 * cel-js models CEL `int` as bigint; coerce to a safe-integer number before a
 * value lands in JSON-typed `data` (the runtime twin of the authoring
 * number->double papercut). Recurses so nested list/map results are covered.
 */
function coerceJson(v: unknown): unknown {
  if (typeof v === "bigint") {
    if (v < BigInt(Number.MIN_SAFE_INTEGER) || v > BigInt(Number.MAX_SAFE_INTEGER))
      throw new RangeError(`output value out of safe-integer range: ${v}`);
    return Number(v);
  }
  if (Array.isArray(v)) return v.map(coerceJson);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k] = coerceJson(val);
    return o;
  }
  return v;
}

/**
 * Evaluate an Action.output map (target FieldId -> CEL over `result`) against a
 * handler's `result`, returning a fieldId -> JSON value patch. Values are
 * coerced JSON-safe (bigint -> number).
 *
 * Deliberately does NOT adopt `evalFieldMap`'s total/drop semantics: a drop
 * here re-throws, preserving the pre-existing fail-fast behavior (the outbox
 * treats the throw as an ordinary delivery failure — retry, eventually
 * dead-letter). Two reasons. First, the case totality exists for does not
 * apply here: a subprocess mapping legitimately reads a PARENT field the
 * instance may never have written (an optional field is normal), but an
 * Action.output expression reads only `result` — the handler's own return
 * value — so a raise means the handler's actual return shape does not match
 * what the action declared, a bug worth surfacing loudly. Second, the outbox
 * writeback this feeds already has its own drop mechanism for the adjacent
 * failure — a value that evaluates fine but does not fit its target field's
 * declared type (the type check in outbox.ts, recorded in the
 * `ActionOutcome`) — and growing a second, silent one here for "the
 * expression didn't evaluate at all" would just obscure which one fired.
 */
export function evalOutput(
  outputMap: Partial<Record<string, Expression>> | undefined,
  result: unknown,
): Record<string, unknown> {
  const { patch, drops } = evalFieldMap(outputMap, buildOutputContext(result));
  if (drops.length > 0) {
    const first = drops[0]!;
    throw new Error(`Action.output entry for field ${first.fieldId} could not be evaluated (${first.reason})`);
  }
  return patch;
}

/**
 * Evaluate a target-FieldId -> CEL map against a supplied context, returning a
 * fieldId -> JSON-safe value patch (bigint -> number) plus any per-entry
 * drops. The caller builds the context, so this serves both the subprocess
 * `inputMapping` (evaluated over the parent's data/instance/actor, targets
 * keyed by child fieldId) and `outputMapping` (evaluated over the parent
 * context plus the `child` namespace, targets keyed by parent fieldId), as
 * well as `evalOutput` above.
 *
 * Total per entry, matching `evalTransforms`: an entry whose expression
 * raises — most often a subprocess mapping reading a parent field the
 * instance never wrote, the same shape a guard already tolerates — or whose
 * value cannot be made JSON-safe leaves its target unwritten rather than
 * failing the whole map. Nothing at publish can distinguish a field that is
 * *declared* from one that is *always written* (the catalog has no such
 * notion; requiredness lives per-step in the view), so fatality here would
 * punish a legitimate authoring shape. The subprocess caller records each
 * drop as a `mapping.entry-dropped` event.
 */
export function evalFieldMap(
  map: Partial<Record<string, Expression>> | undefined,
  ctx: Record<string, unknown>,
): { patch: Record<string, unknown>; drops: MapEntryDrop[] } {
  return evalMapTotal(Object.entries(map ?? {}), ctx);
}

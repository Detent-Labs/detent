/**
 * View resolution and submission validation for the Runtime API Layer:
 * resolves a step's view into `ResolvedView*` entries and available manual
 * paths, and validates submitted data against the field catalog before it
 * is written back.
 */

import type { SQL } from "bun";
import { newInstanceEventId } from "../engine/store.js";
import { buildGuardContext, evalGuard, evalFieldMap, type Actor } from "../cel/eval.js";
import { displayNamesForUserIds } from "../auth/users.js";
import { getGroupMembers, groupNamesForIds } from "../auth/groups.js";
import { collectFieldsDeep, leafFields, typeMatches, expectedTypeLabel, isViewField } from "../schema/definition.js";
import type { DataSourceRegistry, DataSourceContext } from "../engine/registry.js";
import type {
  PathId,
  FieldId,
  Literal,
  Instance,
  ProcessBody,
  Step,
  LocalizedText,
  FieldDef,
  FieldOption,
  FieldValidation,
  Expression,
  ViewField,
  DataSourceDef,
  InstanceEvent,
} from "../schema/definition.js";

export type ResolvedViewField = {
  field: FieldDef;
  value: Literal | undefined;
  required: boolean;
  readonly: boolean;
  group?: string;
  // The matching `ViewField.tab`, or `undefined` when it declares none —
  // mirrors how `group` already resolves. Layout only: it reaches no guard
  // and no submission check, so the editable and required field sets below
  // ignore it entirely.
  tab?: string;
  options?: FieldOption[];
  // How many of the view's columns this field occupies, resolved from the
  // matching `ViewField.span` and 1 when the view declares none. Presentation
  // only: it reaches no guard and no submission check. The renderer clamps it
  // to the grid it sits in, so this is the declared span, not the drawn one.
  span: 1 | 2;
};

/** A resolved note: static text at its place in the view, carrying no value,
 * no requiredness and no readonly state. `kind: "note"` is what a caller
 * discriminates on, mirroring the authored rule `definition-contract` states
 * — a resolved entry carrying no `kind` is a field entry. */
export type ResolvedViewNote = {
  kind: "note";
  text: LocalizedText;
  group?: string;
  // See `ResolvedViewField.tab`.
  tab?: string;
  span: 1 | 2;
};

/** A resolved view entry: a field entry or a note. Field-first order in the
 * union mirrors `ResolvedViewField`'s pre-existing precedence at every call
 * site that narrows this union with `isResolvedViewField`. */
export type ResolvedViewEntry = ResolvedViewField | ResolvedViewNote;

/** True for a resolved field entry, the discriminant every reader narrows
 * on: a resolved entry carries `kind: "note"` for a note and no `kind` key
 * at all for a field. */
export function isResolvedViewField(entry: ResolvedViewEntry): entry is ResolvedViewField {
  return !("kind" in entry);
}

/** One member of a resolved view's tab strip: the authored `key` and its
 * UNRESOLVED `LocalizedText` label — the caller resolves it for its own
 * locale, the same way a note's `text` travels today. */
export type ResolvedViewTab = { key: string; label: LocalizedText };

export type AvailablePath = { id: PathId; key: string; label?: string };

export type SubmissionIssue =
  | { kind: "unknown-field"; fieldId: FieldId }
  | { kind: "readonly-field"; fieldId: FieldId }
  | { kind: "type-mismatch"; fieldId: FieldId; expected: string }
  | { kind: "invalid-option"; fieldId: FieldId }
  | { kind: "constraint"; fieldId: FieldId; constraint: "min" | "max" | "minLength" | "maxLength" | "pattern" }
  | { kind: "rule-failed"; fieldId: FieldId }
  | { kind: "required-missing"; fieldId: FieldId };

export class SubmissionValidationError extends Error {
  constructor(readonly issues: SubmissionIssue[]) {
    super(issues.map((i) => `${i.fieldId}: ${i.kind}`).join("; "));
    this.name = "SubmissionValidationError";
  }
}

function isGroupField(f: FieldDef): boolean {
  return typeof f.type === "string" && f.type === "group";
}

/**
 * Resolve a plain `boolean | Expression | undefined` view flag. `evalGuard`
 * only accepts `Expression | undefined`, not a raw boolean, so the union
 * needs this small dispatch.
 */
function resolveFlag(v: boolean | { lang: "cel"; src: string } | undefined, ctx: Record<string, unknown>, defaultWhenAbsent: boolean): boolean {
  if (v === undefined) return defaultWhenAbsent;
  if (typeof v === "boolean") return v;
  return evalGuard(v, ctx);
}

/**
 * The values the instance holds for a field, as `DataSourceContext.heldValues`:
 * none when unset, one for a `select`, the whole array for a `multiselect`.
 * A handler that retires values returns a held one anyway, so the participant
 * keeps seeing its label and membership validation keeps accepting it.
 */
function heldValuesOf(value: Literal | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

/**
 * Resolve a `dataSource`-bound field's options via the registry. Held values
 * are sorted before reaching the handler, so a `list` field's array order
 * never leaks into what the handler sees. A missing handler here means the
 * registry passed at runtime differs from the one the body was published
 * against — publish-time `data-source-registry-validation` already confirmed
 * every declared type resolves — so it is a "should never happen" canary,
 * matching the project's existing style (e.g. the `definitionHash` pin
 * mismatch).
 */
function resolveDataSourceOptions(
  def: DataSourceDef,
  heldValues: string[],
  instance: DataSourceContext["instance"],
  registry: DataSourceRegistry,
  db: SQL,
): Promise<FieldOption[]> {
  const handler = registry.get(def.type);
  if (!handler) throw new Error(`data source type '${def.type}' is not registered in the runtime registry`);
  return handler.resolve({ config: def.config, heldValues: [...heldValues].sort(), instance, db });
}

/**
 * Resolve a bare person field's candidate list — the first of D23's two
 * layers, for a field declaring neither `options` nor `dataSource`. Three
 * layers, emitted in this order because `FieldOption[]` is what the renderer
 * draws in array order:
 *
 * 1. One entry per `allowedGroups` id, in the body's declared order, labelled
 *    with the group's own name. Without it no `group_` value could ever be
 *    submitted, since the membership bound reads exactly this list.
 * 2. One entry per member account, walking the groups in that same order with
 *    the first occurrence winning the dedup.
 * 3. One entry per held value the two layers above did not already produce, so
 *    a member leaving the group does not strand the value the instance holds.
 *
 * Groups lead because a group is the coarser routing choice and there are few
 * of them. The held-value tail is last because it is a survival entry, not an
 * offer.
 *
 * It fails closed: no declared group and no held value resolves to `[]`, never
 * to every account in the system (D15). An id no store row matches keeps the
 * id itself as its label, so a stale entry stays visible rather than silently
 * narrowing the list. Every label is keyed by the body's own `baseLocale`,
 * which `resolveFieldsLocale` falls back to for a viewer in any locale —
 * neither an account nor a group carries a per-locale name to key any other
 * way.
 */
async function resolvePersonOptions(allowedGroups: string[], heldValues: string[], baseLocale: string, db: SQL): Promise<FieldOption[]> {
  const memberIds: string[] = [];
  for (const groupId of allowedGroups) {
    for (const userId of await getGroupMembers(groupId, db)) {
      if (!memberIds.includes(userId)) memberIds.push(userId);
    }
  }
  const held = heldValues.filter((v) => !allowedGroups.includes(v) && !memberIds.includes(v));

  const groupNames = await groupNamesForIds([...allowedGroups, ...held.filter((v) => v.startsWith("group_"))], db);
  const userNames = await displayNamesForUserIds([...memberIds, ...held.filter((v) => !v.startsWith("group_"))], db);
  const label = (id: string): LocalizedText =>
    ({ [baseLocale]: groupNames.get(id) ?? userNames.get(id) ?? id }) as LocalizedText;

  return [...allowedGroups, ...memberIds, ...held].map((id) => ({ value: id, label: label(id) })) as FieldOption[];
}

/**
 * Resolve a step's ViewFields against the field catalog and current data.
 * Invisible fields are omitted. A group-container FieldDef (never a leaf
 * value in `instance.data`) is still included when visible, so a UI can
 * render its label/grouping, but its `value` is always `undefined` and its
 * `required`/`readonly` are always reported `false` regardless of the view's
 * own declaration — it is never part of the required or editable sets.
 *
 * A `FieldDef.technical: true` field resolves `required: false, readonly:
 * true` the same way, whatever its view entry says (the compile pass already
 * forbids one from declaring either key). Where a body declares both
 * `type: "group"` and `technical: true` on one field — a shape the compile
 * pass also rejects, but `resolveFields` also runs against an uncompiled
 * body — the group rule wins: both flags resolve `false`.
 *
 * `options` is populated from static `FieldDef.options` unchanged, from the
 * body's own `allowedGroups` for a person field declaring neither key, or —
 * for a `dataSource`-bound field — resolved at runtime via `registry`. This
 * is the single place downstream code (submission validation, view
 * rendering) reads options from, instead of reading `FieldDef.options`
 * directly.
 *
 * `committedData` is the instance's COMMITTED data, which the two resolving
 * branches read their held values from. It defaults to `instance.data` and
 * differs from it in exactly one caller: `createProcessInstance` passes `{}`,
 * since its stub's `data` is the seed payload itself. A held value is one the
 * instance already holds, so that a member leaving a group does not strand it
 * — never one the same call is seeding, which would let a value validate
 * itself against options it alone put there.
 */
export async function resolveFields(
  body: ProcessBody,
  step: Step,
  instance: Instance,
  actor: Actor,
  registry: DataSourceRegistry,
  db: SQL,
  committedData: Record<string, Literal> = instance.data as Record<string, Literal>,
): Promise<ResolvedViewEntry[]> {
  const ctx = buildGuardContext(body, instance, actor);
  const fieldsById = new Map(collectFieldsDeep(body.fields).map((f) => [f.id as string, f]));
  const dataSourcesById = new Map((body.dataSources ?? []).map((d) => [d.id as string, d]));
  // Committed data, not a merged submission payload: a handler comparing
  // against the reader's own values must read the value a field held at step
  // entry, not one the caller is submitting right now. See design.md
  // "instance.data is the instance's committed data".
  const dsInstance: DataSourceContext["instance"] = {
    id: instance.instanceId,
    processId: instance.processId,
    data: instance.data,
    baseLocale: body.baseLocale,
  };
  const out: ResolvedViewEntry[] = [];
  for (const vf of step.view?.fields ?? []) {
    if (!isViewField(vf)) {
      if (!resolveFlag(vf.visible, ctx, true)) continue;
      out.push({ kind: "note", text: vf.text, group: vf.group, tab: vf.tab, span: vf.span ?? 1 });
      continue;
    }
    const field = fieldsById.get(vf.ref as string);
    if (!field) continue; // publish-time invariant guarantees resolution; defensive only
    if (!resolveFlag(vf.visible, ctx, true)) continue;
    const group = isGroupField(field);
    const technical = !group && field.technical === true;
    const required = group || technical ? false : resolveFlag(vf.required, ctx, false);
    const readonly = group ? false : technical ? true : resolveFlag(vf.readonly, ctx, false);
    const value = group ? undefined : (instance.data[field.id] as Literal | undefined);
    // A HELD value is one the instance already committed, never one the caller
    // is seeding in this same call. `committedData` is what separates the two:
    // at creation it is empty, because nothing is committed yet.
    const held = group ? [] : heldValuesOf(committedData[field.id as string]);
    let options: FieldOption[] | undefined = field.options;
    if (field.dataSource) {
      const def = dataSourcesById.get(field.dataSource as string);
      if (!def) throw new Error(`data source not found: ${field.dataSource}`); // publish-time invariant guarantees resolution; defensive only
      options = await resolveDataSourceOptions(def, held, dsInstance, registry, db);
    } else if (field.format === "person" && field.options === undefined) {
      // The gate reads `=== undefined`, not emptiness: `options: []` is a
      // legal declaration, and overwriting it would contradict "declaring
      // neither options nor dataSource".
      options = await resolvePersonOptions(body.allowedGroups ?? [], held, body.baseLocale, db);
    }
    out.push({ field, value, required, readonly, group: vf.group, tab: vf.tab, options, span: vf.span ?? 1 });
  }
  return out;
}

/** Visible-and-editable field ids (`visible && !readonly`), excluding group-container refs. */
function editableFieldIds(resolved: ResolvedViewEntry[]): Set<string> {
  return new Set(
    resolved.filter(isResolvedViewField).filter((r) => !isGroupField(r.field) && !r.readonly).map((r) => r.field.id as string),
  );
}

/** Visible-and-required field ids, excluding group-container refs. */
function requiredFieldIds(resolved: ResolvedViewEntry[]): Set<string> {
  return new Set(
    resolved.filter(isResolvedViewField).filter((r) => !isGroupField(r.field) && r.required).map((r) => r.field.id as string),
  );
}

/** Manual paths on `step` whose guard currently holds (guardless always qualifies). */
export function resolveAvailablePaths(body: ProcessBody, step: Step, instance: Instance, actor: Actor): AvailablePath[] {
  const ctx = buildGuardContext(body, instance, actor);
  return (step.paths ?? [])
    .filter((p) => p.trigger === "manual" && evalGuard(p.guard, ctx))
    .map((p) => ({ id: p.id, key: p.key, label: p.label }));
}

// ============================================================
// Submission validation
// ============================================================

/** One mapped attribute the engine refused to write, and why. */
export interface DroppedAttribute {
  fieldId: FieldId;
  column: string;
  targetFieldId: FieldId;
  reason: "type-mismatch";
}

/**
 * Apply every written field's `columnMapping` over the options already
 * resolved for submission validation.
 *
 * Walks `resolved`, which carries the step's VIEW order, not the request's own
 * key order: the client controls the latter, and two pickers writing in a
 * client-decided order is not a behavior anyone can reason about.
 *
 * A mapped target takes the mapped value even when the request also carries
 * one for it, and even when the view marks it readonly or never shows it. The
 * list owns a mapped field. The view bounds what a participant may change, not
 * what the engine may write.
 *
 * A mismatching attribute is dropped rather than failing the submission. The
 * mismatch comes from operator data, and the participant can do nothing about
 * it — the same rule `Action.output` already takes in the outbox.
 */
export function applyColumnMapping(
  resolved: ResolvedViewEntry[],
  submitted: Record<string, Literal>,
  fieldsById: Map<string, FieldDef>,
): { writes: Record<string, Literal>; dropped: DroppedAttribute[] } {
  const writes: Record<string, Literal> = {};
  const dropped: DroppedAttribute[] = [];
  for (const rf of resolved.filter(isResolvedViewField)) {
    const mapping = rf.field.columnMapping;
    if (!mapping) continue;
    const picked = submitted[rf.field.id as string];
    if (picked === undefined) continue; // the request did not write this field
    const option = rf.options?.find((o) => o.value === picked);
    if (!option?.attributes) continue; // no such option, or a row with nothing to carry
    for (const [column, targetId] of Object.entries(mapping)) {
      const attribute = option.attributes[column];
      if (attribute === undefined) continue; // an unfilled or undeclared column writes nothing
      const target = fieldsById.get(targetId as string);
      if (!target) continue; // publish-time invariant guarantees resolution; defensive only
      if (!typeMatches(target, attribute)) {
        dropped.push({ fieldId: rf.field.id, column, targetFieldId: targetId, reason: "type-mismatch" });
        continue;
      }
      writes[targetId as string] = attribute;
    }
  }
  return { writes, dropped };
}

/** The `datasource.attribute-dropped` records for one write-back's drops. */
export function droppedAttributeEvents(
  dropped: DroppedAttribute[],
  instanceId: Instance["instanceId"],
  version: number,
  transitionSeq: number,
): InstanceEvent[] {
  const at = new Date().toISOString();
  return dropped.map((d) => ({
    id: newInstanceEventId(),
    instanceId,
    transitionSeq,
    version,
    kind: "datasource.attribute-dropped" as const,
    payload: { fieldId: d.fieldId, column: d.column, targetFieldId: d.targetFieldId, reason: d.reason },
    at,
  }));
}

const asExpression = (v: Literal | Expression | undefined): Expression | undefined =>
  v !== undefined && v !== null && typeof v === "object" && !Array.isArray(v) && (v as { lang?: unknown }).lang === "cel"
    ? (v as Expression)
    : undefined;

/**
 * Seed `stub.data`'s open slots from the field catalog's own `default`
 * values, walking `leafFields(body.fields)` in catalog order. Mutates
 * `stub.data` in place, so a later field's `Expression` default sees an
 * earlier field's already-resolved value through the same guard context
 * every other guard evaluation builds (`buildGuardContext`). A `group`
 * field's own `default` is never read: `leafFields` already excludes it.
 *
 * Returns the set of field ids this filled, distinct from ids the caller's
 * own `opts.data` supplied directly — `validateSubmissionData` judges each
 * set by a different rule (design.md Decision 3).
 */
export function applyFieldDefaults(body: ProcessBody, stub: Instance, actor: Actor): Set<string> {
  const working = stub.data as Record<string, Literal>;
  const filled = new Set<string>();
  for (const field of leafFields(body.fields)) {
    if (field.default === undefined) continue;
    const fieldId = field.id as string;
    if (working[fieldId] !== undefined) continue;
    const expr = asExpression(field.default);
    if (!expr) {
      working[fieldId] = field.default as Literal;
      filled.add(fieldId);
      continue;
    }
    const ctx = buildGuardContext(body, stub, actor);
    const { patch } = evalFieldMap({ [fieldId]: expr }, ctx);
    if (fieldId in patch) {
      working[fieldId] = patch[fieldId] as Literal;
      filled.add(fieldId);
    }
  }
  return filled;
}

function optionValuesValid(options: FieldOption[] | undefined, value: Literal): boolean {
  if (!options || options.length === 0) return true;
  const allowed = new Set(options.map((o) => o.value));
  if (Array.isArray(value)) return value.every((v) => typeof v === "string" && allowed.has(v));
  return typeof value === "string" && allowed.has(value);
}

// Compiled pattern cache, keyed by the immutable published body a pattern was
// declared in, then by the pattern source itself. A published body never
// changes, which is what makes it a sound cache key — the same property
// definitionHash relies on. A pattern reaching this cache is known to compile:
// the publish-time compile pass rejects one that does not
// (src/schema/compile.ts::checkPatterns), so construction failure here is no
// longer an expected condition.
const patternCache = new WeakMap<ProcessBody, Map<string, RegExp>>();

function compiledPattern(body: ProcessBody, pattern: string): RegExp {
  let forBody = patternCache.get(body);
  if (!forBody) {
    forBody = new Map();
    patternCache.set(body, forBody);
  }
  let re = forBody.get(pattern);
  if (!re) {
    re = new RegExp(pattern);
    forBody.set(pattern, re);
  }
  return re;
}

/**
 * The validation in force for `field` in the step whose view field is `vf`.
 * Absent `vf` or an absent `vf.validation` means the catalog's own value
 * applies unchanged. A present `vf.validation` overlays the catalog's keys
 * under `vf.validationMode === "merge"` (the default), or replaces it whole
 * under `"replace"`. This is deliberately NOT reported on `ResolvedViewField`:
 * that type reaches `GET /instances/:id` unchanged via `getInstanceView`, and
 * a bound belongs to the submission check, not the wire.
 */
function effectiveValidation(field: FieldDef, vf: ViewField | undefined): FieldValidation | undefined {
  if (!vf?.validation) return field.validation;
  if (vf.validationMode === "replace") return vf.validation;
  return { ...field.validation, ...vf.validation };
}

/**
 * `pattern` is evaluated only when this value's length constraints raised no
 * violation: a value already rejected on length is going to be rejected
 * regardless, so running a pattern — which may backtrack catastrophically and
 * which JavaScript cannot time out — against an over-long, submitter-supplied
 * string is unnecessary work with an unbounded worst case.
 */
function checkConstraints(
  body: ProcessBody,
  validation: FieldDef["validation"],
  value: Literal,
): ("min" | "max" | "minLength" | "maxLength" | "pattern")[] {
  const violations: ("min" | "max" | "minLength" | "maxLength" | "pattern")[] = [];
  if (!validation) return violations;
  if (typeof value === "number") {
    if (validation.min !== undefined && value < validation.min) violations.push("min");
    if (validation.max !== undefined && value > validation.max) violations.push("max");
  }
  let lengthOk = true;
  if (typeof value === "string" || Array.isArray(value)) {
    const len = value.length;
    if (validation.minLength !== undefined && len < validation.minLength) { violations.push("minLength"); lengthOk = false; }
    if (validation.maxLength !== undefined && len > validation.maxLength) { violations.push("maxLength"); lengthOk = false; }
  }
  if (typeof value === "string" && validation.pattern !== undefined && lengthOk) {
    if (!compiledPattern(body, validation.pattern).test(value)) violations.push("pattern");
  }
  return violations;
}

/**
 * Validate `data` against `step`'s resolved view, over `instance`'s
 * pre-submission committed data. Collects every located issue rather than
 * failing on the first; throws `SubmissionValidationError` if any exist.
 * Used identically by `submitAndTransition` and `createProcessInstance`'s
 * `opts.data` seed (against the initial step, with `instance` a stub with
 * empty `data`) — with `checkRequired: false`: requiredness is a
 * transition-time gate enforced whenever a step is actually *left* via a
 * manual path (exactly what `submitAndTransition` checks on every call,
 * regardless of which path is taken), not an existence-time gate on being
 * created on or resting at a step. Enforcing it at creation would block the
 * ordinary "create an empty instance, then fill in the first step's form via
 * `submitAndTransition`" flow — the same flow the expense-approval example's
 * "capture" step relies on, since it is also the initial step.
 */
export async function validateSubmissionData(
  body: ProcessBody,
  step: Step,
  instance: Instance,
  actor: Actor,
  data: Record<string, Literal>,
  registry: DataSourceRegistry,
  db: SQL,
  opts: { checkRequired: boolean; defaultedIds?: Set<string>; committedData?: Record<string, Literal> } = { checkRequired: true },
): Promise<ResolvedViewEntry[]> {
  const defaultedIds = opts.defaultedIds ?? new Set<string>();
  const resolved = await resolveFields(body, step, instance, actor, registry, db, opts.committedData);
  const fieldsById = new Map(resolved.filter(isResolvedViewField).map((r) => [r.field.id as string, r]));
  const catalogById = new Map(leafFields(body.fields).map((f) => [f.id as string, f]));
  const viewFieldsByRef = new Map((step.view?.fields ?? []).filter(isViewField).map((vf) => [vf.ref as string, vf]));
  const editable = editableFieldIds(resolved);
  const required = requiredFieldIds(resolved);

  const issues: SubmissionIssue[] = [];
  const mergedData: Record<string, Literal> = { ...instance.data, ...data };
  const guardCtx = buildGuardContext(body, { ...instance, data: mergedData }, actor);

  for (const fieldId of Object.keys(data)) {
    const rf = fieldsById.get(fieldId);
    const value = data[fieldId] as Literal;

    // Off-view default (design.md Decision 3): no ResolvedViewField exists to
    // check against, so validate directly against the catalog entry's own
    // declared type/options/validation instead of the unknown-field rejection
    // an explicitly submitted value for the same field id still draws.
    if (defaultedIds.has(fieldId) && !rf) {
      const field = catalogById.get(fieldId);
      if (!field) {
        issues.push({ kind: "unknown-field", fieldId: fieldId as FieldId });
        continue;
      }
      if (!typeMatches(field, value)) {
        issues.push({ kind: "type-mismatch", fieldId: fieldId as FieldId, expected: expectedTypeLabel(field) });
        continue;
      }
      if (!field.dataSource && !optionValuesValid(field.options, value)) {
        issues.push({ kind: "invalid-option", fieldId: fieldId as FieldId });
      }
      for (const constraint of checkConstraints(body, field.validation, value)) {
        issues.push({ kind: "constraint", fieldId: fieldId as FieldId, constraint });
      }
      if (field.validation?.rule && !evalGuard(field.validation.rule, guardCtx)) {
        issues.push({ kind: "rule-failed", fieldId: fieldId as FieldId });
      }
      continue;
    }

    // On-view, readonly default (including `technical: true`): skip only the
    // readonly-field rejection. An explicitly submitted value for the same
    // field id still draws it — `defaultedIds` never contains a field id
    // `opts.data` supplied directly.
    const readonlyExempt = defaultedIds.has(fieldId) && !!rf && !isGroupField(rf.field) && rf.readonly;
    if (!rf || isGroupField(rf.field) || (!editable.has(fieldId) && !readonlyExempt)) {
      if (rf && !isGroupField(rf.field) && rf.readonly && !readonlyExempt) {
        issues.push({ kind: "readonly-field", fieldId: fieldId as FieldId });
      } else {
        issues.push({ kind: "unknown-field", fieldId: fieldId as FieldId });
      }
      continue;
    }
    if (!typeMatches(rf.field, value)) {
      issues.push({ kind: "type-mismatch", fieldId: fieldId as FieldId, expected: expectedTypeLabel(rf.field) });
      continue; // skip further checks on a value of the wrong shape
    }
    if (!optionValuesValid(rf.options, value)) {
      issues.push({ kind: "invalid-option", fieldId: fieldId as FieldId });
    }
    const validation = effectiveValidation(rf.field, viewFieldsByRef.get(fieldId));
    for (const constraint of checkConstraints(body, validation, value)) {
      issues.push({ kind: "constraint", fieldId: fieldId as FieldId, constraint });
    }
    const rule = validation?.rule;
    if (rule && !evalGuard(rule, guardCtx)) {
      issues.push({ kind: "rule-failed", fieldId: fieldId as FieldId });
    }
  }

  if (opts.checkRequired) {
    for (const fieldId of required) {
      if (mergedData[fieldId] === undefined) {
        issues.push({ kind: "required-missing", fieldId: fieldId as FieldId });
      }
    }
  }

  if (issues.length > 0) throw new SubmissionValidationError(issues);
  // Returned so the caller's column-mapping write-back reads the options this
  // call already resolved, instead of resolving the step a second time.
  return resolved;
}


/**
 * Workflow / BPM Process Definition Model (Zod source of truth).
 *
 * The Zod schemas below are the contract; the TypeScript types are derived via
 * z.infer, so there is no drift between validation and types. JSON is the one
 * serialized artifact. Two schemas are recursive (Literal, FieldDef) and so
 * carry a hand-written type annotation, which is the only place a type is not
 * inferred.
 *
 * Paradigm: state-based FSM, exactly one active step per instance. No
 * parallelism in v1. The definitionHash is the JCS hash of ProcessBody only.
 */

import { z } from "zod";

// ============================================================
// Identity: opaque, type-prefixed, lowercase. Sole reference anchor.
// .brand keeps the ids nominally distinct (a StepId is not a PathId).
// ============================================================

export const processId = z.string().regex(/^proc_/).brand<"ProcessId">();
export const stepId = z.string().regex(/^step_/).brand<"StepId">();
export const pathId = z.string().regex(/^path_/).brand<"PathId">();
export const fieldId = z.string().regex(/^field_/).brand<"FieldId">();
export const actionId = z.string().regex(/^action_/).brand<"ActionId">();
export const timerId = z.string().regex(/^timer_/).brand<"TimerId">();
export const dataSourceId = z.string().regex(/^ds_/).brand<"DataSourceId">();
export const instanceId = z.string().regex(/^inst_/).brand<"InstanceId">();
export const historyEntryId = z.string().regex(/^hist_/).brand<"HistoryEntryId">();
export const instanceEventId = z.string().regex(/^evt_/).brand<"InstanceEventId">();

export type ProcessId = z.infer<typeof processId>;
export type StepId = z.infer<typeof stepId>;
export type PathId = z.infer<typeof pathId>;
export type FieldId = z.infer<typeof fieldId>;
export type ActionId = z.infer<typeof actionId>;
export type TimerId = z.infer<typeof timerId>;
export type DataSourceId = z.infer<typeof dataSourceId>;
export type InstanceId = z.infer<typeof instanceId>;
export type HistoryEntryId = z.infer<typeof historyEntryId>;
export type InstanceEventId = z.infer<typeof instanceEventId>;

/** Human-readable slug. References nothing; may change. */
export type Key = string;

// ============================================================
// LocaleCode / LocalizedText: authored display text (ProcessBody/Step/
// FieldDef label+description, FieldOption.label) is locale-keyed, with a
// per-process required base locale. Timer.description and
// Plugin.description stay a plain string, authoring-facing-only, no
// localization need. Path.label/description stay a plain string too, but
// Path.label IS rendered to a process participant — PathButtons.tsx uses it
// as the submit-button text for a manual path — so it is a display string
// that happens to be non-localized, not an authoring-only one.
// ============================================================

/** Open, extensible locale-tag format (e.g. "en", "de", "en-US") — not a
 * fixed enum, since a process's set of content locales is process data, not
 * a platform constant. */
export const localeCode = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/);
export type LocaleCode = z.infer<typeof localeCode>;

/** A non-empty entry keyed by the owning process's `baseLocale` is required
 * (enforced by `processBody`'s superRefine, since only there is `baseLocale`
 * in scope); entries for other locales are optional and resolve via
 * fallback-to-base-locale, not a parse error. */
export const localizedText = z.record(localeCode, z.string());
export type LocalizedText = z.infer<typeof localizedText>;

/**
 * Fallback-to-base-locale lookup, mirroring the editor UI catalog's
 * `resolveTranslation()` — but parameterized on `baseLocale` rather than a
 * hardcoded `en`, since it is process-declared data, not a platform constant.
 */
export function resolveLocalizedText(value: LocalizedText, locale: LocaleCode, baseLocale: LocaleCode): string {
  return value[locale] ?? value[baseLocale];
}

// ============================================================
// ISO 8601 duration. Fixed-length units only: weeks, days, hours, minutes,
// seconds. Calendar units (years, months) are ambiguous without a date library
// and are rejected. This is the single source for the grammar — the engine's
// durationMs (src/engine/duration.ts) parses through it rather than keeping its
// own copy, so validation and arming cannot accept different sets.
// ============================================================

// Module-private: `parseIsoDuration` is the only reachable entry point, so no
// caller can check the grammar with weaker teeth than the parser applies. The
// `T` group carries a lookahead because every unit inside it is optional — a
// bare trailing `T` ("P1DT") would otherwise match, and it is not ISO 8601.
const ISO_DURATION = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

// The latest entry instant the magnitude bound is derived against. A fixed
// constant, never wall-clock: publishing the same body twice must give the same
// verdict, and a clock-relative bound would make a stored definition's validity
// drift with time.
const ENTRY_INSTANT_CEILING = "9000-01-01T00:00:00.000Z";

/**
 * The largest `Timer.duration`, in milliseconds. GUARANTEE: a duration within
 * this bound cannot overflow the four-digit-year window when armed from any
 * entry instant before year 9000.
 *
 * Derivation: `fireAt = entryInstant + duration`, and `toISOString()` renders
 * years 0001-9999 as the 24-char form and everything outside it as the
 * expanded-year form (`+029405-01-26T...`), whose leading `+` (0x2B) sorts
 * before every digit — one such fireAt would win the scheduler's lexical
 * earliest-timer sort and suppress every other timer on its step. So the bound
 * is the span from the stated entry ceiling to the last representable
 * millisecond: 9999-12-31T23:59:59.999Z - 9000-01-01T00:00:00.000Z, just under
 * a thousand years.
 *
 * Bounding by the window's *full* span instead would be necessary but not
 * sufficient: "P3000000D" (~8214 years) fits inside 0001-9999 yet overflows
 * from an ordinary 2026 entry, which is exactly the arming failure this bound
 * exists to make unreachable.
 *
 * This is a representation bound, not a policy about how far ahead a timer may
 * be scheduled.
 */
export const MAX_TIMER_DURATION_MS =
  Date.parse("9999-12-31T23:59:59.999Z") - Date.parse(ENTRY_INSTANT_CEILING);

/**
 * ISO 8601 duration -> milliseconds, or null if it is outside the supported
 * grammar. Total. "P" and "PT" are rejected: they match the grammar but carry no
 * component, so they denote nothing. The magnitude bound is not applied here —
 * it applies only to `Timer.duration`, while the grammar applies to every
 * duration-typed field, and the two report distinct errors.
 *
 * The single source for the grammar: the engine's `durationMs`
 * (src/engine/duration.ts) and the publish-time `validateDurations`
 * (src/schema/compile.ts) both parse through this, so validation and arming
 * cannot accept different sets.
 */
export function parseIsoDuration(d: string): number | null {
  const m = ISO_DURATION.exec(d);
  if (!m) return null;
  const [, w, days, h, min, s] = m;
  if (w === undefined && days === undefined && h === undefined && min === undefined && s === undefined) return null;
  const secs =
    Number(w ?? 0) * 604800 +
    Number(days ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Number(s ?? 0);
  return secs * 1000;
}

/**
 * ISO 8601 duration, e.g. "P7D", "PT30S". Deliberately a bare string: the
 * grammar and the magnitude bound are enforced on the write path instead, by
 * `validateDurations` in src/schema/compile.ts, on arming totality — see
 * `definition-contract`'s placement requirement.
 */
export const duration = z.string();
export type Duration = z.infer<typeof duration>;

/** ISO 8601 timestamp. */
export const timestamp = z.string();

// ============================================================
// Expression: CEL, pure and total, no now(). Guards read data / instance /
// actor / named data sources, plus child.outcome + child.data in a subprocess
// step. `result` is scoped only to an Action.output mapping, never to guards.
// ============================================================

export const expression = z.object({
  lang: z.literal("cel"),
  src: z.string(),
});
export type Expression = z.infer<typeof expression>;

/** Recursive JSON literal (field defaults, payload values). */
export type Literal = string | number | boolean | null | Literal[] | { [k: string]: Literal };
export const literal: z.ZodType<Literal> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(literal), z.record(z.string(), literal)]),
);

// ============================================================
// Plugin envelope. Core validates only this shape; each plugin ships its own
// JSON Schema, resolved via a type -> { config schema, output schema } registry
// at publish time. A breaking plugin change takes a new `type` identity.
// ============================================================

export const plugin = z.object({
  type: z.string(),
  config: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
});
export type Plugin = z.infer<typeof plugin>;

// ============================================================
// Closed enums (the stable core).
// ============================================================

export const definitionStatus = z.enum(["draft", "published"]);
export const stepType = z.enum(["task", "subprocess"]); // terminal is a property, not a type
export const pathTrigger = z.enum(["manual", "automatic"]);
export const execution = z.enum(["async", "blocking"]); // v1 implements async only
export const instanceStatus = z.enum(["running", "completed", "cancelled", "faulted"]);
export const baseFieldType = z.enum([
  "string", "number", "boolean", "date", "datetime",
  "select", "multiselect", "reference", "file", "group",
]);

export type StepType = z.infer<typeof stepType>;
export type PathTrigger = z.infer<typeof pathTrigger>;
export type InstanceStatus = z.infer<typeof instanceStatus>;
export type BaseFieldType = z.infer<typeof baseFieldType>;

// ============================================================
// Reserved cancellation identity. Owned by the publish-time compile pass
// (src/schema/compile.ts), never hand-authored. The compile pass injects one
// terminal cancel-sink step per body — plus the reserved outcome on a
// contracted process — before definitionHash = JCS(ProcessBody) is taken.
// ============================================================

export const CANCEL_SINK_STEP_ID: StepId = stepId.parse("step_cancel_sink");
export const CANCEL_SINK_KEY = "cancel_sink";
export const RESERVED_CANCEL_OUTCOME = "cancelled";

// Engine-owned action types (e.g. the subprocess spawn/return handlers) live
// under this prefix. An authored definition may not use it, so the engine can
// enqueue internal actions without colliding with a plugin handler type.
export const RESERVED_ACTION_PREFIX = "core.";

// ============================================================
// Fields: central catalog, referenced by steps.
// ============================================================

/**
 * A column value an option's row carries beyond `value` and `label`. A JSON
 * scalar, never a nested object: a nested value has no target field type to
 * check against, and `FieldDef.columnMapping` writes one of these into an
 * ordinary field.
 */
export const optionAttribute = z.union([z.string(), z.number(), z.boolean()]);
export type OptionAttribute = z.infer<typeof optionAttribute>;

export const fieldOption = z.object({
  value: z.string(),
  label: localizedText,
  /**
   * The extra columns the option's row carries. Absent for an option with
   * none, never an empty map — a renderer branches on the key's presence.
   * Optional, and no body written before this key existed declares it, so
   * `definitionHash` is unmoved and the read path is unchanged.
   */
  attributes: z.record(z.string(), optionAttribute).optional(),
});
export type FieldOption = z.infer<typeof fieldOption>;

/** Catalog-level validation. Requiredness is per-step and lives in the view,
 * except for a `technical` field, which the engine forces `required: false`
 * on every step regardless (see `FieldDef.technical`). */
export const fieldValidation = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  pattern: z.string().optional(),
  rule: expression.optional(),
});
export type FieldValidation = z.infer<typeof fieldValidation>;

/** Recursive because a "group" field carries sub-fields. */
export type FieldDef = {
  id: FieldId;
  key: Key;
  label: LocalizedText;
  description?: LocalizedText;
  type: BaseFieldType | Plugin;
  options?: FieldOption[];
  dataSource?: DataSourceId;
  /**
   * Column key -> the catalog field the engine writes that column into when a
   * participant picks a row. The engine resolves the picked option, checks the
   * attribute against the target's declared type, and writes a match. The
   * bounds live in `compile.ts::checkColumnMapping`, not here:
   * `definition-contract`'s unbypassable-check criterion is the reason.
   */
  columnMapping?: Record<string, FieldId>;
  validation?: FieldValidation;
  default?: Literal | Expression;
  fields?: FieldDef[];
  /**
   * Marks the field as never directly editable by a participant: the engine
   * resolves it `required: false, readonly: true` on every step regardless
   * of the view entry. A `technical` field must not be `type: "group"`, and
   * a view entry naming one must declare neither `required` nor `readonly`.
   * Both rules are write-path checks (`compile.ts::checkTechnicalFields`),
   * never a refinement here: `definition-contract`'s unbypassable-check
   * criterion is the reason.
   */
  technical?: boolean;
};
export const fieldDef: z.ZodType<FieldDef, unknown> = z.lazy(() =>
  z
    .object({
      id: fieldId,
      key: z.string(),
      label: localizedText,
      description: localizedText.optional(),
      type: z.union([baseFieldType, plugin]),
      options: z.array(fieldOption).optional(),
      dataSource: dataSourceId.optional(),
      columnMapping: z.record(z.string(), fieldId).optional(),
      validation: fieldValidation.optional(),
      default: z.union([expression, literal]).optional(),
      fields: z.array(fieldDef).optional(),
      technical: z.boolean().optional(),
    })
    .refine((f) => !(f.options && f.dataSource), {
      message: "options and dataSource are mutually exclusive",
      path: ["options"],
    }),
);

/**
 * Depth-first flatten of the field catalog, recursing into a `group` field's
 * `fields`. Includes group fields themselves (they carry their own id/key,
 * needed for uniqueness checks and for a view legitimately referencing a
 * whole group), not only their leaves.
 *
 * The one authoritative field set: id/key uniqueness and view-ref resolution
 * here, and the CEL check/eval layers (src/cel/check.ts, src/cel/eval.ts),
 * all resolve "every field in the body" through this, so they cannot resolve
 * different sets. A caller that needs leaves only (CEL's `data` namespace has
 * no entry for a group container) calls `leafFields` instead.
 */
export function collectFieldsDeep(fields: FieldDef[]): FieldDef[] {
  const out: FieldDef[] = [];
  const walk = (fs: FieldDef[]) => {
    for (const f of fs) {
      out.push(f);
      if (f.fields) walk(f.fields);
    }
  };
  walk(fields);
  return out;
}

/** `collectFieldsDeep`, filtered to leaves: every group container drops out,
 * since CEL's `data` namespace has no entry for one. The shared helper behind
 * `dataSchema`/`contractFieldSchema` (src/cel/check.ts) and `fieldKeyById`
 * (src/cel/eval.ts), which otherwise each reimplemented this same filter. */
export function leafFields(fields: FieldDef[]): FieldDef[] {
  return collectFieldsDeep(fields).filter((f) => f.type !== "group");
}

/**
 * Expected JS shape per BaseFieldType. Shared by the submission validator
 * (`src/runtime/api.ts`, a participant's value) and the outbox writeback check
 * (`src/engine/outbox.ts`, a handler's `Action.output` value) — one type rule
 * for "does this value match this field's declared type", not a copy per
 * caller. Exhaustive over BaseFieldType: a future member missing here is a
 * compile error.
 */
const JS_TYPE: Record<BaseFieldType, string> = {
  string: "string",
  date: "string",
  datetime: "string",
  select: "string",
  reference: "string",
  number: "number",
  boolean: "boolean",
  multiselect: "string[]",
  file: "any", // opaque / unreachable (group refs are excluded before this is called)
  group: "any",
};

/** True if `value`'s JS shape matches `fieldType`'s declared shape. A plugin type is opaque and always accepted. */
export function typeMatches(fieldType: FieldDef["type"], value: Literal): boolean {
  if (typeof fieldType !== "string") return true; // plugin type: opaque, accept
  const expected = JS_TYPE[fieldType];
  if (expected === "any") return true;
  if (expected === "string[]") return Array.isArray(value) && value.every((v) => typeof v === "string");
  return typeof value === expected;
}

/** The expected-type label `typeMatches` checks against, for a diagnostic message. */
export function expectedTypeLabel(fieldType: FieldDef["type"]): string {
  return typeof fieldType !== "string" ? "any" : JS_TYPE[fieldType];
}

// ============================================================
// Data sources: plugin, never inlined, referenced by id.
// ============================================================

export const dataSourceDef = plugin.extend({ id: dataSourceId, key: z.string() });
export type DataSourceDef = z.infer<typeof dataSourceDef>;

// ============================================================
// Action: declarative handler reference + execution metadata.
// output is keyed by target FieldId, value CEL over `result` (same shape as
// SubprocessSpec.outputMapping). The handler returns; the engine writes back.
// ============================================================

export const retryPolicy = z.object({
  maxAttempts: z.number(),
  backoff: z.enum(["none", "fixed", "exponential"]),
  baseDelay: duration.optional(),
});

export const action = plugin.extend({
  id: actionId,
  idempotencyKey: z.string().nullable().optional(),
  output: z.record(fieldId, expression).optional(),
  execution: execution.optional(),
  retry: retryPolicy.optional(),
  timeout: duration.optional(),
});
export type Action = z.infer<typeof action>;

// ============================================================
// Timer: first-class on the step; fire time computed at entry and persisted.
// A timer-forced transition bypasses its target path's guard.
// ============================================================

export const timerAction = z.object({
  actions: z.array(action).optional(),
  targetPath: pathId.optional(),
});

export const timer = z
  .object({
    id: timerId,
    description: z.string().optional(),
    duration: duration.optional(),
    deadline: expression.optional(),
    onFire: timerAction,
  })
  .refine((t) => !!t.duration !== !!t.deadline, {
    message: "exactly one of duration or deadline",
    path: ["duration"],
  });
export type Timer = z.infer<typeof timer>;

// ============================================================
// Path: manual or automatic. A step's paths are all-manual or all-automatic.
// ============================================================

export const path = z.object({
  id: pathId,
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  description: z.string().optional(),
  to: stepId,
  trigger: pathTrigger,
  guard: expression.optional(),
  priority: z.number().optional(),
  onPath: z.array(action).optional(),
});
export type Path = z.infer<typeof path>;

// ============================================================
// View (flat) + Assignment.
// ============================================================

export const viewField = z
  .object({
    ref: fieldId,
    visible: z.union([z.boolean(), expression]).optional(),
    required: z.union([z.boolean(), expression]).optional(),
    readonly: z.union([z.boolean(), expression]).optional(),
    group: z.string().optional(),
    /** How many of the view's columns this field occupies. Layout only: it
     * reaches no guard, no CEL context and no submission check. Absent means 1,
     * and the renderer clamps to `min(span, columns)`, so a span wider than the
     * grid is a rendering rule rather than a publish error. */
    span: z.union([z.literal(1), z.literal(2)]).optional(),
    /** This step's override of the catalog field's validation, same shape as
     * `FieldDef.validation`. Absent means the catalog value applies unchanged.
     * Present, combines with the catalog value per `validationMode`. */
    validation: fieldValidation.optional(),
    /** How `validation` combines with the catalog field's own. `"merge"`
     * (the default when `validation` is present) overlays the step's keys on
     * the catalog's, keeping every key the step leaves out. `"replace"` drops
     * the catalog value whole; only the step's keys are in force. Meaningless
     * without `validation`, and rejected when it is absent. */
    validationMode: z.enum(["merge", "replace"]).optional(),
  })
  .refine((f) => f.validationMode === undefined || f.validation !== undefined, {
    message: "validationMode requires validation",
    path: ["validationMode"],
  })
  .refine((f) => f.validation === undefined || Object.keys(f.validation).length > 0, {
    message: "validation must declare at least one key",
    path: ["validation"],
  });
export type ViewField = z.infer<typeof viewField>;

export const view = z.object({
  fields: z.array(viewField),
  /** How many columns the step's form lays its root fields out in. Layout
   * only, like `ViewField.span`. Absent means 1, which is the single stacked
   * column every body written before this key parsed to, so no stored body
   * changes shape and no `definitionHash` moves.
   *
   * Optional, and widening the union later stays safe: this schema is also the
   * deserializer for stored immutable bodies, so narrowing it or making the key
   * required would make an already-published body throw on READ. */
  columns: z.union([z.literal(1), z.literal(2)]).optional(),
});
export type View = z.infer<typeof view>;

export const assignment = z.object({ strategy: plugin });
export type Assignment = z.infer<typeof assignment>;

// ============================================================
// Subprocess: call-and-return; the parent step is a wait state.
// latest-at-spawn is pinned by contractRef (the child contract signature).
// ============================================================

export const subprocessSpec = z
  .object({
    processId,
    versionBinding: z.enum(["latest-at-spawn", "pinned"]),
    pinnedVersion: z.number().optional(),
    contractRef: z.string().optional(),
    inputMapping: z.record(fieldId, expression),
    outputMapping: z.record(fieldId, expression),
  })
  .refine((s) => (s.versionBinding === "pinned") === (s.pinnedVersion !== undefined), {
    message: "pinnedVersion is present iff versionBinding is 'pinned'",
    path: ["pinnedVersion"],
  })
  .refine((s) => s.versionBinding !== "latest-at-spawn" || s.contractRef !== undefined, {
    message: "contractRef is required for latest-at-spawn",
    path: ["contractRef"],
  });
export type SubprocessSpec = z.infer<typeof subprocessSpec>;

// ============================================================
// Step. Local invariants (self-contained) live here as a superRefine.
// ============================================================

export interface PathTriggerCheckResult {
  ok: boolean;
  reasons: string[];
}

/** Structural, not `Pick<Path, ...>`: only `guard`'s presence/absence is
 * ever inspected here, never its shape, so this stays satisfied by both a
 * real `Path` and the studio area's Draft-shaped (all-optional) paths
 * without either side needing a cast. */
export interface PathTriggerCandidate {
  trigger: PathTrigger;
  guard?: unknown;
  priority?: number;
}

/**
 * A step's paths must be all-manual or all-automatic, never mixed; among
 * automatic paths, priority is required and unique when there are two or
 * more, at most one may be guardless (the default), and a default must hold
 * the highest priority. Shared by the step `superRefine` below and by
 * the studio area's canvas, which checks a would-be path against a step's
 * existing paths before creating it (see `studio-canvas`).
 */
export function checkPathTriggerConsistency(paths: PathTriggerCandidate[]): PathTriggerCheckResult {
  const reasons: string[] = [];

  const triggers = new Set(paths.map((p) => p.trigger));
  if (triggers.has("manual") && triggers.has("automatic"))
    reasons.push("a step's paths must be all-manual or all-automatic, not mixed");

  const autos = paths.filter((p) => p.trigger === "automatic");
  const guarded = autos.filter((p) => p.guard !== undefined);
  const guardless = autos.filter((p) => p.guard === undefined);

  if (autos.length >= 2) {
    const prios = autos.map((p) => p.priority);
    if (prios.some((x) => x === undefined)) reasons.push("automatic paths need a priority when a step has two or more");
    else if (new Set(prios).size !== prios.length) reasons.push("automatic path priorities must be unique");
  }
  if (guardless.length > 1) reasons.push("at most one default (guardless) automatic path per step");
  if (guardless.length === 1 && guarded.length > 0) {
    const gd = guardless[0].priority;
    const maxGuarded = Math.max(...guarded.map((p) => p.priority ?? -Infinity));
    if (gd === undefined || gd <= maxGuarded) reasons.push("the default (guardless) automatic path must have the highest priority");
  }

  return { ok: reasons.length === 0, reasons };
}

export const step = z
  .object({
    id: stepId,
    key: z.string(),
    label: localizedText,
    description: localizedText.optional(),
    type: stepType,
    terminal: z.boolean().optional(),
    outcome: z.string().optional(),
    subprocess: subprocessSpec.optional(),
    view: view.optional(),
    assignment: assignment.optional(),
    onEntry: z.array(action).optional(),
    onExit: z.array(action).optional(),
    // Cleanup on cancellation. Become the onPath actions of the step's
    // engine-synthesized cancel path; do NOT run the normal onExit.
    onCancel: z.array(action).optional(),
    timers: z.array(timer).optional(),
    paths: z.array(path).optional(),
  })
  .superRefine((s, ctx) => {
    const paths = s.paths ?? [];
    const add = (message: string, path: (string | number)[] = ["paths"]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    if (s.outcome !== undefined && !s.terminal) add("outcome may only be set on a terminal step", ["outcome"]);
    if (s.terminal && paths.length > 0) add("a terminal step has no outgoing paths");

    // A timer's targetPath must resolve to one of this step's own paths (checked
    // below in the process-level superRefine), so a step with zero paths can never
    // satisfy an exit through a timer either: the exit rule reduces to "needs a path".
    if (!s.terminal && paths.length === 0) add("a non-terminal step needs at least one outgoing path");

    if (s.type === "subprocess" && !s.subprocess) add("a subprocess step needs a subprocess spec", ["subprocess"]);
    if (s.type !== "subprocess" && s.subprocess) add("only a subprocess step may declare a subprocess spec", ["subprocess"]);
    if (s.type === "subprocess" && paths.some((p) => p.trigger === "manual"))
      add("a subprocess step is a wait-state: its paths must be all-automatic");

    checkPathTriggerConsistency(paths).reasons.forEach((reason) => add(reason));
  });
export type Step = z.infer<typeof step>;

// ============================================================
// Workflow + Contract + Body (with process-wide invariants) + Version.
// ============================================================

export const workflow = z.object({
  initialStep: stepId,
  steps: z.array(step),
});
export type Workflow = z.infer<typeof workflow>;

export const processContract = z.object({
  inputFields: z.array(fieldId).optional(),
  outputFields: z.array(fieldId).optional(),
  outcomes: z.array(z.string()).optional(),
});
export type ProcessContract = z.infer<typeof processContract>;

export const processBody = z
  .object({
    key: z.string(),
    label: localizedText,
    description: localizedText.optional(),
    baseLocale: localeCode,
    contract: processContract.optional(),
    fields: z.array(fieldDef),
    dataSources: z.array(dataSourceDef).optional(),
    // Group ids an org.group-members step may reference (group-based-assignment).
    // .optional(), not .default([]): canonicalize() drops an undefined key, so a
    // body predating this field keeps its definitionHash unchanged. Follows
    // dataSources, the other array-typed top-level field with the same shape.
    allowedGroups: z.array(z.string()).optional(),
    workflow,
  })
  .superRefine((b, ctx) => {
    const add = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });

    const steps = b.workflow.steps;
    const stepIds = new Set(steps.map((s) => s.id));
    const allFields = collectFieldsDeep(b.fields);
    const fieldIds = new Set(allFields.map((f) => f.id));
    const outcomes = new Set(b.contract?.outcomes ?? []);
    const sink = steps.find((s) => s.id === CANCEL_SINK_STEP_ID);

    // Every LocalizedText value in the body must carry a non-empty entry for
    // the process's own baseLocale (authored-content-localization capability).
    // Placed on this base schema — not authoredProcessBody — so both
    // authoredProcessBody and publishedProcessBody inherit it, and the
    // compile-injected cancel-sink label is checked too.
    const requireBaseLocale = (value: LocalizedText | undefined, loc: (string | number)[]) => {
      if (value !== undefined && !value[b.baseLocale]) add(`missing baseLocale ('${b.baseLocale}') entry`, loc);
    };
    requireBaseLocale(b.label, ["label"]);
    requireBaseLocale(b.description, ["description"]);
    steps.forEach((s, i) => {
      requireBaseLocale(s.label, ["workflow", "steps", i, "label"]);
      requireBaseLocale(s.description, ["workflow", "steps", i, "description"]);
    });
    allFields.forEach((f) => {
      requireBaseLocale(f.label, ["fields", f.id, "label"]);
      requireBaseLocale(f.description, ["fields", f.id, "description"]);
      (f.options ?? []).forEach((o, j) => requireBaseLocale(o.label, ["fields", f.id, "options", j, "label"]));
    });

    const RESERVED_CEL_NAMESPACES = new Set(["data", "instance", "actor", "child", "result"]);

    // Within one transition the Action.output target FieldIds across all its
    // actions must be disjoint — two actions writing one field is a silent
    // last-writer race. Checked per transition below.
    const disjointOutputs = (actions: Action[], loc: (string | number)[]) => {
      const seen = new Set<string>();
      for (const a of actions)
        for (const fid of Object.keys(a.output ?? {})) {
          if (seen.has(fid)) { add(`two actions on one transition write the same output field: ${fid}`, loc); return; }
          seen.add(fid);
        }
    };

    if (!stepIds.has(b.workflow.initialStep))
      add(`initialStep does not resolve: ${b.workflow.initialStep}`, ["workflow", "initialStep"]);

    if (stepIds.size !== steps.length) add("duplicate step ids", ["workflow", "steps"]);
    if (fieldIds.size !== allFields.length) add("duplicate field ids", ["fields"]);
    if (new Set(allFields.map((f) => f.key)).size !== allFields.length) add("duplicate field keys", ["fields"]);

    const allPathIds = steps.flatMap((s) => (s.paths ?? []).map((p) => p.id));
    if (new Set(allPathIds).size !== allPathIds.length) add("duplicate path ids", ["workflow", "steps"]);

    const allTimerIds = steps.flatMap((s) => (s.timers ?? []).map((t) => t.id));
    if (new Set(allTimerIds).size !== allTimerIds.length) add("duplicate timer ids", ["workflow", "steps"]);

    const allActionIds: string[] = [];
    steps.forEach((s) => {
      allActionIds.push(...(s.onEntry ?? []).map((a) => a.id));
      allActionIds.push(...(s.onExit ?? []).map((a) => a.id));
      allActionIds.push(...(s.onCancel ?? []).map((a) => a.id));
      (s.paths ?? []).forEach((p) => allActionIds.push(...(p.onPath ?? []).map((a) => a.id)));
      (s.timers ?? []).forEach((t) => allActionIds.push(...(t.onFire.actions ?? []).map((a) => a.id)));
    });
    if (new Set(allActionIds).size !== allActionIds.length) add("duplicate action ids", ["workflow", "steps"]);

    const dataSources = b.dataSources ?? [];
    if (new Set(dataSources.map((d) => d.id)).size !== dataSources.length)
      add("duplicate data source ids", ["dataSources"]);
    if (new Set(dataSources.map((d) => d.key)).size !== dataSources.length)
      add("duplicate data source keys", ["dataSources"]);
    dataSources.forEach((d, i) => {
      if (RESERVED_CEL_NAMESPACES.has(d.key))
        add(`data source key '${d.key}' collides with a reserved CEL namespace`, ["dataSources", i, "key"]);
    });

    const dataSourceIds = new Set(dataSources.map((d) => d.id));
    allFields.forEach((f) => {
      if (f.dataSource && !dataSourceIds.has(f.dataSource))
        add(`field dataSource does not resolve: ${f.dataSource}`, ["fields", f.id, "dataSource"]);
    });

    steps.forEach((s, i) => {
      (s.paths ?? []).forEach((p, j) => {
        if (!stepIds.has(p.to)) add(`path target does not resolve: ${p.to}`, ["workflow", "steps", i, "paths", j, "to"]);
        const target = steps.find((st) => st.id === p.to);
        disjointOutputs([...(s.onExit ?? []), ...(p.onPath ?? []), ...(target?.onEntry ?? [])], ["workflow", "steps", i, "paths", j]);
      });
      // Cancel transition: [source.onCancel, cancel-sink.onEntry]. The injected
      // sink has no onEntry, so this reduces to disjointness among onCancel.
      disjointOutputs([...(s.onCancel ?? []), ...(sink?.onEntry ?? [])], ["workflow", "steps", i, "onCancel"]);
      (s.view?.fields ?? []).forEach((vf, j) => {
        if (!fieldIds.has(vf.ref)) add(`view ref does not resolve: ${vf.ref}`, ["workflow", "steps", i, "view", "fields", j, "ref"]);
      });
      (s.timers ?? []).forEach((t, j) => {
        const tp = t.onFire.targetPath;
        if (tp !== undefined && !(s.paths ?? []).some((p) => p.id === tp))
          add(`timer targetPath is not an outgoing path of this step: ${tp}`, ["workflow", "steps", i, "timers", j]);
      });
      const stepActions = [...(s.onEntry ?? []), ...(s.onExit ?? []), ...(s.onCancel ?? [])];
      (s.paths ?? []).forEach((p) => stepActions.push(...(p.onPath ?? [])));
      (s.timers ?? []).forEach((t) => stepActions.push(...(t.onFire.actions ?? [])));
      stepActions.forEach((a) => {
        Object.keys(a.output ?? {}).forEach((fid) => {
          if (!fieldIds.has(fid as FieldId)) add(`action output targets unknown field: ${fid}`, ["workflow", "steps", i]);
        });
      });
      if (b.contract && s.terminal) {
        if (s.outcome === undefined) add(`contracted process: terminal step '${s.key}' needs an outcome`, ["workflow", "steps", i, "outcome"]);
        else if (!outcomes.has(s.outcome)) add(`terminal outcome '${s.outcome}' is not in contract.outcomes`, ["workflow", "steps", i, "outcome"]);
      }
    });

    if (b.contract) {
      const reached = new Set(steps.filter((s) => s.terminal).map((s) => s.outcome).filter(Boolean) as string[]);
      outcomes.forEach((o) => {
        if (!reached.has(o)) add(`declared outcome '${o}' has no terminal step`, ["contract", "outcomes"]);
      });
    }
  });
export type ProcessBody = z.infer<typeof processBody>;

/**
 * Hand-authored body: the reserved cancellation identity is engine-owned, so an
 * author may not use the cancel-sink id/key or the reserved outcome. The
 * compile pass validates input against this before injecting the sink.
 *
 * The reserved `core.` action-prefix ban does NOT live here: a compiled body
 * legitimately contains none of that prefix's actions (they are synthesized at
 * runtime, never stored), so the ban generalizes to every body reaching the
 * compile pass and lives there instead (`src/schema/compile.ts`), ahead of the
 * `publishedProcessBody`-valid early return this schema's sibling does not
 * gate. See `harden-publish-validation` design.md for why the prefix ban and
 * the three identity checks below split onto different sides of that line.
 */
export const authoredProcessBody = processBody.superRefine((b, ctx) => {
  const add = (message: string, path: (string | number)[]) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path });
  b.workflow.steps.forEach((s, i) => {
    if (s.id === CANCEL_SINK_STEP_ID) add("reserved cancel-sink step id may not be authored", ["workflow", "steps", i, "id"]);
    if (s.key === CANCEL_SINK_KEY) add("reserved cancel-sink step key may not be authored", ["workflow", "steps", i, "key"]);
    if (s.outcome === RESERVED_CANCEL_OUTCOME) add(`outcome '${RESERVED_CANCEL_OUTCOME}' is reserved for cancellation`, ["workflow", "steps", i, "outcome"]);
  });
  if (b.contract?.outcomes?.includes(RESERVED_CANCEL_OUTCOME))
    add(`outcome '${RESERVED_CANCEL_OUTCOME}' is reserved for cancellation`, ["contract", "outcomes"]);
});
export type AuthoredProcessBody = z.infer<typeof authoredProcessBody>;

/**
 * Compiled, publishable body: exactly one engine-injected cancel-sink. Rejects a
 * body that was never compiled (zero) or double-compiled (more than one).
 */
export const publishedProcessBody = processBody.superRefine((b, ctx) => {
  const sinks = b.workflow.steps.filter((s) => s.id === CANCEL_SINK_STEP_ID).length;
  if (sinks !== 1)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `a published body has exactly one cancel-sink (found ${sinks})`,
      path: ["workflow", "steps"],
    });
});

/**
 * A migration rule. `fromVersion` lives on the plan key `(processId, fromVersion,
 * toVersion)`, not here — the spec is the same object whether registered for one
 * version pair or read back for another. `fieldMap` is injective: two sources
 * targeting one field would collapse under the snapshot remap (the last write in an
 * unspecified order wins), so it is a registration error rather than a silent
 * data-dependent result.
 */
export const migrationSpec = z
  .object({
    stepMap: z.record(stepId, stepId).optional(),
    fieldMap: z.record(fieldId, fieldId).optional(),
    transforms: z.record(fieldId, expression).optional(),
    onUnmappable: z.enum(["reject-and-pin", "route-to-step"]).optional(),
    unmappableStep: stepId.optional(),
  })
  .refine((m) => (m.onUnmappable === "route-to-step") === (m.unmappableStep !== undefined), {
    message: "unmappableStep is present iff onUnmappable is 'route-to-step'",
    path: ["unmappableStep"],
  })
  .refine((m) => new Set(Object.values(m.fieldMap ?? {})).size === Object.keys(m.fieldMap ?? {}).length, {
    message: "fieldMap is injective: no two sources may target one field",
    path: ["fieldMap"],
  });
export type MigrationSpec = z.infer<typeof migrationSpec>;

/** The published, versioned wrapper. Not part of the hashed body. */
export const processVersion = z.object({
  processId,
  version: z.number(),
  definitionHash: z.string(),
  status: definitionStatus,
  publishedAt: timestamp.optional(),
  definition: processBody,
});
export type ProcessVersion = z.infer<typeof processVersion>;

// ============================================================
// Runtime: instance + history + events (the audit backbone).
// ============================================================

export const assignmentState = z.object({
  candidates: z.array(z.string()),
  claimedBy: z.string().optional(),
  claimedAt: timestamp.optional(),
});
export type AssignmentState = z.infer<typeof assignmentState>;

/**
 * What a timer was armed from: its declared source (so migration can detect a
 * redeclaration of a surviving timer id) and the instant it was armed. Optional
 * on TimerState so a body/instance persisted before this field existed keeps
 * deserializing — reconciliation has nothing to compare an absent provenance
 * against, so it trusts the carried record as unchanged rather than treating
 * the absence as a validation failure.
 */
export const timerProvenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("duration"), duration, armedAt: timestamp }),
  z.object({ kind: z.literal("deadline"), src: z.string(), armedAt: timestamp }),
]);
export type TimerProvenance = z.infer<typeof timerProvenance>;

export const timerState = z.object({
  timerId,
  fireAt: timestamp,
  fired: z.boolean().optional(),
  provenance: timerProvenance.optional(),
});
export type TimerState = z.infer<typeof timerState>;

export const actionOutcome = z.object({
  actionId,
  resolvedHandler: z.string(),
  idempotencyKey: z.string(),
  status: z.enum(["succeeded", "failed", "dead-letter"]),
  attempts: z.number(),
  at: timestamp,
  // Set when a terminal instance suppressed the writeback: the handler ran
  // (status still reflects its outcome) but no value was written into data.
  suppressed: z.boolean().optional(),
  // Target FieldIds whose Action.output value did not match the field's
  // declared type: the entry was dropped (not written), the rest of the patch
  // still applied, and the delivery still counts as succeeded — the remote
  // side did its work. Distinct from `suppressed` (a whole patch withheld
  // because the instance was not running or had migrated): a drop is per
  // entry and happens even against a running, current-version instance.
  droppedTargets: z.array(fieldId).optional(),
});
export type ActionOutcome = z.infer<typeof actionOutcome>;

export const historyEntry = z.object({
  id: historyEntryId,
  instanceId,
  transitionSeq: z.number(),
  version: z.number(),
  pathId: pathId.nullable(),
  fromStepId: stepId.nullable(),
  toStepId: stepId,
  cause: z.enum(["user", "timer", "automatic", "migration", "cancel"]),
  actorId: z.string().optional(),
  at: timestamp,
  actions: z.array(actionOutcome).optional(),
});
export type HistoryEntry = z.infer<typeof historyEntry>;

/**
 * Append-only runtime record for facts that carry no step change and so cannot
 * be a HistoryEntry (whose `toStepId` is non-nullable and load-bearing).
 *
 * An event never advances `transitionSeq`; it records the seq in force. Several
 * events may share one seq, and may share it with a transition — expected, not a
 * collision. Ordering within a seq is by `at`, then insertion. `version` is
 * carried for the same reason HistoryEntry carries it: an id in a payload
 * resolves against the definition that produced it.
 *
 * A discriminated union over `kind`, so a payload cannot be attached to the
 * wrong kind. Payloads are strict: an extra or missing key is a parse error
 * rather than a silently mismatched record.
 */
const instanceEventEnvelope = {
  id: instanceEventId,
  instanceId,
  transitionSeq: z.number(),
  version: z.number(),
  at: timestamp,
};

/**
 * Why a declared timer produced no `fireAt` at entry. Distinguished at the point
 * that knows it: evaluation raising, versus a resolved value that is not a
 * parseable instant.
 */
export const timerUnarmedReason = z.enum(["expression-raised", "not-an-instant"]);
export type TimerUnarmedReason = z.infer<typeof timerUnarmedReason>;

/**
 * Why a migration `transforms` entry produced no value for its target field.
 * Distinguished at the point that knows it: the CEL evaluation itself raising,
 * versus a resolved value that cannot be made JSON-safe (an out-of-range bigint).
 */
export const migrationTransformDroppedReason = z.enum(["expression-raised", "value-out-of-range"]);
export type MigrationTransformDroppedReason = z.infer<typeof migrationTransformDroppedReason>;

/**
 * Why a migration left an instance on its source version. `step-unmappable` is a
 * property of the rule and recurs on every re-invocation; `pending-actions` and
 * `child-in-flight` are transient and clear on their own — the first once the
 * instance's outbox drains, the second once the live subprocess child it would
 * relocate off of settles. There is no unreadable-instance reason: an event
 * envelope needs `instanceId`, `version` and `transitionSeq`, which a row failing
 * `instance.parse` cannot supply — that case is reported as failed by the
 * operation, not as an event.
 */
export const migrationSkipReason = z.enum(["step-unmappable", "pending-actions", "child-in-flight"]);
export type MigrationSkipReason = z.infer<typeof migrationSkipReason>;

/**
 * Why an instance was parked `faulted`. One member today — a detected automatic
 * cascade loop is the only fault cause the engine has — kept as an enum (the
 * `timerUnarmedReason` / `migrationSkipReason` shape) so a second cause extends
 * the payload's contract instead of changing it.
 */
export const instanceFaultedReason = z.enum(["automatic-cascade-loop"]);

/**
 * Why a step entry resolved its declared assignment to no candidate. Each is
 * distinguished at the point that knows it: the strategy's resolver raising, the
 * resolution exceeding its deadline, and a resolver answering with an empty
 * list. `no-candidates` is the engine-level truth and covers a strategy-specific
 * cause such as "no manager on record" — the event envelope carries the
 * `version`, and its `stepId` resolves against that frozen body, so a reader
 * recovers the strategy type from the definition rather than from the payload.
 */
export const assignmentUnresolvedReason = z.enum(["resolver-raised", "timed-out", "no-candidates"]);
export type AssignmentUnresolvedReason = z.infer<typeof assignmentUnresolvedReason>;

export const instanceEvent = z.discriminatedUnion("kind", [
  // A reminder timer (onFire actions, no targetPath) fired: actions enqueued,
  // no transition.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("timer.fired"),
    payload: z.object({ timerId }).strict(),
    // Outcomes of the actions this fire enqueued — they attach here, not to the
    // HistoryEntry that happens to share the seq. Only a kind that enqueues
    // actions carries them: an unarmed timer enqueues nothing, so the field
    // would be permanently null on that arm and would invite a reader to expect
    // outcomes that cannot exist.
    actions: z.array(actionOutcome).optional(),
  }),
  // A declared timer was omitted from the armed set. Arming is total, so the
  // entry committed regardless; TimerState stays "armed timers" and carries no
  // fire time for a timer that never armed.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("timer.unarmed"),
    payload: z.object({ timerId, reason: timerUnarmedReason }).strict(),
  }),
  // A migration left this instance on its source version. The envelope's `version`
  // is the source version (the instance did not move, so ids resolve there); the
  // payload names both versions and the reason. No seq advance, no HistoryEntry.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("migration.skipped"),
    payload: z.object({ fromVersion: z.number(), toVersion: z.number(), reason: migrationSkipReason }).strict(),
  }),
  // An instance created on a definition whose initialStep is a subprocess step
  // enqueued its spawn in the creation transaction: actions enqueued, no
  // transition (the `timer.fired` shape). Recorded at seq 0, which creation does
  // not advance. It exists to carry the spawn's outcome: creation writes no
  // HistoryEntry, so the outcome's fallback target — the transition record at
  // (instanceId, 0) — matches nothing and the outcome would be discarded
  // silently, and a dead-lettered initial spawn is exactly the "parked forever,
  // why?" diagnostic. A transition-entered subprocess step records no such
  // event; its outcome attaches to that transition's HistoryEntry.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("subprocess.spawn-enqueued"),
    payload: z.object({ stepId }).strict(),
    actions: z.array(actionOutcome).optional(),
  }),
  // A subprocess return's outputMapping writeback committed, but child.outcome
  // matched no automatic path on the parent's subprocess step: the return stays
  // delivered and the writeback is not undone, but the parent stays parked with
  // nothing else recording why. No transition, no actions enqueued — the
  // migration.skipped shape, not the timer.fired one.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("subprocess.outcome-unmatched"),
    payload: z.object({ stepId, outcome: z.string().nullable() }).strict(),
  }),
  // A migration's `transforms` entry raised, or its result could not be made
  // JSON-safe: evaluation is total, so the entry left its target field
  // unwritten rather than failing the migration. No transition, no actions
  // enqueued — the migration.skipped shape, not the timer.fired one. The
  // `version` an event carries is the version in force; for this kind that is
  // the TARGET version, since the fieldId it names is declared there.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("migration.transform-dropped"),
    payload: z.object({ fieldId, reason: migrationTransformDroppedReason }).strict(),
  }),
  // An actor claimed an unclaimed, assignment-bearing step. Not a transition (no
  // step change), so no HistoryEntry and no transitionSeq advance — the
  // migration.skipped shape, not the timer.fired one.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("assignment.claimed"),
    payload: z.object({ actorId: z.string() }).strict(),
  }),
  // The claimant released their claim on the current step.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("assignment.released"),
    payload: z.object({ actorId: z.string() }).strict(),
  }),
  // The claimant delegated their claim to a named target actor. Not a
  // transition (no step change), so no HistoryEntry and no transitionSeq
  // advance — the migration.skipped shape, not the timer.fired one. The
  // target does not join `assignment.candidates`.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("assignment.delegated"),
    payload: z.object({ fromActorId: z.string(), toActorId: z.string() }).strict(),
  }),
  // An advance cascade re-entered a step it had already entered and was
  // stopped, parking the instance `faulted`. Not a transition (no step
  // change) — the migration.skipped shape, not the timer.fired one: no
  // actions are enqueued by a park. `version` is the instance's own, since it
  // did not move.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("instance.faulted"),
    payload: z.object({ stepId, reason: instanceFaultedReason }).strict(),
  }),
  // A subprocess inputMapping or outputMapping entry raised, or its result
  // could not be made JSON-safe: evaluation is total per entry (mirroring
  // migration transforms), so the entry left its target field unwritten
  // rather than failing the spawn or the return. No transition, no actions
  // enqueued — the migration.skipped shape, not the timer.fired one. Recorded
  // on the PARENT — both mappings evaluate over the parent's context — with
  // the parent's own `version`/`transitionSeq` in force, in the same
  // transaction as the spawn's or the return's own commit.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("mapping.entry-dropped"),
    payload: z.object({ fieldId, direction: z.enum(["input", "output"]), reason: migrationTransformDroppedReason }).strict(),
  }),
  // A step entry resolved its declared `assignment` to no candidate: the
  // resolver raised, exceeded its deadline, or answered with an empty list.
  // Resolution is total, so the entry committed regardless and `candidates` is
  // empty. No transition of its own and no actions enqueued — the timer.unarmed
  // shape, not the timer.fired one: a declared thing produced no value at entry
  // and the record names the reason. It carries the seq in force after the entry
  // it accompanies, so it shares that seq with that entry's HistoryEntry where
  // one exists, and sits at 0 on a creation, where none does. A step declaring
  // no `assignment` records nothing: resolution never runs for it.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("assignment.unresolved"),
    payload: z.object({ stepId, reason: assignmentUnresolvedReason }).strict(),
  }),
  // A field's `columnMapping` named an attribute whose value does not match its
  // target field's declared type, so the engine dropped it rather than writing
  // it. The submission still succeeds: the mismatch comes from operator data,
  // and the participant can do nothing about it — the rule `Action.output`
  // already takes in the outbox. No transition of its own and no actions
  // enqueued; recorded in the same transaction as the submission's or the
  // creation's own commit, at the seq in force.
  z.object({
    ...instanceEventEnvelope,
    kind: z.literal("datasource.attribute-dropped"),
    payload: z.object({ fieldId, column: z.string(), targetFieldId: fieldId, reason: z.literal("type-mismatch") }).strict(),
  }),
]);
export type InstanceEvent = z.infer<typeof instanceEvent>;

export const instance = z.object({
  instanceId,
  processId,
  version: z.number(),
  definitionHash: z.string(),
  currentStepId: stepId,
  transitionSeq: z.number(),
  data: z.record(fieldId, literal),
  // nullable (not just optional): a step entry's commit patch must be able to
  // explicitly CLEAR a carried-over assignment from the previous step via a
  // shallow jsonb `||` merge — an omitted key in that merge leaves the prior
  // value in place, so "no assignment on the target step" is written as JSON
  // null, not an absent key. `undefined` remains valid for an instance that
  // predates this field (nothing ever wrote it). Both read as "no assignment".
  assignment: assignmentState.nullable().optional(),
  timers: z.array(timerState).optional(),
  parent: z.object({ instanceId, stepId }).optional(),
  // A `process.start` action's reporting-only backlink to the instance that
  // started this one. Distinct from `parent`: nothing that treats `parent`
  // as a call-and-return link (cancel cascade, the subprocess return path)
  // reads this field.
  chainedFrom: instanceId.optional(),
  status: instanceStatus,
  startedAt: timestamp,
  startedBy: z.string().optional(),
  // Written at every step entry (creation included) alongside currentStepId.
  // Optional only for instances that predate this field — nothing ever wrote
  // it for them, so a reader falls back to startedAt for those.
  currentStepEnteredAt: timestamp.optional(),
  // Set once by redactInstance; absent means not redacted, same as an
  // instance that predates this field.
  redactedAt: timestamp.optional(),
});
export type Instance = z.infer<typeof instance>;

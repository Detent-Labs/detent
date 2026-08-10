/**
 * Publish-time compile pass.
 *
 * Validates every duration-typed value (see `validateDurations`) and the six
 * structural write-path checks below (see `structuralIssues`), then injects
 * the engine-owned cancel-sink — and, for a contracted process, the
 * reserved "cancelled" outcome bound to it — into a ProcessBody. This runs
 * BEFORE definitionHash = JCS(ProcessBody) is taken, so the hash covers the
 * sink and instances rehydrate against a body that actually contains the step
 * their cancel HistoryEntry references.
 *
 * Deterministic (same authored body -> identical compiled body) and idempotent
 * (an already-compiled body is returned unchanged). Rejects a body that authors
 * the reserved cancellation identity.
 *
 * Returns the VALIDATED PARSE OUTPUT, never the input. The contract schemas
 * strip undeclared content and are also the deserializer every read goes
 * through, so compile is where stripping must happen: hashing the input would
 * cover keys that no read reproduces, and the resulting pin would never
 * rehydrate.
 *
 * Every check in this module — durations and the six structural checks alike —
 * runs on BOTH compile branches, ahead of the `publishedProcessBody`-valid
 * early return: that placement is what makes a check unbypassable by a
 * hand-written body that merely satisfies `publishedProcessBody` (which
 * constrains only the cancel-sink count). See `harden-publish-validation`
 * design.md.
 */

import { z } from "zod";
import {
  authoredProcessBody,
  publishedProcessBody,
  processBody,
  processContract,
  workflow,
  step,
  path,
  action,
  retryPolicy,
  timer,
  timerAction,
  view,
  viewField,
  assignment,
  subprocessSpec,
  fieldDef,
  fieldOption,
  fieldValidation,
  plugin,
  expression,
  dataSourceDef,
  collectFieldsDeep,
  parseIsoDuration,
  MAX_TIMER_DURATION_MS,
  CANCEL_SINK_STEP_ID,
  CANCEL_SINK_KEY,
  RESERVED_CANCEL_OUTCOME,
  RESERVED_ACTION_PREFIX,
  type Action,
  type ProcessBody,
  type Step,
} from "./definition.js";

/** A duration-typed value outside the grammar, or a timer duration past the bound. */
export interface DurationIssue {
  /** Where in the body, e.g. `steps[1].timers[0].duration`. */
  loc: string;
  value: string;
  message: string;
}

/** A published body carries a duration the engine cannot arm from. */
export class DurationValidationError extends Error {
  constructor(readonly issues: DurationIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (${JSON.stringify(i.value)})`).join("; "));
    this.name = "DurationValidationError";
  }
}

const GRAMMAR = "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";
const OUT_OF_RANGE = `timer duration exceeds the ${MAX_TIMER_DURATION_MS} ms bound (a fireAt past it leaves the four-digit-year range)`;

/**
 * Publish-time duration check, returning located issues ([] when the body is
 * clean). Lives here, not as a Zod refinement, because `definition.ts` is also
 * the deserializer for stored immutable bodies: tightening a refinement would
 * make an already-published definition throw on READ, and its pinned instances
 * unrehydratable. Validation that may tighten over time belongs on the write
 * path — the same placement CEL checking and plugin-config validation take.
 *
 * The grammar applies to every duration-typed field. The magnitude bound
 * applies to `Timer.duration` alone: it exists to keep `entryInstant + duration`
 * inside the four-digit-year window, and `retryPolicy.baseDelay` /
 * `action.timeout` compute no instant, so bounding them would be a limit with
 * no reason behind it.
 */
export function validateDurations(body: ProcessBody): DurationIssue[] {
  const issues: DurationIssue[] = [];
  const grammar = (value: string | undefined, loc: string) => {
    if (value === undefined) return;
    if (parseIsoDuration(value) === null) issues.push({ loc, value, message: GRAMMAR });
  };
  const actions = (list: Action[] | undefined, loc: string) =>
    (list ?? []).forEach((a, i) => {
      grammar(a.timeout, `${loc}[${i}].timeout`);
      grammar(a.retry?.baseDelay, `${loc}[${i}].retry.baseDelay`);
    });

  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    actions(s.onEntry, `${sloc}.onEntry`);
    actions(s.onExit, `${sloc}.onExit`);
    actions(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => actions(p.onPath, `${sloc}.paths[${pi}].onPath`));
    (s.timers ?? []).forEach((t, ti) => {
      const loc = `${sloc}.timers[${ti}].duration`;
      if (t.duration !== undefined) {
        const ms = parseIsoDuration(t.duration);
        if (ms === null) issues.push({ loc, value: t.duration, message: GRAMMAR });
        else if (ms > MAX_TIMER_DURATION_MS) issues.push({ loc, value: t.duration, message: OUT_OF_RANGE });
      }
      actions(t.onFire.actions, `${sloc}.timers[${ti}].onFire`);
    });
  });
  return issues;
}

// ============================================================
// Structural write-path checks (harden-publish-validation). Six checks, one
// placement: called from compileProcessBody immediately after
// validateDurations, so every one of them runs on a body BEFORE it takes
// either compile branch. Modelled on DurationIssue/DurationValidationError —
// same {loc, value, message} shape — because a second, structurally
// identical pair would only be a naming difference; issues are reported
// against `Error#issues`, never thrown one at a time, so one rejection is
// fixable in one pass.
// ============================================================

/** A structural authoring-time defect located in the body (unknown key, reserved
 * prefix, uncompilable pattern, unresolved id, malformed field key, or an
 * over-long authored string). */
export interface CompileIssue {
  loc: string;
  value: string;
  message: string;
}

/** A body about to be published violates one of the six structural write-path checks. */
export class CompileValidationError extends Error {
  constructor(readonly issues: CompileIssue[]) {
    super(issues.map((i) => `${i.loc}: ${i.message} (${JSON.stringify(i.value)})`).join("; "));
    this.name = "CompileValidationError";
  }
}

// ---- Named length bounds (task 6.2). Sized to the largest plausible
// legitimate value, not the smallest workable one; each is handed to
// something that does real work with it. ----

/** FieldDef.key and Plugin.type: short identifiers / registry lookup strings. */
export const MAX_KEY_LENGTH = 200;
export const MAX_PLUGIN_TYPE_LENGTH = 200;
/** An ISO-8601 duration string never legitimately needs more than a handful of components. */
export const MAX_DURATION_LENGTH = 32;
/** CEL Expression.src: a guard or mapping, not a program. */
export const MAX_EXPRESSION_LENGTH = 4000;
/** A regex source handed to `new RegExp` at publish and cached at runtime. */
export const MAX_PATTERN_LENGTH = 4000;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ---- Zod-shape introspection: derive each object schema's known key set from
// `.shape` rather than transcribing key lists by hand, so a key added to
// definition.ts does not silently make the walk reject it. Handles the wrapper
// types the schemas actually use: `z.lazy()` (fieldDef's self-reference) and
// the optional/nullable/default wrappers.
//
// A refined schema needs no unwrapping. Zod v4 declares `refine` as returning
// `this`, so `.refine()`/`.superRefine()` leave a ZodObject a ZodObject, and
// the v3 ZodEffects branch this loop carried is gone with it. ----

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = schema;
  while (s?._zod?.def) {
    const t = s._zod.def.type;
    if (t === "lazy") { s = s._zod.def.getter(); continue; }
    if (t === "optional" || t === "nullable" || t === "default") { s = s._zod.def.innerType; continue; }
    break;
  }
  return s;
}

function shapeKeys(schema: z.ZodTypeAny): Set<string> {
  const shape = (unwrapSchema(schema) as unknown as { shape?: Record<string, unknown> }).shape;
  // An empty set would silently accept every unknown key at this level rather
  // than failing loudly, so a schema that does not unwrap to an object throws.
  if (!shape) throw new Error("shapeKeys: schema did not unwrap to an object");
  return new Set(Object.keys(shape));
}

const PROCESS_BODY_KEYS = shapeKeys(processBody);
const CONTRACT_KEYS = shapeKeys(processContract);
const WORKFLOW_KEYS = shapeKeys(workflow);
const STEP_KEYS = shapeKeys(step);
const PATH_KEYS = shapeKeys(path);
const ACTION_KEYS = shapeKeys(action);
const RETRY_POLICY_KEYS = shapeKeys(retryPolicy);
const TIMER_KEYS = shapeKeys(timer);
const TIMER_ACTION_KEYS = shapeKeys(timerAction);
const VIEW_KEYS = shapeKeys(view);
const VIEW_FIELD_KEYS = shapeKeys(viewField);
const ASSIGNMENT_KEYS = shapeKeys(assignment);
const SUBPROCESS_SPEC_KEYS = shapeKeys(subprocessSpec);
const FIELD_DEF_KEYS = shapeKeys(fieldDef);
const FIELD_OPTION_KEYS = shapeKeys(fieldOption);
const FIELD_VALIDATION_KEYS = shapeKeys(fieldValidation);
const PLUGIN_KEYS = shapeKeys(plugin);
const EXPRESSION_KEYS = shapeKeys(expression);
const DATA_SOURCE_DEF_KEYS = shapeKeys(dataSourceDef);

// ---- Shared traversal helpers, mirroring the collect()-style walks already
// used by validateDurations above, src/cel/check.ts and
// src/engine/registry-check.ts: hand-navigated over the body's known
// structure (not a generic Zod walker), each producing located sites. Operate
// on `unknown`/duck-typed input — these run BEFORE any Zod parse of the
// authored body, on both compile branches. ----

interface ActionSite {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: any;
  loc: string;
}

/** Every action across all five positions (onEntry, onExit, onCancel, each
 * path's onPath, each timer's onFire.actions), duck-typed over a raw body. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectActionSites(body: any): ActionSite[] {
  const sites: ActionSite[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (actions: any[] | undefined, loc: string) => {
    (actions ?? []).forEach((a, i) => sites.push({ action: a, loc: `${loc}[${i}]` }));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (body?.workflow?.steps ?? []).forEach((s: any, si: number) => {
    const sloc = `steps[${si}]`;
    push(s?.onEntry, `${sloc}.onEntry`);
    push(s?.onExit, `${sloc}.onExit`);
    push(s?.onCancel, `${sloc}.onCancel`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s?.paths ?? []).forEach((p: any, pi: number) => push(p?.onPath, `${sloc}.paths[${pi}].onPath`));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s?.timers ?? []).forEach((t: any, ti: number) => push(t?.onFire?.actions, `${sloc}.timers[${ti}].onFire.actions`));
  });
  return sites;
}

/** Depth-first walk of the authored field tree with an index-chained
 * location path (`fields[0].fields[2]`), mirroring src/cel/check.ts's own
 * field walk. Duck-typed: does not require the input to already validate. */
function walkFieldsIndexed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: any[] | undefined,
  loc: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit: (f: any, loc: string) => void,
): void {
  (fields ?? []).forEach((f, i) => {
    const floc = `${loc}[${i}]`;
    visit(f, floc);
    if (Array.isArray(f?.fields)) walkFieldsIndexed(f.fields, `${floc}.fields`, visit);
  });
}

// ============================================================
// 2. Reserved action prefix, on both compile branches (task 2.1).
// ============================================================

function checkReservedActionPrefix(body: ProcessBody): CompileIssue[] {
  return collectActionSites(body)
    .filter(({ action: a }) => typeof a?.type === "string" && a.type.startsWith(RESERVED_ACTION_PREFIX))
    .map(({ action: a, loc }) => ({
      loc: `${loc}.type`,
      value: a.type,
      message: `action type uses the reserved '${RESERVED_ACTION_PREFIX}' prefix`,
    }));
}

// ============================================================
// 3. Unknown-key rejection (task 3). One traversal mirroring the authored
// body's schema tree; a value's own keys are checked against the schema's
// `.shape`-derived key set, then recursed into per position. Record-typed
// positions (localizedText, Action.output, SubprocessSpec.*Mapping,
// Plugin.config) are never checked for unknown keys on their OWN keys — those
// are data (locale codes, field ids), not a fixed shape — but their VALUES
// are still walked when the value has its own fixed shape (an Expression).
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkKnownKeys(value: any, known: Set<string>, loc: string, issues: CompileIssue[]): void {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!known.has(key)) issues.push({ loc: loc ? `${loc}.${key}` : key, value: key, message: `unknown key '${key}'` });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkExpressionKeys(e: any, loc: string, issues: CompileIssue[]): void {
  if (isPlainObject(e)) checkKnownKeys(e, EXPRESSION_KEYS, loc, issues);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkActionKeys(a: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(a, ACTION_KEYS, loc, issues);
  if (isPlainObject(a?.retry)) checkKnownKeys(a.retry, RETRY_POLICY_KEYS, `${loc}.retry`, issues);
  if (isPlainObject(a?.output)) {
    for (const [fid, e] of Object.entries(a.output)) walkExpressionKeys(e, `${loc}.output.${fid}`, issues);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkActionsKeys(actions: any, loc: string, issues: CompileIssue[]): void {
  if (!Array.isArray(actions)) return;
  actions.forEach((a, i) => walkActionKeys(a, `${loc}[${i}]`, issues));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkFieldDefKeys(f: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(f, FIELD_DEF_KEYS, loc, issues);
  if (isPlainObject(f?.validation)) {
    checkKnownKeys(f.validation, FIELD_VALIDATION_KEYS, `${loc}.validation`, issues);
    walkExpressionKeys(f.validation.rule, `${loc}.validation.rule`, issues);
  }
  if (Array.isArray(f?.options)) {
    f.options.forEach((o: unknown, i: number) => checkKnownKeys(o, FIELD_OPTION_KEYS, `${loc}.options[${i}]`, issues));
  }
  // type: BaseFieldType | Plugin — a string is the closed enum (nothing to
  // check); an object is a plugin-typed field.
  if (isPlainObject(f?.type)) checkKnownKeys(f.type, PLUGIN_KEYS, `${loc}.type`, issues);
  // default: Expression | Literal — an Expression-shaped object (carries
  // `lang`) is checked as one; any other object is an arbitrary JSON literal
  // and is not subject to an unknown-key check at all.
  if (isPlainObject(f?.default) && typeof f.default.lang === "string") walkExpressionKeys(f.default, `${loc}.default`, issues);
  // Recursion into nested fields happens via walkFieldsIndexed's own caller.
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkViewKeys(v: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(v, VIEW_KEYS, loc, issues);
  if (Array.isArray(v?.fields)) {
    v.fields.forEach((vf: unknown, i: number) => {
      checkKnownKeys(vf, VIEW_FIELD_KEYS, `${loc}.fields[${i}]`, issues);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vff = vf as any;
      walkExpressionKeys(vff?.visible, `${loc}.fields[${i}].visible`, issues);
      walkExpressionKeys(vff?.required, `${loc}.fields[${i}].required`, issues);
      walkExpressionKeys(vff?.readonly, `${loc}.fields[${i}].readonly`, issues);
    });
  }
  if (isPlainObject(v?.renderer)) checkKnownKeys(v.renderer, PLUGIN_KEYS, `${loc}.renderer`, issues);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkSubprocessSpecKeys(s: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(s, SUBPROCESS_SPEC_KEYS, loc, issues);
  if (isPlainObject(s?.inputMapping)) {
    for (const [fid, e] of Object.entries(s.inputMapping)) walkExpressionKeys(e, `${loc}.inputMapping.${fid}`, issues);
  }
  if (isPlainObject(s?.outputMapping)) {
    for (const [fid, e] of Object.entries(s.outputMapping)) walkExpressionKeys(e, `${loc}.outputMapping.${fid}`, issues);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkTimerKeys(t: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(t, TIMER_KEYS, loc, issues);
  walkExpressionKeys(t?.deadline, `${loc}.deadline`, issues);
  if (isPlainObject(t?.onFire)) {
    checkKnownKeys(t.onFire, TIMER_ACTION_KEYS, `${loc}.onFire`, issues);
    walkActionsKeys(t.onFire.actions, `${loc}.onFire.actions`, issues);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkPathKeys(p: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(p, PATH_KEYS, loc, issues);
  walkExpressionKeys(p?.guard, `${loc}.guard`, issues);
  walkActionsKeys(p?.onPath, `${loc}.onPath`, issues);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkStepKeys(s: any, loc: string, issues: CompileIssue[]): void {
  checkKnownKeys(s, STEP_KEYS, loc, issues);
  walkActionsKeys(s?.onEntry, `${loc}.onEntry`, issues);
  walkActionsKeys(s?.onExit, `${loc}.onExit`, issues);
  walkActionsKeys(s?.onCancel, `${loc}.onCancel`, issues);
  if (isPlainObject(s?.subprocess)) walkSubprocessSpecKeys(s.subprocess, `${loc}.subprocess`, issues);
  if (isPlainObject(s?.view)) walkViewKeys(s.view, `${loc}.view`, issues);
  if (isPlainObject(s?.assignment)) {
    checkKnownKeys(s.assignment, ASSIGNMENT_KEYS, `${loc}.assignment`, issues);
    if (isPlainObject(s.assignment.strategy)) checkKnownKeys(s.assignment.strategy, PLUGIN_KEYS, `${loc}.assignment.strategy`, issues);
  }
  if (Array.isArray(s?.timers)) s.timers.forEach((t: unknown, i: number) => walkTimerKeys(t, `${loc}.timers[${i}]`, issues));
  if (Array.isArray(s?.paths)) s.paths.forEach((p: unknown, i: number) => walkPathKeys(p, `${loc}.paths[${i}]`, issues));
}

/** Every key not declared by the corresponding schema, at any depth of the
 * authored body — process, contract, field (incl. nested group fields),
 * data source, workflow, step, path, action, timer, view field, validation. */
function checkUnknownKeys(body: unknown): CompileIssue[] {
  const issues: CompileIssue[] = [];
  if (!isPlainObject(body)) return issues;

  checkKnownKeys(body, PROCESS_BODY_KEYS, "", issues);
  if (isPlainObject(body.contract)) checkKnownKeys(body.contract, CONTRACT_KEYS, "contract", issues);
  if (Array.isArray(body.dataSources)) {
    body.dataSources.forEach((d: unknown, i: number) => checkKnownKeys(d, DATA_SOURCE_DEF_KEYS, `dataSources[${i}]`, issues));
  }
  walkFieldsIndexed(body.fields as unknown[] | undefined, "fields", (f, floc) => walkFieldDefKeys(f, floc, issues));
  if (isPlainObject(body.workflow)) {
    checkKnownKeys(body.workflow, WORKFLOW_KEYS, "workflow", issues);
    if (Array.isArray(body.workflow.steps)) {
      body.workflow.steps.forEach((s: unknown, i: number) => walkStepKeys(s, `workflow.steps[${i}]`, issues));
    }
  }
  return issues;
}

// ============================================================
// 4. Pattern compilation + length (task 4). Owns the pattern length bound
// (task 4.2) exclusively — checkLengthBounds below does not also visit
// `validation.pattern`, so a single over-long pattern is reported once.
// ============================================================

function checkPatterns(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f, floc) => {
    const pattern = f?.validation?.pattern;
    if (typeof pattern !== "string") return;
    const loc = `${floc}.validation.pattern`;
    if (pattern.length > MAX_PATTERN_LENGTH) {
      issues.push({ loc, value: pattern, message: `pattern exceeds the ${MAX_PATTERN_LENGTH}-character bound` });
      return; // do not also attempt to compile an oversized pattern
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern);
    } catch {
      issues.push({ loc, value: pattern, message: "pattern does not compile as a JavaScript RegExp" });
    }
  });
  return issues;
}

// ============================================================
// 5. Id resolution for outputMapping and contract field lists (task 5).
// Reuses collectFieldsDeep (task 5.1) — safe to call on the raw authored
// value, since it only duck-types `.fields`, no Zod parse required.
// ============================================================

function checkIdResolution(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFields = collectFieldsDeep((body.fields ?? []) as any);
  const fieldIds = new Set(allFields.map((f) => f.id as string));

  body.workflow.steps.forEach((s, si) => {
    const mapping = s.subprocess?.outputMapping;
    if (mapping) {
      Object.keys(mapping).forEach((fid) => {
        if (!fieldIds.has(fid)) {
          issues.push({
            loc: `steps[${si}].subprocess.outputMapping`,
            value: fid,
            message: `outputMapping key does not resolve to a field in this process: ${fid}`,
          });
        }
      });
    }
  });

  const contract = body.contract;
  if (contract) {
    (contract.inputFields ?? []).forEach((fid, i) => {
      if (!fieldIds.has(fid)) {
        issues.push({ loc: `contract.inputFields[${i}]`, value: fid, message: `contract.inputFields entry does not resolve to a field: ${fid}` });
      }
    });
    (contract.outputFields ?? []).forEach((fid, i) => {
      if (!fieldIds.has(fid)) {
        issues.push({ loc: `contract.outputFields[${i}]`, value: fid, message: `contract.outputFields entry does not resolve to a field: ${fid}` });
      }
    });
  }
  return issues;
}

// ============================================================
// 6. Field key format (task 6.1) and length bounds (tasks 6.2-6.4).
// ============================================================

/** The intersection of a CEL identifier and this repo's slug style — what
 * `data.<key>` requires to be referenceable at all. Lowercase only: the
 * catalog already treats keys as lowercase slugs. */
const FIELD_KEY_FORMAT = /^[a-z_][a-z0-9_]*$/;

function checkFieldKeyFormat(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f, floc) => {
    const key = f?.key;
    if (typeof key !== "string" || !FIELD_KEY_FORMAT.test(key)) {
      issues.push({ loc: `${floc}.key`, value: String(key), message: "field key must match /^[a-z_][a-z0-9_]*$/ to be a valid CEL identifier" });
    }
  });
  return issues;
}

interface PluginTypeSite {
  value: string;
  loc: string;
}

/** Every Plugin.type site: action.type (all five positions), dataSource.type,
 * view.renderer.type, assignment.strategy.type, and a plugin-typed field's
 * `type.type`. */
function collectPluginTypeSites(body: ProcessBody): PluginTypeSite[] {
  const sites: PluginTypeSite[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushType = (obj: any, loc: string) => {
    if (obj && typeof obj.type === "string") sites.push({ value: obj.type, loc: `${loc}.type` });
  };

  collectActionSites(body).forEach(({ action: a, loc }) => pushType(a, loc));
  (body.dataSources ?? []).forEach((d, i) => pushType(d, `dataSources[${i}]`));
  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    if (s.view?.renderer) pushType(s.view.renderer, `${sloc}.view.renderer`);
    if (s.assignment?.strategy) pushType(s.assignment.strategy, `${sloc}.assignment.strategy`);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  collectFieldsDeep((body.fields ?? []) as any).forEach((f: any, i: number) => {
    if (f.type && typeof f.type === "object") pushType(f.type, `fields[${i}].type`);
  });
  return sites;
}

interface ExpressionSite {
  src: string;
  loc: string;
}

/** Every Expression.src site in the body: field validation.rule + default,
 * path guards, every Action.output value (all five action positions), timer
 * deadlines, view field visible/required/readonly, and subprocess
 * input/outputMapping values. Deliberately independent of src/cel/check.ts's
 * own `collect()` — that one also needs scope flags for type-checking, this
 * one needs only `{src, loc}` for a length bound. */
function collectExpressionSites(body: ProcessBody): ExpressionSite[] {
  const sites: ExpressionSite[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asExpr = (v: any): { src: string } | undefined =>
    v && typeof v === "object" && v.lang === "cel" && typeof v.src === "string" ? v : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (v: any, loc: string) => {
    const e = asExpr(v);
    if (e) sites.push({ src: e.src, loc });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushOutputs = (actions: any[] | undefined, loc: string) => {
    (actions ?? []).forEach((a, i) => {
      Object.entries(a?.output ?? {}).forEach(([fid, e]) => push(e, `${loc}[${i}].output.${fid}`));
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f, floc) => {
    push(f?.validation?.rule, `${floc}.validation.rule`);
    push(f?.default, `${floc}.default`);
  });

  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    pushOutputs(s.onEntry, `${sloc}.onEntry`);
    pushOutputs(s.onExit, `${sloc}.onExit`);
    pushOutputs(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => {
      push(p.guard, `${sloc}.paths[${pi}].guard`);
      pushOutputs(p.onPath, `${sloc}.paths[${pi}].onPath`);
    });
    (s.timers ?? []).forEach((t, ti) => {
      push(t.deadline, `${sloc}.timers[${ti}].deadline`);
      pushOutputs(t.onFire.actions, `${sloc}.timers[${ti}].onFire`);
    });
    (s.view?.fields ?? []).forEach((vf, vi) => {
      push(vf.visible, `${sloc}.view.fields[${vi}].visible`);
      push(vf.required, `${sloc}.view.fields[${vi}].required`);
      push(vf.readonly, `${sloc}.view.fields[${vi}].readonly`);
    });
    if (s.subprocess) {
      Object.entries(s.subprocess.inputMapping ?? {}).forEach(([fid, e]) => push(e, `${sloc}.subprocess.inputMapping.${fid}`));
      Object.entries(s.subprocess.outputMapping ?? {}).forEach(([fid, e]) => push(e, `${sloc}.subprocess.outputMapping.${fid}`));
    }
  });

  return sites;
}

interface DurationSite {
  value: string;
  loc: string;
}

/** Every duration-typed value: Timer.duration, Action.timeout,
 * retry.baseDelay. A deliberately independent traversal from
 * validateDurations above (same position set, different concern: length, not
 * grammar) — matches the repo's existing pattern of parallel `collect()`
 * walks per concern (src/cel/check.ts vs src/engine/registry-check.ts). */
function collectDurationSites(body: ProcessBody): DurationSite[] {
  const sites: DurationSite[] = [];
  const fromActions = (list: Action[] | undefined, loc: string) =>
    (list ?? []).forEach((a, i) => {
      if (a.timeout !== undefined) sites.push({ value: a.timeout, loc: `${loc}[${i}].timeout` });
      if (a.retry?.baseDelay !== undefined) sites.push({ value: a.retry.baseDelay, loc: `${loc}[${i}].retry.baseDelay` });
    });
  body.workflow.steps.forEach((s, si) => {
    const sloc = `steps[${si}]`;
    fromActions(s.onEntry, `${sloc}.onEntry`);
    fromActions(s.onExit, `${sloc}.onExit`);
    fromActions(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => fromActions(p.onPath, `${sloc}.paths[${pi}].onPath`));
    (s.timers ?? []).forEach((t, ti) => {
      if (t.duration !== undefined) sites.push({ value: t.duration, loc: `${sloc}.timers[${ti}].duration` });
      fromActions(t.onFire.actions, `${sloc}.timers[${ti}].onFire`);
    });
  });
  return sites;
}

/** Length bounds on key, Plugin.type, duration and Expression.src — every
 * authored string that reaches an interpreter or an index. Does NOT visit
 * `validation.pattern`: checkPatterns above owns that bound exclusively. */
function checkLengthBounds(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f, floc) => {
    if (typeof f?.key === "string" && f.key.length > MAX_KEY_LENGTH) {
      issues.push({ loc: `${floc}.key`, value: f.key, message: `key exceeds the ${MAX_KEY_LENGTH}-character bound` });
    }
  });

  collectPluginTypeSites(body).forEach(({ value, loc }) => {
    if (value.length > MAX_PLUGIN_TYPE_LENGTH) {
      issues.push({ loc, value, message: `type exceeds the ${MAX_PLUGIN_TYPE_LENGTH}-character bound` });
    }
  });

  collectExpressionSites(body).forEach(({ src, loc }) => {
    if (src.length > MAX_EXPRESSION_LENGTH) {
      issues.push({ loc, value: src, message: `expression source exceeds the ${MAX_EXPRESSION_LENGTH}-character bound` });
    }
  });

  collectDurationSites(body).forEach(({ value, loc }) => {
    if (value.length > MAX_DURATION_LENGTH) {
      issues.push({ loc, value, message: `duration exceeds the ${MAX_DURATION_LENGTH}-character bound` });
    }
  });

  return issues;
}

/**
 * Every structural write-path check this change adds, run together and
 * reported as one batch of located issues (task 1.1/1.2). Called from
 * `compileProcessBody` on the raw body, before either compile branch, so
 * neither the authored-input branch nor the already-compiled early return can
 * skip it. `checkReservedActionPrefix` and `checkUnknownKeys` operate on the
 * body duck-typed (it has not yet been Zod-parsed at this point); the
 * remaining four operate on the `ProcessBody`-typed parameter, which is a
 * lie at this exact call site for the same reason — the type is honest again
 * only after `authoredProcessBody.parse`/the early return's `safeParse`
 * succeed.
 */
function structuralIssues(body: ProcessBody): CompileIssue[] {
  return [
    ...checkReservedActionPrefix(body),
    ...checkUnknownKeys(body),
    ...checkPatterns(body),
    ...checkIdResolution(body),
    ...checkFieldKeyFormat(body),
    ...checkLengthBounds(body),
  ];
}

export function compileProcessBody(body: ProcessBody): ProcessBody {
  // Before the idempotent return, so re-compiling an already-compiled body
  // checks the same values rather than trusting the shape.
  const durations = validateDurations(body);
  if (durations.length > 0) throw new DurationValidationError(durations);

  // The six structural checks (harden-publish-validation), same placement as
  // validateDurations and for the same reason: ahead of the
  // publishedProcessBody-valid early return below, so a hand-written body
  // that merely satisfies that schema (which checks only the cancel-sink
  // count) cannot skip any of them.
  const structural = structuralIssues(body);
  if (structural.length > 0) throw new CompileValidationError(structural);

  // Idempotent: an already-compiled (published-valid) body is a no-op. A body
  // that merely collides with the reserved identity is NOT published-valid and
  // falls through to authored validation below, which rejects it.
  const compiled = publishedProcessBody.safeParse(body);
  if (compiled.success) return compiled.data;

  // The parse OUTPUT is what gets compiled, hashed and stored: the schemas strip
  // undeclared content, so returning the input instead would let an unknown key
  // into definitionHash that every read then strips back out, leaving the pin
  // unreproducible and its instances unrehydratable.
  const parsed = authoredProcessBody.parse(body); // also rejects reserved-identity collisions

  const contracted = parsed.contract !== undefined;

  const sink: Step = {
    id: CANCEL_SINK_STEP_ID,
    key: CANCEL_SINK_KEY,
    // Known limitation (design.md D4): this synthesized string has no
    // translation table, so a non-English baseLocale sees the literal
    // English word under its own base-locale key.
    label: { en: "Cancelled", [parsed.baseLocale]: "Cancelled" },
    type: "task",
    terminal: true,
    ...(contracted ? { outcome: RESERVED_CANCEL_OUTCOME } : {}),
  };

  const contract = contracted
    ? { ...parsed.contract!, outcomes: [...(parsed.contract!.outcomes ?? []), RESERVED_CANCEL_OUTCOME] }
    : parsed.contract;

  return {
    ...parsed,
    contract,
    workflow: { ...parsed.workflow, steps: [...parsed.workflow.steps, sink] },
  };
}

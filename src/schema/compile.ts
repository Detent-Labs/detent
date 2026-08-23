/**
 * Publish-time compile pass.
 *
 * Validates every duration-typed value (see `validateDurations`) and the eight
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
 * Every check in this module — durations and the eight structural checks alike —
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
 * clean). Lives here, not as a Zod refinement, on arming totality: a duration
 * timer's `fireAt` computes inside the transition commit, so an unvalidated
 * duration makes its target step unreachable for every instance of the
 * definition, not just one — see `definition-contract`'s placement rule.
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
// Structural write-path checks. Eight checks, one placement: called from
// compileProcessBody immediately after validateDurations, so every one of
// them runs on a body BEFORE it takes either compile branch. Modelled on
// DurationIssue/DurationValidationError — same {loc, value, message} shape —
// because a second, structurally identical pair would only be a naming
// difference; issues are reported against `Error#issues`, never thrown one
// at a time, so one rejection is fixable in one pass.
// ============================================================

/** A structural authoring-time defect located in the body (unknown key, reserved
 * prefix, uncompilable pattern, unresolved id, an out-of-bounds columnMapping,
 * malformed field key, an over-long authored string, or an unsatisfiable
 * required+readonly view entry). */
export interface CompileIssue {
  loc: string;
  value: string;
  message: string;
}

/** A body about to be published violates one of the eight structural write-path checks. */
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

// ---- Zod-shape introspection: `unwrapSchema` strips the wrapper types the
// schemas actually use — `z.lazy()` (fieldDef's self-reference) and the
// optional/nullable/default wrappers — down to the substantive node whose
// `_zod.def.type` the generic walker below (checkUnknownKeys) dispatches on.
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
// 3. Unknown-key rejection (task 3). One generic walker recurses the live Zod
// schema tree (via `unwrapSchema` and each node's `_zod.def`) alongside the
// raw, duck-typed body — no hand-mirrored key list or recursion shape per
// nesting level, so a key or a level added to definition.ts needs no
// companion edit here. Record-typed positions (localizedText, Action.output,
// SubprocessSpec.*Mapping, Plugin.config) are never checked for unknown keys
// on their OWN keys — those are data (locale codes, field ids), not a fixed
// shape — but a record's VALUES are still walked when the value schema has
// its own fixed shape (an Expression).
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkKnownKeys(value: any, known: Set<string>, loc: string, issues: CompileIssue[]): void {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!known.has(key)) issues.push({ loc: loc ? `${loc}.${key}` : key, value: key, message: `unknown key '${key}'` });
  }
}

/** Zod types that can never structurally produce a plain-object value — the
 * "definitely a primitive" half of `unionObjectMatch`'s dispatch rule.
 * Anything NOT in this set and not itself `"object"` (a `union`, `record`,
 * `array`, or unresolved `lazy`) stays ambiguous: it could ALSO be a plain
 * object at some depth (`Literal`, via `z.record(z.string(), literal)`), so
 * type alone cannot rule it out. */
const LEAF_TYPES = new Set([
  "string", "number", "boolean", "null", "bigint", "enum", "literal",
  "undefined", "void", "never", "any", "unknown", "nan", "symbol", "date",
]);

/**
 * Picks the union member schema a plain-object `value` structurally belongs
 * to, or `undefined` when no member can be matched with confidence. `options`
 * are the union's own member schemas, unwrapped here.
 *
 * General rule: exactly one member unwraps to an object schema, and every
 * other member is a definite leaf type (`LEAF_TYPES`) that can never be a
 * plain object — so that one object member is the unambiguous match. This
 * covers `FieldDef.type` (`BaseFieldType | Plugin`) and the three
 * `ViewField.visible`/`.required`/`.readonly` sites (`boolean | Expression`).
 *
 * `FieldDef.default` (`Expression | Literal`) does not fit that rule:
 * `Literal` unwraps to a `union`, not a `LEAF_TYPES` member, since it
 * recurses through `z.record(z.string(), literal)` and so can ALSO be a
 * plain object. This function does not try to resolve that ambiguity
 * generically (design.md's Risk section calls out exactly this: no
 * best-effort resolver that tries every member). It dispatches this one
 * case the way the original hand-written check did: an Expression-shaped
 * object always carries a string `lang`. Any other plain-object value is
 * left unmatched, which is the correct answer for an opaque `Literal` — no
 * key-set check, no recursion into it at all.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unionObjectMatch(options: any[], value: Record<string, unknown>): z.ZodTypeAny | undefined {
  const unwrapped = options.map((m) => unwrapSchema(m));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeOf = (m: any): string | undefined => m?._zod?.def?.type;
  const objectMembers = unwrapped.filter((m) => typeOf(m) === "object");
  const ambiguousMembers = unwrapped.filter((m) => typeOf(m) !== "object" && !LEAF_TYPES.has(typeOf(m) ?? ""));

  // No known union site in this schema produces zero or two-plus object
  // members; stay narrow rather than guess at one.
  if (objectMembers.length !== 1) return undefined;
  const candidate = objectMembers[0];
  if (ambiguousMembers.length === 0) return candidate;

  const shape = (candidate as unknown as { shape: Record<string, unknown> }).shape;
  return shape && "lang" in shape && typeof value.lang === "string" ? candidate : undefined;
}

/**
 * The generic walker (tasks 2.2/2.3). Dispatches on the live schema node's
 * `_zod.def.type`, reading each object's `.shape`, each array's `.element`,
 * each record's `.valueType`, and each union's `.options` at the moment of
 * visiting that node — a schema change then needs no mirror updated here.
 *
 * - object: check `value`'s own keys against `Object.keys(shape)`, then
 *   recurse into each declared key the value also carries, against that
 *   key's own sub-schema.
 * - array: recurse into each element against the element schema,
 *   index-chaining `loc` (`foo[0]`, `foo[1]`) — the same pattern
 *   `walkFieldsIndexed` and `collectActionSites` use elsewhere in this file.
 * - record: skip the value's own keys — they are data (locale codes, field
 *   ids), never a fixed shape — and recurse into the declared value-schema
 *   for each entry's value.
 * - union: recurse into whichever member `unionObjectMatch` resolves to; no
 *   match reports nothing here — some other structural check, or the
 *   eventual Zod parse, reports the real type mismatch. This walker's only
 *   job is "extra key," never "wrong type."
 * - anything else (primitives, `ZodLiteral`): no keys to check, no
 *   recursion.
 *
 * Operates on `unknown`/duck-typed input, like the rest of this section: it
 * runs BEFORE any Zod parse of the authored body, on both compile branches.
 */
function walkSchema(schema: z.ZodTypeAny, value: unknown, loc: string, issues: CompileIssue[]): void {
  const s = unwrapSchema(schema);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (s as any)?._zod?.def;
  if (!def) return;

  switch (def.type) {
    case "object": {
      const shape = (s as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
      checkKnownKeys(value, new Set(Object.keys(shape)), loc, issues);
      if (!isPlainObject(value)) return;
      for (const key of Object.keys(shape)) {
        if (key in value) walkSchema(shape[key], (value as Record<string, unknown>)[key], loc ? `${loc}.${key}` : key, issues);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) return;
      value.forEach((el, i) => walkSchema(def.element, el, `${loc}[${i}]`, issues));
      return;
    }
    case "record": {
      if (!isPlainObject(value)) return;
      for (const [key, v] of Object.entries(value)) walkSchema(def.valueType, v, loc ? `${loc}.${key}` : key, issues);
      return;
    }
    case "union": {
      if (!isPlainObject(value)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = unionObjectMatch(def.options as any[], value as Record<string, unknown>);
      if (match) walkSchema(match, value, loc, issues);
      return;
    }
    default:
      return;
  }
}

/** Every key not declared by the corresponding schema, at any depth of the
 * authored body — process, contract, field (incl. nested group fields), data
 * source, workflow, step, path, action, timer, view field, validation. One
 * call from `processBody`'s root object schema reaches every one of those
 * positions: the object branch above recurses into every key the schema
 * declares that the value also carries, so nothing needs wiring position by
 * position the way the old per-level `walkFooKeys` functions did. */
function checkUnknownKeys(body: unknown): CompileIssue[] {
  const issues: CompileIssue[] = [];
  if (!isPlainObject(body)) return issues;
  walkSchema(processBody, body, "", issues);
  return issues;
}

// ============================================================
// 4. Pattern compilation + length (task 4). Owns the pattern length bound
// (task 4.2) exclusively — checkLengthBounds below does not also visit
// `validation.pattern`, so a single over-long pattern is reported once.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkPatterns(f: any, floc: string, issues: CompileIssue[]): void {
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

/**
 * `FieldDef.columnMapping` bounds. Seven rules, all write-path: a hand-written
 * body could satisfy `publishedProcessBody` while breaking one, so
 * `definition-contract`'s unbypassable-check criterion places them here.
 *
 * It does NOT check a key against any data list. `db-data-source-type` keeps
 * publishing independent of the state of the data, so a key naming no declared
 * column publishes and writes nothing at runtime.
 *
 * Safe to run on an already-published body, which `structuralIssues` does: no
 * body written before this key existed carries a `columnMapping`, so an
 * identical re-publish cannot newly fail.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkColumnMapping(f: any, floc: string, fieldsById: Map<string, any>, issues: CompileIssue[]): void {
  const mapping = f?.columnMapping;
  if (!isPlainObject(mapping)) return;
  const loc = `${floc}.columnMapping`;

  if (f.dataSource === undefined) {
    issues.push({ loc, value: String(f.id), message: "columnMapping needs a dataSource: an inline options array declares no columns" });
  }
  if (f.type !== "select") {
    issues.push({ loc, value: String(f.type), message: "columnMapping needs a select field: a multiselect picks several rows for one target" });
  }

  const seenTargets = new Map<string, string>();
  for (const [column, target] of Object.entries(mapping)) {
    if (!FIELD_KEY_FORMAT.test(column)) {
      issues.push({ loc: `${loc}.${column}`, value: column, message: "columnMapping key must match /^[a-z_][a-z0-9_]*$/" });
    }
    if (column.length > MAX_KEY_LENGTH) {
      issues.push({ loc: `${loc}.${column}`, value: column, message: `columnMapping key exceeds the ${MAX_KEY_LENGTH}-character bound` });
    }
    const tid = String(target);
    const targetField = fieldsById.get(tid);
    if (!targetField) {
      issues.push({ loc: `${loc}.${column}`, value: tid, message: `columnMapping target does not resolve to a field in this process: ${tid}` });
    } else if (targetField.type === "group") {
      issues.push({ loc: `${loc}.${column}`, value: tid, message: "columnMapping target is a group field, which takes no value" });
    }
    if (tid === String(f.id)) {
      issues.push({ loc: `${loc}.${column}`, value: tid, message: "columnMapping target is the mapping field itself" });
    }
    const prior = seenTargets.get(tid);
    if (prior !== undefined) {
      issues.push({ loc: `${loc}.${column}`, value: tid, message: `columnMapping targets one field twice: '${prior}' and '${column}' both write ${tid}` });
    } else {
      seenTargets.set(tid, column);
    }
  }
}

// ============================================================
// 6. Field key format (task 6.1) and length bounds (tasks 6.2-6.4).
// ============================================================

/** The intersection of a CEL identifier and this repo's slug style — what
 * `data.<key>` requires to be referenceable at all. Lowercase only: the
 * catalog already treats keys as lowercase slugs. */
const FIELD_KEY_FORMAT = /^[a-z_][a-z0-9_]*$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkFieldKeyFormat(f: any, floc: string, issues: CompileIssue[]): void {
  const key = f?.key;
  if (typeof key !== "string" || !FIELD_KEY_FORMAT.test(key)) {
    issues.push({ loc: `${floc}.key`, value: String(key), message: "field key must match /^[a-z_][a-z0-9_]*$/ to be a valid CEL identifier" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkFieldExpressionLength(f: any, floc: string, issues: CompileIssue[]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkExpr = (v: any, loc: string) => {
    if (v && typeof v === "object" && v.lang === "cel" && typeof v.src === "string" && v.src.length > MAX_EXPRESSION_LENGTH) {
      issues.push({ loc, value: v.src, message: `expression source exceeds the ${MAX_EXPRESSION_LENGTH}-character bound` });
    }
  };
  checkExpr(f?.validation?.rule, `${floc}.validation.rule`);
  checkExpr(f?.default, `${floc}.default`);
}

/** One pass over `body.fields`, running `checkPatterns`, `checkColumnMapping`,
 * `checkFieldKeyFormat`, `checkFieldExpressionLength`, and the field-key-length
 * bound together per field, in that fixed sequence. `fieldsById` is built once,
 * over the whole tree, since `checkColumnMapping` alone resolves a mapping
 * target that can name any field in the process, not only the one under walk. */
function checkFieldTree(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFields = collectFieldsDeep((body.fields ?? []) as any);
  const fieldsById = new Map(allFields.map((f) => [f.id as string, f]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f, floc) => {
    checkPatterns(f, floc, issues);
    checkColumnMapping(f, floc, fieldsById, issues);
    checkFieldKeyFormat(f, floc, issues);
    checkFieldExpressionLength(f, floc, issues);
    if (typeof f?.key === "string" && f.key.length > MAX_KEY_LENGTH) {
      issues.push({ loc: `${floc}.key`, value: f.key, message: `key exceeds the ${MAX_KEY_LENGTH}-character bound` });
    }
  });
  return issues;
}

/** Every step view field's `validation.pattern`, checked with the same
 * `checkPatterns` the catalog tree above uses. `checkPatterns` reads
 * `f?.validation?.pattern` off whatever `floc`-prefixed object it is given,
 * so a view field entry passes through it unchanged and the resulting issue
 * locates by step and field. */
function checkViewFieldPatterns(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  body.workflow.steps.forEach((s, si) => {
    (s.view?.fields ?? []).forEach((vf, vi) => {
      checkPatterns(vf, `steps[${si}].view.fields[${vi}]`, issues);
    });
  });
  return issues;
}

interface PluginTypeSite {
  value: string;
  loc: string;
}

/** Every Plugin.type site: action.type (all five positions), dataSource.type,
 * assignment.strategy.type, and a plugin-typed field's `type.type`. */
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

/** Every Expression.src site outside the field tree: path guards, every
 * Action.output value (all five action positions), timer deadlines, view
 * field visible/required/readonly, and subprocess input/outputMapping
 * values. A field's own `validation.rule` and `default` are bounded inside
 * `checkFieldTree`'s own pass instead (`checkFieldExpressionLength`), not
 * here. Deliberately independent of src/cel/check.ts's own `collect()` —
 * that one also needs scope flags for type-checking, this one needs only
 * `{src, loc}` for a length bound. */
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
      push(vf.validation?.rule, `${sloc}.view.fields[${vi}].validation.rule`);
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

/** Length bounds on Plugin.type, duration and every non-field-tree
 * Expression.src — every authored string that reaches an interpreter or an
 * index, outside `body.fields`. Does NOT visit `validation.pattern`:
 * checkPatterns above owns that bound exclusively. The field-key-length
 * bound and a field's own `validation.rule`/`default` expression length
 * live in `checkFieldTree` instead, alongside the other per-field checks. */
function checkLengthBounds(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];

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

// ============================================================
// 7. Technical field marker (task 1.2): reject `technical: true` on a group
// field, and reject a view entry naming a technical field that declares
// `required` or `readonly` at all. Both rules test `technical === true`
// alone, never truthiness. Neither nests inside checkFieldTree or
// checkViewFieldPatterns: a technical group field with no view entry must
// still reach the group check. Operates on duck-typed input, like
// checkReservedActionPrefix and checkUnknownKeys: it runs before any Zod
// parse of the authored body, on both compile branches.
// ============================================================

function checkTechnicalFields(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  const technicalIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walkFieldsIndexed(body.fields as any, "fields", (f) => {
    if (f?.technical !== true) return;
    if (typeof f?.id !== "string") return;
    technicalIds.add(f.id);
    if (f.type === "group") {
      issues.push({
        loc: `fields.${f.id}.technical`,
        value: String(f.type),
        message: "a group field must not declare technical: true",
      });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (body.workflow?.steps ?? []).forEach((s: any, si: number) => {
    (s?.view?.fields ?? []).forEach((vf: any, vi: number) => {
      if (typeof vf?.ref !== "string" || !technicalIds.has(vf.ref)) return;
      if ("required" in vf) {
        issues.push({
          loc: `steps[${si}].view.fields[${vi}].required`,
          value: JSON.stringify(vf.required),
          message: "a technical field's view entry must not declare required",
        });
      }
      if ("readonly" in vf) {
        issues.push({
          loc: `steps[${si}].view.fields[${vi}].readonly`,
          value: JSON.stringify(vf.readonly),
          message: "a technical field's view entry must not declare readonly",
        });
      }
    });
  });

  return issues;
}

// ============================================================
// 8. Unsatisfiable required+readonly pair: reject a view entry declaring
// literal required: true and literal readonly: true on a step carrying a
// manual path, when no source in the body writes the field it names. The
// participant cannot type into a readonly field, and the required check
// then refuses to advance the step, so nothing can clear the result.
//
// Counterpart to the studio's `writtenFieldCounts`
// (packages/web/src/areas/studio/draft/view-flags.ts), duplicated here
// rather than imported — the dependency direction forbids the import, and
// the studio walks a Draft (every key optional) while this walks a
// ProcessBody. Two documented divergences from the studio's version: the
// post-gate exclusion (an action on the entry's own step at
// onExit/onPath/onCancel fires only after the submission gate it cannot
// help, so its output does not count, and likewise a columnMapping target
// whose mapping field is editable only on the entry's own step) and the
// literal-default source (a literal catalog default lands via
// `applyFieldDefaults` at instance creation, which the studio does not
// count). See design.md § Decisions for the full reasoning.
//
// Operates on duck-typed input, like checkReservedActionPrefix,
// checkUnknownKeys and checkTechnicalFields: it runs before any Zod parse
// of the authored body, on both compile branches.
// ============================================================

/** A `FieldDef.default` counts as a writer only when literal — mirrors
 * `applyFieldDefaults`' own `asExpression` (src/runtime/api.ts): an
 * Expression-shaped object (`{lang: "cel", ...}`) may raise at creation and
 * leave the field unwritten, so only a non-CEL value counts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isLiteralDefault(v: any): boolean {
  return !(v && typeof v === "object" && !Array.isArray(v) && v.lang === "cel");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stepHasManualPath(s: any): boolean {
  return (s?.paths ?? []).some((p: any) => p?.trigger === "manual");
}

/**
 * Every field id some source in the body writes, relative to the step under
 * check (`ownStepIndex`): the post-gate exclusion and the columnMapping
 * editable-elsewhere rule are both relative to that step, so this cannot be
 * one body-wide set the way most of this module's other collectors are.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeWriterSet(body: any, ownStepIndex: number): Set<string> {
  const written = new Set<string>();
  const steps = body?.workflow?.steps ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = collectFieldsDeep((body?.fields ?? []) as any);
  const fieldsById = new Map(fields.map((f) => [f.id as string, f]));

  // Action output (1.2): onEntry always counts; onExit/onPath/onCancel count
  // only off the entry's own step, since on that step they fire after the
  // submission gate they cannot help. onFire always counts — a reminder
  // timer's write-back precedes the participant's resubmission, and a
  // targetPath timer's forced exit runs no required check at all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps.forEach((s: any, si: number) => {
    const own = si === ownStepIndex;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addOutputs = (actions: any[] | undefined) => {
      (actions ?? []).forEach((a) => Object.keys(a?.output ?? {}).forEach((fid) => written.add(fid)));
    };
    addOutputs(s?.onEntry);
    if (!own) {
      addOutputs(s?.onExit);
      addOutputs(s?.onCancel);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s?.paths ?? []).forEach((p: any) => addOutputs(p?.onPath));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s?.timers ?? []).forEach((t: any) => addOutputs(t?.onFire?.actions));

    // subprocess.outputMapping (1.3), body-wide.
    Object.keys(s?.subprocess?.outputMapping ?? {}).forEach((fid) => written.add(fid));
  });

  // Editable view entries (1.6): visible !== false, readonly !== true, not a
  // group field, carries a ref. Body-wide — the entry under check always
  // declares readonly: true, so it never counts itself. Also tracks, per
  // field, which step indices carry such an entry, for the columnMapping
  // rule below.
  const editableSteps = new Map<string, Set<number>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps.forEach((s: any, si: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s?.view?.fields ?? []).forEach((vf: any) => {
      if (typeof vf?.ref !== "string") return;
      if (fieldsById.get(vf.ref)?.type === "group") return;
      if (vf.visible === false || vf.readonly === true) return;
      written.add(vf.ref);
      if (!editableSteps.has(vf.ref)) editableSteps.set(vf.ref, new Set());
      editableSteps.get(vf.ref)!.add(si);
    });
  });

  // contract.inputFields (1.4), body-wide.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (body?.contract?.inputFields ?? []).forEach((fid: any) => {
    if (typeof fid === "string") written.add(fid);
  });

  // columnMapping targets (1.4): count only where some step OTHER than
  // ownStepIndex carries the mapping field in an editable view entry — the
  // write-back (applyColumnMapping) runs after the submission gate, so a
  // mapping field editable only on the entry's own step, or on no step at
  // all, can never satisfy that gate.
  fields.forEach((f) => {
    const mapping = f.columnMapping;
    if (!isPlainObject(mapping)) return;
    const editSteps = editableSteps.get(f.id as string) ?? new Set<number>();
    if (![...editSteps].some((si) => si !== ownStepIndex)) return;
    Object.values(mapping).forEach((target) => {
      if (typeof target === "string") written.add(target);
    });
  });

  // Literal catalog defaults (1.5), body-wide: applyFieldDefaults seeds one
  // into instance.data at creation.
  fields.forEach((f) => {
    if (f.default === undefined) return;
    if (isLiteralDefault(f.default)) written.add(f.id as string);
  });

  return written;
}

function checkUnsatisfiableRequiredReadonly(body: ProcessBody): CompileIssue[] {
  const issues: CompileIssue[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyBody = body as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fields = collectFieldsDeep((anyBody.fields ?? []) as any);
  const fieldsById = new Map(fields.map((f) => [f.id as string, f]));
  const technicalIds = new Set<string>();
  fields.forEach((f) => {
    if (f.technical === true && typeof f.id === "string") technicalIds.add(f.id);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (anyBody.workflow?.steps ?? []).forEach((s: any, si: number) => {
    if (!stepHasManualPath(s)) return;
    const writerSet = computeWriterSet(anyBody, si);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s?.view?.fields ?? []).forEach((vf: any, vi: number) => {
      if (typeof vf?.ref !== "string") return;
      if (vf.required !== true || vf.readonly !== true) return;
      if (vf.visible === false) return;
      if (fieldsById.get(vf.ref)?.type === "group") return;
      if (technicalIds.has(vf.ref)) return;
      if (writerSet.has(vf.ref)) return;
      issues.push({
        loc: `steps[${si}].view.fields[${vi}]`,
        value: vf.ref,
        message: `field '${vf.ref}' is required and readonly here, and no source in the body writes it: every submission will fail`,
      });
    });
  });

  return issues;
}

/**
 * Every structural write-path check, run together and reported as one batch
 * of located issues (task 1.1/1.2). Called from
 * `compileProcessBody` on the raw body, before either compile branch, so
 * neither the authored-input branch nor the already-compiled early return can
 * skip it. `checkReservedActionPrefix`, `checkUnknownKeys`,
 * `checkTechnicalFields` and `checkUnsatisfiableRequiredReadonly` operate on
 * the body duck-typed (it has not yet been Zod-parsed at this point); the
 * remaining four operate on the `ProcessBody`-typed parameter, which is a lie
 * at this exact call site for the same reason — the type is honest again
 * only after `authoredProcessBody.parse`/the early return's `safeParse`
 * succeed.
 */
function structuralIssues(body: ProcessBody): CompileIssue[] {
  return [
    ...checkReservedActionPrefix(body),
    ...checkUnknownKeys(body),
    ...checkFieldTree(body),
    ...checkViewFieldPatterns(body),
    ...checkIdResolution(body),
    ...checkLengthBounds(body),
    ...checkTechnicalFields(body),
    ...checkUnsatisfiableRequiredReadonly(body),
  ];
}

export function compileProcessBody(body: ProcessBody): ProcessBody {
  // Before the idempotent return, so re-compiling an already-compiled body
  // checks the same values rather than trusting the shape.
  const durations = validateDurations(body);
  if (durations.length > 0) throw new DurationValidationError(durations);

  // The eight structural checks, same placement as validateDurations and for
  // the same reason: ahead of the publishedProcessBody-valid early return
  // below, so a hand-written body that merely satisfies that schema (which
  // checks only the cancel-sink count) cannot skip any of them.
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

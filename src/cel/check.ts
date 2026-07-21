/**
 * Authoring-time CEL validation: parse + type-check every Expression in a
 * ProcessBody against the field catalog and the formal expression context.
 *
 * Lives outside definition.ts by design — it needs the CEL library, which the
 * contract module must not depend on. One library (@marcbachmann/cel-js) serves
 * both the parse/check here and the engine's later evaluate, so there is no
 * semantic drift.
 *
 * CEL references catalog fields by `key` (the human-readable slug), not `id`:
 * a `field_<uuid>` id is not a valid CEL identifier (hyphens), and per-field
 * type-checking needs each field declared as a named variable. Keys and the
 * expressions that reference them live in the same immutable ProcessBody, so a
 * key rename is a same-artifact rewrite — internally consistent per version.
 */

import { Environment, parse } from "@marcbachmann/cel-js";
import { collectFieldsDeep } from "../schema/definition.js";
import type { ProcessBody, FieldDef, BaseFieldType, Expression, MigrationSpec } from "../schema/definition.js";

// The formal expression context. instance/actor shapes are pinned here.
// ponytail: minimal shapes, widen when a real guard needs more.
// Exported as the single source of truth: the engine's runtime projection
// (src/cel/eval.ts) derives its whitelist from these keys, so the authoring
// context and the runtime instance namespace cannot drift.
export const INSTANCE_SCHEMA = { id: "string", status: "string", transitionSeq: "int", currentStepId: "string" } as const;
const ACTOR_SCHEMA = { id: "string", roles: "list<string>" } as const;
const CHILD_SCHEMA = { outcome: "string", data: "dyn" } as const; // child.data is plugin-shaped

/**
 * Catalog field type -> CEL type string.
 * ponytail: dyn for file / plugin field types / data sources until their plugin
 * output schemas are formalized; add real types when the registry lands.
 */
export function celType(t: BaseFieldType | object): string {
  if (typeof t !== "string") return "dyn"; // Plugin (custom) field type
  switch (t) {
    // ponytail: JSON numbers are IEEE doubles, so `double` is correct and catches
    // number-vs-string. Cost: CEL int literals don't `==`/`%` a double, so
    // `data.count == 5` needs `== 5.0` (or `int(...)` for `%`). Not fixable without
    // an int/float split in the catalog; left as a documented papercut.
    case "number": return "double";
    case "boolean": return "bool";
    case "multiselect": return "list<string>";
    case "file": return "dyn";
    case "string":
    case "date":
    case "datetime":
    case "select":
    case "reference": return "string";
    case "group": return "dyn"; // unreached as a leaf; group fields are recursed into
    default: return "dyn";
  }
}

/**
 * Flatten the catalog to key -> CEL type. `data` is flat, so a `group` field
 * (a container, not a leaf value) contributes nothing itself; only its
 * (possibly nested) leaves do. Built over `collectFieldsDeep`, the one
 * authoritative field-tree walk shared with `definition.ts` and `eval.ts`.
 */
function dataSchema(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of collectFieldsDeep(fields)) {
    if (typeof f.type === "string" && f.type === "group") continue;
    out[f.key] = celType(f.type);
  }
  return out;
}

/**
 * Build the type environment for a scope. Scope is expressed by which namespaces
 * are registered: `result` exists only in an Action.output mapping, `child` only
 * inside a subprocess step. Unregistered references are check-time errors
 * (unlistedVariablesAreDyn: false), so guard-forbidden `result`/`child`/`now()`
 * fail for free.
 *
 * A declared data source is registered at no site: the engine resolves data sources
 * nowhere (no guard/output/transform context carries one), so a CEL reference to one
 * could only park a wait-state forever (a total guard is `false`) or throw in
 * delivery (a mapping). Withholding it makes the reference an `unknown variable`
 * publish error instead. The `field.dataSource` options-binding is a separate path,
 * untouched here.
 *
 * Output scope is `result` and NOTHING else — not `data`, `instance`, `actor`,
 * `child`, or a data source. The writeback is dispatched post-commit and
 * delivered an unbounded interval after the action was enqueued, so instance
 * state at evaluation time is a different state than the one that enqueued it;
 * the engine accordingly supplies `{ result }` alone (`eval.ts::buildOutputContext`).
 * Registering more here would type-check an expression that then throws on every
 * delivery — re-invoking the external handler on each retry before dead-lettering.
 */
function buildEnv(
  body: ProcessBody,
  opts: { result: boolean; child: boolean; actor: boolean },
): Environment {
  const env = new Environment({ unlistedVariablesAreDyn: false });
  if (opts.result) {
    env.registerVariable("result", "dyn");
    return env;
  }
  env
    .registerVariable({ name: "data", schema: dataSchema(body.fields) })
    .registerVariable({ name: "instance", schema: { ...INSTANCE_SCHEMA } });
  // `actor` is registered everywhere except the migration transform site: a
  // migration is one operator action over a whole population, so admitting `actor`
  // would let a rule meant to be uniform produce different data per instance.
  if (opts.actor) env.registerVariable({ name: "actor", schema: { ...ACTOR_SCHEMA } });
  if (opts.child) env.registerVariable({ name: "child", schema: { ...CHILD_SCHEMA } });
  return env;
}

/**
 * Time constructors are forbidden anywhere in an expression: CEL is pure/total
 * with no wall-clock, and time-based transitions live only in timers. `now()`
 * (non-deterministic) and the pure constructors `timestamp()`/`duration()` are
 * all blocked so guards carry no time logic. Detected on the AST — a call node is
 * `{op:"call", args:[name, [...]]}` and string literals are `op:"value"`, so this
 * never false-matches a function name appearing inside a string.
 */
const FORBIDDEN_FUNCS = new Set(["now", "timestamp", "duration"]);

function forbiddenTimeCall(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as { op?: string; args?: unknown };
  if (n.op === "call" && Array.isArray(n.args) && typeof n.args[0] === "string" && FORBIDDEN_FUNCS.has(n.args[0]))
    return n.args[0];
  const args = Array.isArray(n.args) ? n.args : [];
  for (const a of args) {
    const kids = Array.isArray(a) ? a : [a];
    for (const k of kids) {
      const f = forbiddenTimeCall(k);
      if (f) return f;
    }
  }
  return null;
}

interface Site {
  src: string;
  loc: string;
  result: boolean; // Action.output mapping context (result visible)
  child: boolean; // inside a subprocess step (child.* visible)
  expect?: string; // required inferred result type; unconstrained when absent
}

const asExpr = (v: unknown): Expression | undefined =>
  v && typeof v === "object" && (v as { lang?: unknown }).lang === "cel" ? (v as Expression) : undefined;

/** Collect every Expression in the body with its scope and a locating path. */
function collect(body: ProcessBody): Site[] {
  const sites: Site[] = [];
  const push = (e: Expression | undefined, loc: string, result: boolean, child: boolean, expect?: string) => {
    if (e) sites.push({ src: e.src, loc, result, child, ...(expect ? { expect } : {}) });
  };
  // Action.output values are result scope, which registers `result` alone — so an
  // output site takes no `child` flag: the enclosing step's type cannot widen it.
  const outputs = (actions: readonly { output?: Record<string, unknown> }[] | undefined, loc: string) => {
    (actions ?? []).forEach((a, i) =>
      Object.entries(a.output ?? {}).forEach(([fid, e]) => push(asExpr(e), `${loc}.actions[${i}].output.${fid}`, true, false)),
    );
  };

  // Process-wide catalog: validation.rule + default. No step, so no result/child.
  const walkFields = (fs: FieldDef[], loc: string) => {
    fs.forEach((f, i) => {
      push(f.validation?.rule, `${loc}[${i}].validation.rule`, false, false);
      push(asExpr(f.default), `${loc}[${i}].default`, false, false);
      if (f.fields) walkFields(f.fields, `${loc}[${i}].fields`);
    });
  };
  walkFields(body.fields, "fields");

  body.workflow.steps.forEach((s, si) => {
    const child = s.type === "subprocess";
    const sloc = `steps[${si}]`;
    outputs(s.onEntry, `${sloc}.onEntry`);
    outputs(s.onExit, `${sloc}.onExit`);
    // onCancel actions are enqueued by cancelInstance and their outputs run through
    // the same evalOutput path, so they are a checked site like any other.
    outputs(s.onCancel, `${sloc}.onCancel`);
    (s.paths ?? []).forEach((p, pi) => {
      push(p.guard, `${sloc}.paths[${pi}].guard`, false, child);
      outputs(p.onPath, `${sloc}.paths[${pi}].onPath`);
    });
    (s.timers ?? []).forEach((t, ti) => {
      // A deadline is evaluated at step entry over the engine's guard context, which
      // is `{data, instance, actor}` and nothing else. `child` is therefore withheld
      // here that a subprocess step's guards get — a child instance does not exist
      // until the step is left (data sources are withheld at every site, not just
      // this one). It must also yield a string instant: the engine parses the value
      // and omits the timer when it is not one, and an omitted timer is
      // indistinguishable from an undeclared one at runtime. Each of these is a
      // publish error rather than a wait-state that silently loses its only bound.
      push(t.deadline, `${sloc}.timers[${ti}].deadline`, false, false, "string");
      outputs(t.onFire.actions, `${sloc}.timers[${ti}].onFire`);
    });
    (s.view?.fields ?? []).forEach((vf, vi) => {
      push(asExpr(vf.visible), `${sloc}.view.fields[${vi}].visible`, false, child);
      push(asExpr(vf.required), `${sloc}.view.fields[${vi}].required`, false, child);
      push(asExpr(vf.readonly), `${sloc}.view.fields[${vi}].readonly`, false, child);
    });
    if (s.subprocess) {
      Object.entries(s.subprocess.inputMapping).forEach(([fid, e]) =>
        push(asExpr(e), `${sloc}.subprocess.inputMapping.${fid}`, false, false),
      );
      Object.entries(s.subprocess.outputMapping).forEach(([fid, e]) =>
        push(asExpr(e), `${sloc}.subprocess.outputMapping.${fid}`, false, true),
      );
    }
  });

  return sites;
}

export interface CelIssue {
  loc: string;
  src: string;
  message: string;
}

/** Parse + type-check every Expression in the body. Returns [] when all are valid. */
export function validateProcessBody(body: ProcessBody): CelIssue[] {
  const issues: CelIssue[] = [];
  const cache = new Map<string, Environment>();
  const envFor = (result: boolean, child: boolean) => {
    const k = `${result}:${child}`;
    let e = cache.get(k);
    if (!e) {
      // Every ordinary site resolves `actor`; only the migration entry point,
      // which builds its own environment, withholds it — so the cache key stays
      // two-dimensional and no cached environment changes meaning.
      e = buildEnv(body, { result, child, actor: true });
      cache.set(k, e);
    }
    return e;
  };
  for (const site of collect(body)) {
    // Forbidden time constructors first (env.check would accept the pure ones).
    try {
      const bad = forbiddenTimeCall(parse(site.src).ast);
      if (bad) {
        issues.push({ loc: site.loc, src: site.src, message: `time function not allowed: ${bad}() (time lives only in timers)` });
        continue;
      }
    } catch {
      // parse failure is reported by the type-check below
    }
    let valid: boolean;
    let message: string | undefined;
    try {
      const r = envFor(site.result, site.child).check(site.src);
      valid = r.valid;
      message = r.error?.message ?? (r.valid ? undefined : "type error");
      // A site declaring an expected result type is satisfied by that type or by
      // `dyn` (a plugin field, whose type is not knowable here).
      if (valid && site.expect && r.type !== site.expect && r.type !== "dyn") {
        valid = false;
        message = `expected ${site.expect}, got ${r.type}`;
      }
    } catch (err) {
      valid = false;
      message = (err as Error).message;
    }
    if (!valid) issues.push({ loc: site.loc, src: site.src, message: message ?? "invalid expression" });
  }
  return issues;
}

/** Find a field's declared type by id, recursing groups. `undefined` = not declared. */
function fieldTypeById(fields: FieldDef[], id: string): BaseFieldType | object | undefined {
  for (const f of fields) {
    if (typeof f.type === "string" && f.type === "group") {
      if (f.fields) {
        const t = fieldTypeById(f.fields, id);
        if (t !== undefined) return t;
      }
    } else if (f.id === id) {
      return f.type;
    }
  }
  return undefined;
}

/**
 * Parse- and type-check a migration spec's `transforms`. Unlike every other CEL
 * site the check spans two bodies: a transform reads the instance's pre-migration
 * data, so its identifiers resolve against the **source** catalog, but it writes a
 * **target** field, so its result type is checked against the target's declaration.
 * The environment withholds `result`, `child`, data sources and `actor` — a
 * transform sees `data` (source catalog) and `instance` only. Issues are located
 * `migration.transforms.<fieldId>`.
 */
export function validateMigrationSpec(spec: MigrationSpec, fromBody: ProcessBody, toBody: ProcessBody): CelIssue[] {
  const issues: CelIssue[] = [];
  const env = buildEnv(fromBody, { result: false, child: false, actor: false });
  for (const [fid, expr] of Object.entries(spec.transforms ?? {})) {
    if (!expr) continue;
    const loc = `migration.transforms.${fid}`;
    // The written field must exist in the target catalog; its declared type is the
    // expected result type (dyn — a plugin field — passes, as at the deadline site).
    const targetType = fieldTypeById(toBody.fields, fid);
    if (targetType === undefined) {
      issues.push({ loc, src: expr.src, message: `transforms target ${fid} is not a field in the target catalog` });
      continue;
    }
    const expect = celType(targetType);
    try {
      const bad = forbiddenTimeCall(parse(expr.src).ast);
      if (bad) {
        issues.push({ loc, src: expr.src, message: `time function not allowed: ${bad}() (time lives only in timers)` });
        continue;
      }
    } catch {
      // parse failure is reported by the type-check below
    }
    let valid: boolean;
    let message: string | undefined;
    try {
      const r = env.check(expr.src);
      valid = r.valid;
      message = r.error?.message ?? (r.valid ? undefined : "type error");
      // Accept when the target field's type is unknowable (a plugin field infers as
      // `dyn`, so `expect` is dyn) or when the result type is (a plugin source). Only
      // two concrete types that disagree are a mismatch.
      if (valid && expect !== "dyn" && r.type !== expect && r.type !== "dyn") {
        valid = false;
        message = `expected ${expect}, got ${r.type}`;
      }
    } catch (err) {
      valid = false;
      message = (err as Error).message;
    }
    if (!valid) issues.push({ loc, src: expr.src, message: message ?? "invalid expression" });
  }
  return issues;
}

/** Parse-only check for the editor: syntax validity, no context needed. */
export function parseExpression(src: string): { ok: true } | { ok: false; message: string } {
  try {
    const r = parse(src) as { errors?: unknown[]; success?: boolean; error?: { message?: string } };
    if (r?.errors?.length) return { ok: false, message: String((r.errors[0] as { message?: string })?.message ?? r.errors[0]) };
    if (r?.success === false) return { ok: false, message: r.error?.message ?? "parse error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

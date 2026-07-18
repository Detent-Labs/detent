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
import type { ProcessBody, FieldDef, BaseFieldType, Expression } from "../schema/definition.js";

// The formal expression context. instance/actor shapes are pinned here.
// ponytail: minimal shapes, widen when a real guard needs more.
const INSTANCE_SCHEMA = { id: "string", status: "string", transitionSeq: "int", currentStepId: "string" } as const;
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

/** Flatten the catalog to key -> CEL type. `data` is flat, so recurse groups into leaves. */
function dataSchema(fields: FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (fs: FieldDef[]) => {
    for (const f of fs) {
      if (typeof f.type === "string" && f.type === "group") {
        if (f.fields) walk(f.fields);
      } else {
        out[f.key] = celType(f.type);
      }
    }
  };
  walk(fields);
  return out;
}

/**
 * Build the type environment for a scope. Scope is expressed by which namespaces
 * are registered: `result` exists only in an Action.output mapping, `child` only
 * inside a subprocess step. Unregistered references are check-time errors
 * (unlistedVariablesAreDyn: false), so guard-forbidden `result`/`child`/`now()`
 * fail for free.
 */
function buildEnv(body: ProcessBody, opts: { result: boolean; child: boolean }): Environment {
  const env = new Environment({ unlistedVariablesAreDyn: false })
    .registerVariable({ name: "data", schema: dataSchema(body.fields) })
    .registerVariable({ name: "instance", schema: { ...INSTANCE_SCHEMA } })
    .registerVariable({ name: "actor", schema: { ...ACTOR_SCHEMA } });
  for (const ds of body.dataSources ?? []) env.registerVariable(ds.key, "dyn");
  if (opts.child) env.registerVariable({ name: "child", schema: { ...CHILD_SCHEMA } });
  if (opts.result) env.registerVariable("result", "dyn");
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
}

const asExpr = (v: unknown): Expression | undefined =>
  v && typeof v === "object" && (v as { lang?: unknown }).lang === "cel" ? (v as Expression) : undefined;

/** Collect every Expression in the body with its scope and a locating path. */
function collect(body: ProcessBody): Site[] {
  const sites: Site[] = [];
  const push = (e: Expression | undefined, loc: string, result: boolean, child: boolean) => {
    if (e) sites.push({ src: e.src, loc, result, child });
  };
  // Action.output values are result scope.
  const outputs = (actions: readonly { output?: Record<string, unknown> }[] | undefined, loc: string, child: boolean) => {
    (actions ?? []).forEach((a, i) =>
      Object.entries(a.output ?? {}).forEach(([fid, e]) => push(asExpr(e), `${loc}.actions[${i}].output.${fid}`, true, child)),
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
    outputs(s.onEntry, `${sloc}.onEntry`, child);
    outputs(s.onExit, `${sloc}.onExit`, child);
    (s.paths ?? []).forEach((p, pi) => {
      push(p.guard, `${sloc}.paths[${pi}].guard`, false, child);
      outputs(p.onPath, `${sloc}.paths[${pi}].onPath`, child);
    });
    (s.timers ?? []).forEach((t, ti) => {
      push(t.deadline, `${sloc}.timers[${ti}].deadline`, false, child);
      outputs(t.onFire.actions, `${sloc}.timers[${ti}].onFire`, child);
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
      e = buildEnv(body, { result, child });
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
    } catch (err) {
      valid = false;
      message = (err as Error).message;
    }
    if (!valid) issues.push({ loc: site.loc, src: site.src, message: message ?? "invalid expression" });
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

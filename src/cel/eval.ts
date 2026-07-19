/**
 * Runtime CEL evaluation for the engine: project the instance onto the formal
 * context and evaluate a path guard. Uses the same @marcbachmann/cel-js as the
 * authoring check (src/cel/check.ts), so a guard that type-checks evaluates with
 * identical semantics.
 */

import { evaluate } from "@marcbachmann/cel-js";
import { INSTANCE_SCHEMA } from "./check.js";
import type { ProcessBody, Instance, FieldDef, Expression } from "../schema/definition.js";

export interface Actor {
  id: string;
  roles: string[];
}

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

/** Flatten the catalog to fieldId -> key (data is keyed by id; CEL by key). */
function fieldKeyById(fields: FieldDef[]): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (fs: FieldDef[]) => {
    for (const f of fs) {
      if (typeof f.type === "string" && f.type === "group") {
        if (f.fields) walk(f.fields);
      } else {
        m.set(f.id, f.key);
      }
    }
  };
  walk(fields);
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

/** Evaluate a path guard to a boolean. A guardless path is always taken. */
export function evalGuard(guard: Expression | undefined, ctx: Record<string, unknown>): boolean {
  if (!guard) return true;
  return evaluate(guard.src, ctx) === true;
}

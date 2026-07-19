import { test, expect } from "bun:test";
import { projectInstance, buildGuardContext, evalGuard, type Actor } from "../src/cel/eval.js";
import { INSTANCE_SCHEMA } from "../src/cel/check.js";
import type { Instance, ProcessBody, Expression } from "../src/schema/definition.js";

const cel = (src: string): Expression => ({ lang: "cel", src }) as Expression;

// Loosely-cast fixtures: eval reads only the fields named below.
const inst = (over: Partial<Record<string, unknown>> = {}): Instance =>
  ({
    instanceId: "inst_abc",
    processId: "proc_1",
    version: 1,
    definitionHash: "deadbeef",
    currentStepId: "step_a",
    transitionSeq: 3,
    data: {},
    status: "running",
    startedAt: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as Instance;

const body = (fields: { id: string; key: string; type: string }[]): ProcessBody =>
  ({ fields, workflow: { initialStep: "step_a", steps: [] } }) as unknown as ProcessBody;

// --- projection: the naming-drift landmine ---------------------------------

test("projectInstance maps instanceId to id and never yields undefined", () => {
  const p = projectInstance(inst({ instanceId: "inst_xyz" }));
  expect(p.id).toBe("inst_xyz");
  expect(p.id).not.toBeUndefined();
});

test("projectInstance exposes exactly INSTANCE_SCHEMA's fields, nothing else", () => {
  const p = projectInstance(inst());
  expect(Object.keys(p).sort()).toEqual(Object.keys(INSTANCE_SCHEMA).sort());
  expect(p.definitionHash).toBeUndefined(); // not whitelisted
  expect(p.data).toBeUndefined();
});

test("projectInstance models CEL int as bigint", () => {
  const p = projectInstance(inst({ transitionSeq: 5 }));
  expect(p.transitionSeq).toBe(5n);
});

// --- guard evaluation ------------------------------------------------------

test("a guard evaluates over data (re-keyed), instance, and actor", () => {
  const b = body([{ id: "field_amount", key: "amount", type: "number" }]);
  const i = inst({ data: { field_amount: 1500 }, status: "running" });
  const actor: Actor = { id: "user_1", roles: ["manager"] };
  const ctx = buildGuardContext(b, i, actor);

  expect(evalGuard(cel("data.amount > 1000.0"), ctx)).toBe(true);
  expect(evalGuard(cel("data.amount > 2000.0"), ctx)).toBe(false);
  expect(evalGuard(cel('instance.status == "running"'), ctx)).toBe(true);
  expect(evalGuard(cel('"manager" in actor.roles'), ctx)).toBe(true);
});

test("a guardless path is always taken", () => {
  expect(evalGuard(undefined, {})).toBe(true);
});

test("a guard cannot resolve the Action.output-only result namespace", () => {
  const ctx = buildGuardContext(body([]), inst(), { id: "u", roles: [] });
  expect(() => evalGuard(cel("result.x == 1"), ctx)).toThrow();
});

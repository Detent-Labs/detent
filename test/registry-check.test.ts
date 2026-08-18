/**
 * Authoring-time registry validation: checkActionRegistry resolves every
 * action's type against a Registry and checks its config against the
 * handler's declared configSchema. Pure — no DB — mirrors cel.test.ts's style.
 */
import { readdirSync, readFileSync } from "node:fs";
import { test, expect } from "bun:test";
import { z } from "zod";
import { checkActionRegistry } from "../src/engine/registry-check.js";
import { createRegistry } from "../src/engine/registry.js";
import { createDefaultRegistry } from "../src/engine/host.js";
import { processBody, type ProcessBody } from "../src/schema/definition.js";

const action = (type: string, config: Record<string, unknown> = {}) => ({ id: "action_x", type, config });

// A single step carrying `actions` in every one of the five positions the check
// visits: onEntry, onExit, onCancel, a path's onPath, and a timer's onFire.actions.
const bodyWithActions = (opts: {
  onEntry?: unknown[];
  onExit?: unknown[];
  onCancel?: unknown[];
  onPath?: unknown[];
  onFire?: unknown[];
}): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          ...(opts.onEntry ? { onEntry: opts.onEntry } : {}),
          ...(opts.onExit ? { onExit: opts.onExit } : {}),
          ...(opts.onCancel ? { onCancel: opts.onCancel } : {}),
          ...(opts.onFire ? { timers: [{ id: "timer_t", duration: "PT1H", onFire: { actions: opts.onFire } }] } : {}),
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual", ...(opts.onPath ? { onPath: opts.onPath } : {}) }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test("a body with all-registered actions and no config schema passes", () => {
  const reg = createRegistry();
  reg.set("email", { handler: async () => ({}) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email")] }), reg);
  expect(issues.length).toBe(0);
});

test("an unregistered action type is rejected at every action position", () => {
  const reg = createRegistry();
  const body = bodyWithActions({
    onEntry: [action("unknown.entry")],
    onExit: [action("unknown.exit")],
    onCancel: [action("unknown.cancel")],
    onPath: [action("unknown.path")],
    onFire: [action("unknown.fire")],
  });
  const issues = checkActionRegistry(body, reg);
  expect(issues.length).toBe(5);
  const locs = issues.map((i) => i.loc);
  expect(locs.some((l) => l.includes("onEntry"))).toBe(true);
  expect(locs.some((l) => l.includes("onExit"))).toBe(true);
  expect(locs.some((l) => l.includes("onCancel"))).toBe(true);
  expect(locs.some((l) => l.includes("onPath"))).toBe(true);
  expect(locs.some((l) => l.includes("onFire"))).toBe(true);
  for (const i of issues) expect(i.message.toLowerCase()).toContain("not registered");
});

test("a config violating its handler's declared schema is rejected", () => {
  const reg = createRegistry();
  reg.set("email", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { to: 42 })] }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toContain("onEntry");
  expect(issues[0]!.type).toBe("email");
});

test("a handler with no declared schema accepts any config", () => {
  const reg = createRegistry();
  reg.set("email", { handler: async () => ({}) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { anything: "goes", nested: { x: 1 } })] }), reg);
  expect(issues.length).toBe(0);
});

test("an unregistered type is not also checked for a config violation", () => {
  const reg = createRegistry();
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("unknown", { bad: true })] }), reg);
  expect(issues.length).toBe(1); // just the "not registered" issue, no separate config issue
});

// harden-publish-validation: the reserved-prefix ban now runs inside the
// compile pass itself (src/schema/compile.ts::checkReservedActionPrefix),
// ahead of both compile branches — so a core.-prefixed action can no longer
// reach a published body at all. checkActionRegistry no longer special-cases
// it away: resolved like any other type, against whatever the registry
// happens to hold.
test("a core.-prefixed action type is resolved against the registry like any other", () => {
  const reg = createRegistry(); // empty — nothing is registered
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("core.spawnSubprocess")] }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.type).toBe("core.spawnSubprocess");
  expect(issues[0]!.message.toLowerCase()).toContain("not registered");
});

// migrate-to-zod-v4: the studio's generated form now covers a schema carrying a
// cross-field rule, which Zod v3 kept on the raw JSON path. The form describes
// per-field rules only, so publish stays the one place the cross-field rule
// runs. These two cases pin that split: the same config passes every per-field
// rule and still fails here.
test("a cross-field rule on a configSchema is a publish error, not a form error", () => {
  const reg = createRegistry();
  reg.set("window", {
    handler: async () => ({}),
    configSchema: z
      .object({ min: z.number().min(0), max: z.number().min(0) })
      .refine((c) => c.min <= c.max, { message: "min must not exceed max", path: ["min"] }),
  });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("window", { min: 9, max: 1 })] }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.type).toBe("window");
  expect(issues[0]!.message).toContain("min must not exceed max");
});

test("a config satisfying the cross-field rule raises no publish issue", () => {
  const reg = createRegistry();
  reg.set("window", {
    handler: async () => ({}),
    configSchema: z
      .object({ min: z.number().min(0), max: z.number().min(0) })
      .refine((c) => c.min <= c.max, { message: "min must not exceed max", path: ["min"] }),
  });
  expect(checkActionRegistry(bodyWithActions({ onEntry: [action("window", { min: 1, max: 9 })] }), reg)).toEqual([]);
});

test("a core.-prefixed action type registered with a configSchema is config-checked too", () => {
  const reg = createRegistry();
  reg.set("core.spawnSubprocess", {
    handler: async () => ({}),
    configSchema: z.object({ subprocessStepId: z.string(), parentSeq: z.number() }),
  });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("core.spawnSubprocess", { subprocessStepId: "step_a", parentSeq: "not-a-number" })] }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toContain("onEntry");
});

test("multiple invalid actions each produce their own issue, not just the first", () => {
  const reg = createRegistry();
  reg.set("email", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
  const body = bodyWithActions({
    onEntry: [action("email", { to: 1 })], // schema violation
    onExit: [action("sms")], // unregistered
  });
  const issues = checkActionRegistry(body, reg);
  expect(issues.length).toBe(2);
});

test("a config with multiple violated fields produces one issue per field", () => {
  const reg = createRegistry();
  reg.set("email", { handler: async () => ({}), configSchema: z.object({ to: z.string(), subject: z.string() }) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { to: 1, subject: 2 })] }), reg);
  expect(issues.length).toBe(2);
});

// give-the-example-a-reachable-target: the mechanical form of the
// development-toolchain spec's "every action type the shipped examples name
// resolves in the default registry" requirement. Reads the AUTHORED body
// (never compileProcessBody's output), since a compiled body's injected
// core.spawnSubprocess/core.returnSubprocess actions are dispatched
// internally by subprocess.ts, never through this author-facing registry —
// checking the compiled body would fail on every subprocess example
// regardless of what the example itself names.
const exampleFiles = readdirSync(new URL("../examples/", import.meta.url)).filter((f) => f.endsWith(".json"));

function exampleBody(file: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8"));
  return processBody.parse(raw.definition ?? raw);
}

for (const file of exampleFiles) {
  test(`every action type ${file} names resolves in createDefaultRegistry()`, () => {
    const issues = checkActionRegistry(exampleBody(file), createDefaultRegistry());
    expect(issues).toEqual([]);
  });
}

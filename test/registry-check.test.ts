/**
 * Authoring-time registry validation: checkActionRegistry resolves every
 * action's type against a Registry and checks its config against the
 * handler's declared configSchema. Pure — no DB — mirrors cel.test.ts's style.
 */
import { test, expect } from "bun:test";
import { z } from "zod";
import { checkActionRegistry } from "../src/engine/registry-check.js";
import { createRegistry, register } from "../src/engine/registry.js";
import type { ProcessBody } from "../src/schema/definition.js";

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
    label: "P",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: "A",
          type: "task",
          ...(opts.onEntry ? { onEntry: opts.onEntry } : {}),
          ...(opts.onExit ? { onExit: opts.onExit } : {}),
          ...(opts.onCancel ? { onCancel: opts.onCancel } : {}),
          ...(opts.onFire ? { timers: [{ id: "timer_t", duration: "PT1H", onFire: { actions: opts.onFire } }] } : {}),
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual", ...(opts.onPath ? { onPath: opts.onPath } : {}) }],
        },
        { id: "step_b", key: "b", label: "B", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test("a body with all-registered actions and no config schema passes", () => {
  const reg = createRegistry();
  register(reg, "email", { handler: async () => ({}) });
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
  register(reg, "email", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { to: 42 })] }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toContain("onEntry");
  expect(issues[0]!.type).toBe("email");
});

test("a handler with no declared schema accepts any config", () => {
  const reg = createRegistry();
  register(reg, "email", { handler: async () => ({}) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { anything: "goes", nested: { x: 1 } })] }), reg);
  expect(issues.length).toBe(0);
});

test("an unregistered type is not also checked for a config violation", () => {
  const reg = createRegistry();
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("unknown", { bad: true })] }), reg);
  expect(issues.length).toBe(1); // just the "not registered" issue, no separate config issue
});

test("a core.-prefixed action type is never checked against the registry", () => {
  const reg = createRegistry(); // empty — would reject anything if it were checked
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("core.spawnSubprocess")] }), reg);
  expect(issues.length).toBe(0);
});

test("multiple invalid actions each produce their own issue, not just the first", () => {
  const reg = createRegistry();
  register(reg, "email", { handler: async () => ({}), configSchema: z.object({ to: z.string() }) });
  const body = bodyWithActions({
    onEntry: [action("email", { to: 1 })], // schema violation
    onExit: [action("sms")], // unregistered
  });
  const issues = checkActionRegistry(body, reg);
  expect(issues.length).toBe(2);
});

test("a config with multiple violated fields produces one issue per field", () => {
  const reg = createRegistry();
  register(reg, "email", { handler: async () => ({}), configSchema: z.object({ to: z.string(), subject: z.string() }) });
  const issues = checkActionRegistry(bodyWithActions({ onEntry: [action("email", { to: 1, subject: 2 })] }), reg);
  expect(issues.length).toBe(2);
});

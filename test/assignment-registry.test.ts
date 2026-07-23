/**
 * Authoring-time assignment-strategy registry validation: checkAssignmentRegistry
 * resolves every step's assignment.strategy.type against an AssignmentRegistry and
 * checks strategy.config against the strategy's declared configSchema. Pure — no
 * DB — mirrors registry-check.test.ts's style. The bottom section covers
 * checkAssignmentRegistry's wiring into publishBody (DB-backed, skips without
 * DATABASE_URL), mirroring definitions.test.ts's registry section.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { z } from "zod";
import { checkAssignmentRegistry } from "../src/engine/registry-check.js";
import {
  createAssignmentRegistry,
  registerAssignmentStrategy,
  createDefaultAssignmentRegistry,
  createRegistry,
  STATIC_ASSIGNMENT_STRATEGY_TYPE,
} from "../src/engine/registry.js";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, AssignmentRegistryValidationError } from "../src/engine/definitions.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";

const bodyWithAssignment = (assignment?: { type: string; config: Record<string, unknown> }): ProcessBody =>
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
          ...(assignment ? { assignment: { strategy: assignment } } : {}),
          terminal: true,
        },
      ],
    },
  }) as unknown as ProcessBody;

// Two steps, each with an unregistered assignment type — for the "every located
// issue, not just the first" scenario.
const bodyWithTwoBadAssignments = (): ProcessBody =>
  ({
    key: "p2",
    label: { en: "P2" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy: { type: "nope_a", config: {} } },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          assignment: { strategy: { type: "nope_b", config: {} } },
          terminal: true,
        },
      ],
    },
  }) as unknown as ProcessBody;

// --- pure: checkAssignmentRegistry ---------------------------------------------

test("a step with a registered assignment strategy and no config schema passes", () => {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, "static", { resolve: (c) => (c.candidates as string[]) ?? [] });
  const issues = checkAssignmentRegistry(bodyWithAssignment({ type: "static", config: { candidates: ["role_a"] } }), reg);
  expect(issues.length).toBe(0);
});

test("a step with an unregistered assignment strategy type is rejected", () => {
  const reg = createAssignmentRegistry();
  const issues = checkAssignmentRegistry(bodyWithAssignment({ type: "nope", config: {} }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.loc).toContain("steps[0].assignment");
  expect(issues[0]!.type).toBe("nope");
  expect(issues[0]!.message.toLowerCase()).toContain("not registered");
});

test("a step with no assignment declared is not checked", () => {
  const reg = createAssignmentRegistry(); // empty — would reject anything if visited
  const issues = checkAssignmentRegistry(bodyWithAssignment(), reg);
  expect(issues.length).toBe(0);
});

test("a config violating the strategy's declared schema is rejected", () => {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, "static", {
    resolve: (c) => (c.candidates as string[]) ?? [],
    configSchema: z.object({ candidates: z.array(z.string()) }),
  });
  const issues = checkAssignmentRegistry(bodyWithAssignment({ type: "static", config: {} }), reg);
  expect(issues.length).toBe(1);
  expect(issues[0]!.type).toBe("static");
});

test("an unregistered type is not also checked for a config violation", () => {
  const reg = createAssignmentRegistry();
  const issues = checkAssignmentRegistry(bodyWithAssignment({ type: "nope", config: { bad: true } }), reg);
  expect(issues.length).toBe(1); // just "not registered", no separate config issue
});

test("every step's unregistered assignment type is collected, not only the first", () => {
  const reg = createAssignmentRegistry(); // empty — both steps' types fail to resolve
  const issues = checkAssignmentRegistry(bodyWithTwoBadAssignments(), reg);
  expect(issues.length).toBe(2);
  expect(issues.map((i) => i.type).sort()).toEqual(["nope_a", "nope_b"]);
  expect(issues.some((i) => i.loc.includes("steps[0]"))).toBe(true);
  expect(issues.some((i) => i.loc.includes("steps[1]"))).toBe(true);
});

test("the built-in default registry's static strategy accepts a candidates array and rejects its absence", () => {
  const reg = createDefaultAssignmentRegistry();
  const ok = checkAssignmentRegistry(bodyWithAssignment({ type: STATIC_ASSIGNMENT_STRATEGY_TYPE, config: { candidates: ["x"] } }), reg);
  expect(ok.length).toBe(0);
  const bad = checkAssignmentRegistry(bodyWithAssignment({ type: STATIC_ASSIGNMENT_STRATEGY_TYPE, config: {} }), reg);
  expect(bad.length).toBe(1);
});

// --- DB-backed: checkAssignmentRegistry wired into publishBody ----------------

const DB = !!process.env.DATABASE_URL;
const PID = "proc_assignreg" as ProcessId;
const actionReg = createRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, definitions`;
});

test.skipIf(!DB)("publish rejects an unregistered assignment strategy type and writes no row", async () => {
  const body = bodyWithAssignment({ type: "nope", config: {} });
  let caught: unknown;
  try {
    await publishBody(PID, body, actionReg, sql, createAssignmentRegistry());
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AssignmentRegistryValidationError);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(0);
});

test.skipIf(!DB)("a publish with two unregistered assignment types throws with every located issue", async () => {
  const body = bodyWithTwoBadAssignments();
  let caught: unknown;
  try {
    await publishBody(PID, body, actionReg, sql, createAssignmentRegistry());
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(AssignmentRegistryValidationError);
  expect((caught as InstanceType<typeof AssignmentRegistryValidationError>).issues.length).toBe(2);
});

test.skipIf(!DB)("publish accepts a valid static-strategy step, using the default registry", async () => {
  const body = bodyWithAssignment({ type: STATIC_ASSIGNMENT_STRATEGY_TYPE, config: { candidates: ["role_a"] } });
  const v = await publishBody(PID, body, actionReg);
  expect(v.version).toBe(1);
});

test.skipIf(!DB)("a body with no assignment anywhere still publishes unchanged", async () => {
  const body = bodyWithAssignment();
  const v = await publishBody(PID, body, actionReg, sql, createAssignmentRegistry());
  expect(v.version).toBe(1);
});

test.skipIf(!DB)("an identical re-publish of an already-stored body stays a no-op, even against an empty assignment registry", async () => {
  const body = bodyWithAssignment({ type: STATIC_ASSIGNMENT_STRATEGY_TYPE, config: { candidates: ["role_a"] } });
  const v1 = await publishBody(PID, body, actionReg); // default registry accepts it
  const v2 = await publishBody(PID, body, actionReg, sql, createAssignmentRegistry()); // empty registry: still a no-op
  expect(v2.version).toBe(v1.version);
  const rows = (await sql`SELECT count(*)::int AS n FROM definitions WHERE process_id = ${PID}`) as { n: number }[];
  expect(rows[0].n).toBe(1);
});

test.skipIf(!DB)("a rejected assignment-registry publish consumes no version number", async () => {
  const bad = bodyWithAssignment({ type: "nope", config: {} });
  try {
    await publishBody(PID, bad, actionReg, sql, createAssignmentRegistry());
  } catch {
    // expected
  }
  const good = bodyWithAssignment({ type: STATIC_ASSIGNMENT_STRATEGY_TYPE, config: { candidates: [] } });
  const v = await publishBody(PID, good, actionReg);
  expect(v.version).toBe(1); // not 2 — the rejected publish reserved nothing
});

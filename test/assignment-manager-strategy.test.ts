/**
 * `org.manager-of-starter` (`src/engine/assignment-strategies.ts`), plus the
 * resolution deadline and failure classification `resolveStepAssignment`
 * (`src/engine/registry.ts`) applies to every strategy. DB-backed, skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { createUser, setManagerById } from "../src/auth/users.js";
import {
  createDefaultAssignmentRegistry,
  managerOfStarterConfigSchema,
  managerOfStarterStrategyDef,
  MANAGER_OF_STARTER_STRATEGY_TYPE,
} from "../src/engine/assignment-strategies.js";
import {
  createAssignmentRegistry,
  registerAssignmentStrategy,
  resolveStepAssignment,
  DEFAULT_ASSIGNMENT_RESOLUTION_TIMEOUT_MS,
} from "../src/engine/registry.js";
import type { Step } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE auth_users`;
});

/** A step declaring `type`, so resolveStepAssignment runs a resolver at all. */
const stepWith = (type: string): Step =>
  ({
    id: "step_approve",
    key: "approve",
    label: { en: "Approve" },
    type: "task",
    assignment: { strategy: { type, config: {} } },
  }) as unknown as Step;

const ctx = (startedBy: string | undefined) => ({ id: "inst_1", startedBy, data: {} });

// ============================================================
// The strategy
// ============================================================

test.skipIf(!DB)("the strategy resolves the starter's manager as the single candidate", async () => {
  const boss = await createUser("boss@example.com", "pw", []);
  const anna = await createUser("anna@example.com", "pw", []);
  await setManagerById(anna.userId, boss.userId);

  const got = await resolveStepAssignment(stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE), createDefaultAssignmentRegistry(), ctx(anna.userId), sql);
  expect(got.assignment!.candidates).toEqual([boss.userId]);
  expect(got.unresolved).toBeUndefined();
});

test.skipIf(!DB)("two starters with different managers resolve to different candidates", async () => {
  // The load-bearing case: one shared definition, and B's manager must not be
  // eligible for A's instance.
  const bossA = await createUser("boss-a@example.com", "pw", []);
  const bossB = await createUser("boss-b@example.com", "pw", []);
  const anna = await createUser("anna2@example.com", "pw", []);
  const bernd = await createUser("bernd@example.com", "pw", []);
  await setManagerById(anna.userId, bossA.userId);
  await setManagerById(bernd.userId, bossB.userId);

  const step = stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE);
  const reg = createDefaultAssignmentRegistry();
  const forAnna = await resolveStepAssignment(step, reg, ctx(anna.userId), sql);
  const forBernd = await resolveStepAssignment(step, reg, ctx(bernd.userId), sql);

  expect(forAnna.assignment!.candidates).toEqual([bossA.userId]);
  expect(forBernd.assignment!.candidates).toEqual([bossB.userId]);
  expect(forAnna.assignment!.candidates).not.toContain(bossB.userId);
  expect(forBernd.assignment!.candidates).not.toContain(bossA.userId);
});

test.skipIf(!DB)("a starter with no manager resolves to nobody, classified no-candidates", async () => {
  const anna = await createUser("anna3@example.com", "pw", []);
  const got = await resolveStepAssignment(stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE), createDefaultAssignmentRegistry(), ctx(anna.userId), sql);
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test.skipIf(!DB)("an absent or unknown startedBy resolves to nobody", async () => {
  const reg = createDefaultAssignmentRegistry();
  const step = stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE);
  const absent = await resolveStepAssignment(step, reg, ctx(undefined), sql);
  const unknown = await resolveStepAssignment(step, reg, ctx("user_does_not_exist"), sql);
  expect(absent.assignment!.candidates).toEqual([]);
  expect(absent.unresolved).toBe("no-candidates");
  expect(unknown.assignment!.candidates).toEqual([]);
  expect(unknown.unresolved).toBe("no-candidates");
});

test.skipIf(!DB)("the strategy reads one hop and does not walk a chain", async () => {
  const top = await createUser("top@example.com", "pw", []);
  const mid = await createUser("mid@example.com", "pw", []);
  const low = await createUser("low@example.com", "pw", []);
  await setManagerById(mid.userId, top.userId);
  await setManagerById(low.userId, mid.userId);

  const got = await resolveStepAssignment(stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE), createDefaultAssignmentRegistry(), ctx(low.userId), sql);
  expect(got.assignment!.candidates).toEqual([mid.userId]);
  expect(got.assignment!.candidates).not.toContain(top.userId);
});

test.skipIf(!DB)("a resolved list does not change when the manager changes afterwards", async () => {
  const boss = await createUser("boss4@example.com", "pw", []);
  const other = await createUser("other@example.com", "pw", []);
  const anna = await createUser("anna4@example.com", "pw", []);
  await setManagerById(anna.userId, boss.userId);

  const step = stepWith(MANAGER_OF_STARTER_STRATEGY_TYPE);
  const frozen = await resolveStepAssignment(step, createDefaultAssignmentRegistry(), ctx(anna.userId), sql);
  await setManagerById(anna.userId, other.userId);

  // The written answer is a value, not a live query: the entry that already
  // committed keeps what it resolved.
  expect(frozen.assignment!.candidates).toEqual([boss.userId]);
});

test("the strategy's config schema is strict and empty", () => {
  expect(managerOfStarterConfigSchema.safeParse({}).success).toBe(true);
  expect(managerOfStarterConfigSchema.safeParse({ depth: 2 }).success).toBe(false);
});

test("the shipped registry holds both the static entry and the org one", () => {
  const reg = createDefaultAssignmentRegistry();
  expect([...reg.keys()]).toEqual(["static", MANAGER_OF_STARTER_STRATEGY_TYPE]);
});

// ============================================================
// The deadline and the failure classification
// ============================================================

const registryOf = (resolve: () => Promise<string[]>) => {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, "test.strategy", { resolve });
  return reg;
};

afterEach(() => {
  delete process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS;
});

test("a step declaring no assignment resolves to undefined and records nothing", async () => {
  const bare = { id: "step_x", key: "x", label: { en: "X" }, type: "task" } as unknown as Step;
  const got = await resolveStepAssignment(bare, registryOf(async () => ["nobody"]), ctx("user_1"), sql);
  expect(got.assignment).toBeUndefined();
  expect(got.unresolved).toBeUndefined();
});

test("a resolver that raises yields empty candidates and the resolver-raised reason", async () => {
  const got = await resolveStepAssignment(
    stepWith("test.strategy"),
    registryOf(async () => {
      throw new Error("directory unreachable");
    }),
    ctx("user_1"),
    sql,
  );
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("resolver-raised");
});

test("a resolver returning an empty list yields the no-candidates reason", async () => {
  const got = await resolveStepAssignment(stepWith("test.strategy"), registryOf(async () => []), ctx("user_1"), sql);
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test("an unregistered type resolves to empty rather than raising", async () => {
  const got = await resolveStepAssignment(stepWith("test.not-registered"), createAssignmentRegistry(), ctx("user_1"), sql);
  expect(got.assignment!.candidates).toEqual([]);
  expect(got.unresolved).toBe("no-candidates");
});

test("a resolver exceeding the deadline is abandoned, and its late answer is ignored", async () => {
  process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS = "40";
  let settled = false;
  const reg = registryOf(
    () =>
      new Promise<string[]>((resolve) => {
        setTimeout(() => {
          settled = true;
          resolve(["too-late"]);
        }, 400);
      }),
  );

  const started = performance.now();
  const got = await resolveStepAssignment(stepWith("test.strategy"), reg, ctx("user_1"), sql);
  const elapsed = performance.now() - started;

  expect(got.unresolved).toBe("timed-out");
  expect(got.assignment!.candidates).toEqual([]);
  // Returned on the deadline, not on the resolver: the property the row-lock
  // path depends on. A wide bound, so this does not turn flaky on a slow box.
  expect(elapsed).toBeLessThan(300);
  expect(settled).toBe(false);

  // The late answer settles afterwards and reaches nothing.
  await new Promise((r) => setTimeout(r, 450));
  expect(settled).toBe(true);
  expect(got.assignment!.candidates).toEqual([]);
});

test("the deadline default applies when the environment variable is unset or junk", async () => {
  expect(DEFAULT_ASSIGNMENT_RESOLUTION_TIMEOUT_MS).toBe(5000);
  process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS = "not-a-number";
  // A prompt resolver still answers, so the junk value falls back rather than
  // rejecting the resolution outright.
  const got = await resolveStepAssignment(stepWith("test.strategy"), registryOf(async () => ["a"]), ctx("user_1"), sql);
  expect(got.assignment!.candidates).toEqual(["a"]);
});

test("a resolver answering within the configured deadline is not abandoned", async () => {
  process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS = "500";
  const got = await resolveStepAssignment(
    stepWith("test.strategy"),
    registryOf(() => new Promise<string[]>((resolve) => setTimeout(() => resolve(["in-time"]), 20))),
    ctx("user_1"),
    sql,
  );
  expect(got.assignment!.candidates).toEqual(["in-time"]);
  expect(got.unresolved).toBeUndefined();
});

test.skipIf(!DB)("the org strategy accepts an injected db, so a test never reaches the shared pool by accident", async () => {
  const boss = await createUser("boss5@example.com", "pw", []);
  const anna = await createUser("anna5@example.com", "pw", []);
  await setManagerById(anna.userId, boss.userId);
  const def = managerOfStarterStrategyDef;
  expect(await def.resolve({ config: {}, stepId: "step_approve", instance: ctx(anna.userId), db: sql })).toEqual([boss.userId]);
});

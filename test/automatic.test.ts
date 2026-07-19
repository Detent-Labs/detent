/**
 * Automatic transitions: pure path selection + the run-to-rest driver. Pure
 * cases (selection, resting branches that commit nothing) run everywhere; the
 * cascade/faulted/creation cases hit Postgres and skip when DATABASE_URL is
 * unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import {
  selectAutomaticPath,
  resolveAutomatic,
  executeManualTransition,
  startInstance,
  AutomaticCascadeLoop,
} from "../src/engine/transition.js";
import type { ProcessBody, Instance, Step, HistoryEntry } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };

async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

const cel = (src: string) => ({ lang: "cel", src });
const autoPath = (id: string, to: string, priority?: number, guardSrc?: string) =>
  ({ id, key: id, to, trigger: "automatic", ...(priority !== undefined ? { priority } : {}), ...(guardSrc ? { guard: cel(guardSrc) } : {}) });
const manualPath = (id: string, to: string) => ({ id, key: id, to, trigger: "manual" });
const step = (id: string, over: Record<string, unknown> = {}): Step =>
  ({ id, key: id, label: id, type: "task", ...over }) as unknown as Step;
const mkBody = (steps: Step[], initialStep = "step_a"): ProcessBody =>
  ({ fields: [], workflow: { initialStep, steps } }) as unknown as ProcessBody;
const inst = (over: Record<string, unknown> = {}): Instance =>
  ({
    instanceId: "inst_x",
    processId: "proc_1",
    version: 1,
    definitionHash: "x",
    currentStepId: "step_a",
    transitionSeq: 0,
    data: {},
    status: "running",
    startedAt: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as Instance;

// --- selectAutomaticPath (pure) --------------------------------------------

test("higher-priority matching guard wins over a lower-priority match", () => {
  const s = step("step_a", { paths: [autoPath("path_hi", "step_x", 1, "1 > 0"), autoPath("path_lo", "step_y", 2, "1 > 0")] });
  expect(selectAutomaticPath(s, { data: {} })?.id as string).toBe("path_hi");
});

test("a false higher-priority guard falls through to the next matching path", () => {
  const s = step("step_a", { paths: [autoPath("path_hi", "step_x", 1, "1 > 2"), autoPath("path_lo", "step_y", 2, "1 > 0")] });
  expect(selectAutomaticPath(s, { data: {} })?.id as string).toBe("path_lo");
});

test("the guardless default is the else-branch when every guarded path is false", () => {
  const s = step("step_a", { paths: [autoPath("path_g", "step_x", 1, "1 > 2"), autoPath("path_def", "step_y", 2)] });
  expect(selectAutomaticPath(s, { data: {} })?.id as string).toBe("path_def");
});

test("a guarded match is taken over an available default", () => {
  const s = step("step_a", { paths: [autoPath("path_g", "step_x", 1, "1 > 0"), autoPath("path_def", "step_y", 2)] });
  expect(selectAutomaticPath(s, { data: {} })?.id as string).toBe("path_g");
});

test("no matching guard and no default yields null (a wait-state)", () => {
  const s = step("step_a", { paths: [autoPath("path_g", "step_x", 1, "1 > 2")] });
  expect(selectAutomaticPath(s, { data: {} })).toBeNull();
});

// --- resolveAutomatic resting branches (pure: commit nothing) --------------

test("resolveAutomatic is a no-op on a manual step", async () => {
  const body = mkBody([step("step_a", { paths: [manualPath("path_ab", "step_b")] }), step("step_b", { terminal: true })]);
  const i = inst({ currentStepId: "step_a" });
  expect((await resolveAutomatic(i, body, actor)).currentStepId as string).toBe("step_a");
});

test("resolveAutomatic is a no-op on a terminal step", async () => {
  const body = mkBody([step("step_t", { terminal: true })], "step_t");
  const i = inst({ currentStepId: "step_t" });
  expect((await resolveAutomatic(i, body, actor)).currentStepId as string).toBe("step_t");
});

test("an all-automatic step with no matching guard is a wait-state (stays put)", async () => {
  const body = mkBody([step("step_w", { paths: [autoPath("path_w", "step_x", 1, "1 > 2")] }), step("step_x", { terminal: true })], "step_w");
  const i = inst({ currentStepId: "step_w" });
  const rested = await resolveAutomatic(i, body, actor);
  expect(rested.currentStepId as string).toBe("step_w");
  expect(rested.transitionSeq).toBe(0);
});

// --- DB-backed: cascade, faulted loop, creation ----------------------------

beforeAll(async () => {
  if (DB) await initSchema();
});

const statusOf = async (id: string): Promise<string> => {
  const r = (await sql`SELECT body->>'status' AS s FROM instances WHERE instance_id = ${id}`) as { s: string }[];
  return r[0].s;
};
const seqOf = async (id: string): Promise<number> => {
  const r = (await sql`SELECT transition_seq AS s FROM instances WHERE instance_id = ${id}`) as { s: number }[];
  return r[0].s;
};
const histEntries = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry) : row.entry) as HistoryEntry);
};

// step_a (manual) -> step_g (automatic, guardless) -> step_t (terminal)
const cascadeBody = (): ProcessBody =>
  mkBody([
    step("step_a", { paths: [manualPath("path_ag", "step_g")] }),
    step("step_g", { paths: [autoPath("path_gt", "step_t")] }),
    step("step_t", { terminal: true }),
  ]);

test.skipIf(!DB)("a manual transition cascades through an automatic step to rest at a terminal", async () => {
  const body = cascadeBody();
  const i = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  const rested = await executeManualTransition(i, "path_ag", body, actor);
  expect(rested.currentStepId as string).toBe("step_t");
  expect(rested.transitionSeq).toBe(2);
  expect(rested.status).toBe("completed");
  expect(await seqOf(i.instanceId)).toBe(2);

  const entries = await histEntries(i.instanceId);
  expect(entries.map((e) => [e.transitionSeq, String(e.fromStepId), String(e.toStepId), e.cause])).toEqual([
    [1, "step_a", "step_g", "user"],
    [2, "step_g", "step_t", "automatic"],
  ]);
  // An automatic transition records no acting user.
  expect(entries[1].actorId).toBeUndefined();
});

test.skipIf(!DB)("a data-independent cascade loop parks the instance faulted and throws", async () => {
  // step_a (manual) -> step_g -> step_h -> step_g ... (no terminal reachable)
  const body = mkBody([
    step("step_a", { paths: [manualPath("path_ag", "step_g")] }),
    step("step_g", { paths: [autoPath("path_gh", "step_h")] }),
    step("step_h", { paths: [autoPath("path_hg", "step_g")] }),
  ]);
  const i = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  await rejectsWith(executeManualTransition(i, "path_ag", body, actor), AutomaticCascadeLoop);

  // Parked on the last committed step (re-entered step_g), marked faulted, prior hops kept.
  expect(await statusOf(i.instanceId)).toBe("faulted");
  const entries = await histEntries(i.instanceId);
  expect(entries.map((e) => [String(e.fromStepId), String(e.toStepId)])).toEqual([
    ["step_a", "step_g"],
    ["step_g", "step_h"],
    ["step_h", "step_g"],
  ]);
});

test.skipIf(!DB)("startInstance advances an instance created on an automatic initial step", async () => {
  const body = mkBody([step("step_g", { paths: [autoPath("path_gt", "step_t")] }), step("step_t", { terminal: true })], "step_g");
  // startInstance must return the instance already advanced past the automatic
  // initialStep — createInstance alone would leave it stuck (no manual path).
  const rested = await startInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 }, actor);
  expect(rested.currentStepId as string).toBe("step_t");
  expect(rested.transitionSeq).toBe(1);
  expect(rested.status).toBe("completed");

  const entries = await histEntries(rested.instanceId);
  expect(entries).toHaveLength(1);
  expect(entries[0].cause).toBe("automatic");
});

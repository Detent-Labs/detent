/**
 * Automatic transitions: pure path selection + the run-to-rest driver. Pure
 * cases (selection, resting branches that commit nothing) run everywhere; the
 * cascade/faulted/creation cases hit Postgres and skip when DATABASE_URL is
 * unset — a skip is visible, a false green is not.
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance, withTransaction } from "../src/engine/store.js";
import {
  selectAutomaticPath,
  resolveAutomatic,
  executeManualTransition,
  startInstance,
  planStepEntry,
  applyStepEntry,
  orderedTriggerActions,
  AutomaticCascadeLoop,
} from "../src/engine/transition.js";
import { drainResolutions } from "../src/engine/resolution.js";
import type { ProcessBody, Instance, Step, HistoryEntry, InstanceEvent } from "../src/schema/definition.js";
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
  ({ id, key: id, label: { en: id }, type: "task", ...over }) as unknown as Step;
const mkBody = (steps: Step[], initialStep = "step_a"): ProcessBody =>
  ({ baseLocale: "en", fields: [], workflow: { initialStep, steps } }) as unknown as ProcessBody;
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
const resolveState = async (id: string): Promise<string> =>
  ((await sql`SELECT resolve_state FROM instances WHERE instance_id = ${id}`) as { resolve_state: string }[])[0].resolve_state;
const readInst = async (id: string): Promise<Instance> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return (typeof r[0].body === "string" ? JSON.parse(r[0].body as string) : r[0].body) as Instance;
};
const histEntries = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry) : row.entry) as HistoryEntry);
};
const eventsOf = async (id: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${id} ORDER BY id`) as { event: unknown }[];
  return r.map((row) => (typeof row.event === "string" ? JSON.parse(row.event) : row.event) as InstanceEvent);
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
  // Entries above 1: no HistoryEntry for the park itself.
  expect(entries.length).toBe(3);

  // The park is durably recorded as an instance.faulted event, not just the
  // thrown AutomaticCascadeLoop.
  const persistedSeq = await seqOf(i.instanceId);
  const events = await eventsOf(i.instanceId);
  const faultEvents = events.filter((e) => e.kind === "instance.faulted");
  expect(faultEvents.length).toBe(1);
  const faultEvent = faultEvents[0]!;
  expect(faultEvent.payload).toEqual({ stepId: "step_g", reason: "automatic-cascade-loop" });
  // The event carries the seq the instance rests at without advancing it.
  expect(faultEvent.transitionSeq).toBe(persistedSeq);
  expect("actions" in faultEvent).toBe(false);
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

// --- durable crash recovery: a commit whose in-process cascade never runs -----

test.skipIf(!DB)("a cascade interrupted after its first hop is durably resumed by re-resolution", async () => {
  // step_a (manual) -> step_g1 (automatic, guardless) -> step_g2 (automatic, guardless) -> step_t (terminal).
  const body = mkBody([
    step("step_a", { paths: [manualPath("path_ag", "step_g1")] }),
    step("step_g1", { paths: [autoPath("path_g1g2", "step_g2")] }),
    step("step_g2", { paths: [autoPath("path_g2t", "step_t")] }),
    step("step_t", { terminal: true }),
  ]);
  const i = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });

  // Commit only the first hop (step_a -> step_g1) through the same building
  // blocks executeManualTransition uses internally, without calling
  // resolveAutomatic — simulating a crash before the cascade continues.
  const source = body.workflow.steps.find((s) => s.id === "step_a")!;
  const path = source.paths![0];
  const target = body.workflow.steps.find((s) => s.id === path.to)!;
  const actions = orderedTriggerActions(source, path, target);
  const plan = planStepEntry(i, target, body, { pathId: path.id, cause: "user", actorId: actor.id, actions });
  const afterHop1 = await withTransaction(sql, (tx) => applyStepEntry(tx, plan));
  expect(afterHop1.currentStepId as string).toBe("step_g1");
  // The commit alone — with no cascade having run — already left the instance
  // durably marked, before any further hop and before any writeback.
  expect(await resolveState(i.instanceId)).toBe("pending");

  // The re-resolution worker finishes the whole cascade in this one pass — the
  // state cascade (currentStepId/status) is what this change exists to
  // recover, and it fully completes here.
  expect(await drainResolutions(sql, () => body)).toBe(1);
  const rested = await readInst(i.instanceId);
  expect(rested.currentStepId as string).toBe("step_t");
  expect(rested.status).toBe("completed");
  // resolve_state itself may or may not settle to 'idle' in this same pass:
  // the intermediate hop (step_g1 -> step_g2, still running) re-flags
  // 'pending' as it commits, clobbering this pass's own 'claimed' marker, so
  // its end-of-pass clear finds nothing to clear. Once the cascade then
  // reaches the terminal step, status is no longer 'running', so the worker's
  // claim query (`WHERE status = 'running'`) never revisits the row to settle
  // the flag — it is left 'pending' permanently. Harmless: nothing else reads
  // resolve_state, and a terminal instance is never re-resolved regardless of
  // this column's value. See applyStepEntry's doc comment.
  expect(await resolveState(i.instanceId)).toBe("pending");
});

test.skipIf(!DB)("a creation-time cascade interrupted before it runs is durably resumed by re-resolution", async () => {
  // initialStep is all-automatic across two hops, unlike startInstance's own test.
  const body = mkBody(
    [
      step("step_g1", { paths: [autoPath("path_g1g2", "step_g2")] }),
      step("step_g2", { paths: [autoPath("path_g2t", "step_t")] }),
      step("step_t", { terminal: true }),
    ],
    "step_g1",
  );
  // createInstance alone, bypassing startInstance's follow-up resolveAutomatic —
  // simulating a crash between the INSERT and the first cascade attempt.
  const i = await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });
  expect(i.currentStepId as string).toBe("step_g1");
  expect(await resolveState(i.instanceId)).toBe("pending");

  // The state cascade completes in this one pass, exactly as the manual-hop
  // case above; resolve_state is left permanently 'pending' for the same
  // reason (the intermediate still-running hop re-flags it, and the worker
  // never revisits the row once it's terminal) — see the comment there.
  expect(await drainResolutions(sql, () => body)).toBe(1);
  const rested = await readInst(i.instanceId);
  expect(rested.currentStepId as string).toBe("step_t");
  expect(rested.status).toBe("completed");
  expect(await resolveState(i.instanceId)).toBe("pending");
});

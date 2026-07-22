/**
 * Runtime cancellation: cancelInstance drives a running instance to the
 * publish-injected cancel-sink via a synthesized hidden-path transition. onExit
 * is skipped; [onCancel, sink.onEntry] are enqueued; one HistoryEntry with
 * cause "cancel" and pathId null is recorded; status flips to cancelled. Every
 * case hits Postgres and skips when DATABASE_URL is unset — a skip is visible, a
 * false green is not. (Contract-layer cancel — sink injection, invariants — lives
 * in cancel.test.ts.)
 */
import { test, expect, beforeAll } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { cancelInstance, executeManualTransition, ConcurrencyConflict } from "../src/engine/transition.js";
import { CANCEL_SINK_STEP_ID } from "../src/schema/definition.js";
import type { ProcessBody, Instance, Step, HistoryEntry, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const pid = "proc_1" as Instance["processId"];

const act = (m: string): Action => ({ id: `action_${m}`, type: m, config: {} }) as unknown as Action;
const manualPath = (id: string, to: string) => ({ id, key: id, to, trigger: "manual" });
const step = (id: string, over: Record<string, unknown> = {}): Step =>
  ({ id, key: id, label: { en: id }, type: "task", ...over }) as unknown as Step;
// The publish-injected cancel-sink; here added by hand — createInstance/rehydrate
// hash the same body, so the pin matches without a real publish.
const sinkStep = (): Step => step(CANCEL_SINK_STEP_ID, { terminal: true });
const mkBody = (steps: Step[], initialStep = "step_a"): ProcessBody =>
  ({ baseLocale: "en", fields: [], workflow: { initialStep, steps } }) as unknown as ProcessBody;
const inst = (over: Record<string, unknown> = {}): Instance =>
  ({
    instanceId: "inst_x", processId: pid, version: 1, definitionHash: "x",
    currentStepId: "step_a", transitionSeq: 3, data: {}, status: "running",
    startedAt: "2026-01-01T00:00:00Z", ...over,
  }) as unknown as Instance;

// step_a: onExit x1, onCancel cleanup1, manual path to terminal step_b. Plus the sink.
const cancelBody = (): ProcessBody =>
  mkBody([
    step("step_a", { onExit: [act("exit1")], onCancel: [act("cleanup1")], paths: [manualPath("path_ab", "step_b")] }),
    step("step_b", { terminal: true }),
    sinkStep(),
  ]);

beforeAll(async () => {
  if (DB) await initSchema();
});

const rowStatus = async (id: string): Promise<string> =>
  ((await sql`SELECT body->>'status' AS s FROM instances WHERE instance_id = ${id}`) as { s: string }[])[0].s;
const rowSeq = async (id: string): Promise<number> =>
  ((await sql`SELECT transition_seq AS s FROM instances WHERE instance_id = ${id}`) as { s: number }[])[0].s;
const nextTimerAt = async (id: string): Promise<string | null> =>
  ((await sql`SELECT next_timer_at FROM instances WHERE instance_id = ${id}`) as { next_timer_at: string | null }[])[0].next_timer_at;
const histEntries = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry) : row.entry) as HistoryEntry);
};
const outboxActionIds = async (id: string): Promise<string[]> => {
  const r = (await sql`SELECT action_id FROM outbox WHERE instance_id = ${id} ORDER BY action_id`) as { action_id: string }[];
  return r.map((x) => x.action_id);
};

test.skipIf(!DB)("cancel skips onExit, enqueues onCancel, and drives to the cancelled sink", async () => {
  const body = cancelBody();
  const i = await createInstance(body, { processId: pid, version: 1 });

  const cancelled = await cancelInstance(i, body, actor);
  expect(cancelled.currentStepId as string).toBe(CANCEL_SINK_STEP_ID);
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.transitionSeq).toBe(1);
  expect(await rowStatus(i.instanceId)).toBe("cancelled");

  // onCancel cleanup enqueued; onExit NOT enqueued; the injected sink has no onEntry.
  expect(await outboxActionIds(i.instanceId)).toEqual(["action_cleanup1"]);
});

test.skipIf(!DB)("cancel records one HistoryEntry: cause cancel, pathId null, toStepId sink", async () => {
  const body = cancelBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  await cancelInstance(i, body, actor);

  const entries = await histEntries(i.instanceId);
  expect(entries).toHaveLength(1);
  const e = entries[0];
  expect(e.cause).toBe("cancel");
  expect(e.pathId).toBeNull();
  expect(String(e.fromStepId)).toBe("step_a");
  expect(String(e.toStepId)).toBe(CANCEL_SINK_STEP_ID);
  expect(e.transitionSeq).toBe(1);
  expect(e.actorId).toBe("user_1");
});

test("cancelling a non-running instance is a no-op for every non-running status", async () => {
  // The guard returns before any DB access, so a crafted instance suffices and this
  // runs without Postgres — covering completed / cancelled / faulted uniformly.
  const body = cancelBody();
  for (const status of ["completed", "cancelled", "faulted"] as const) {
    const i = inst({ status });
    const res = await cancelInstance(i, body, actor);
    expect(res).toBe(i); // returned untouched (same object)
    expect(res.status).toBe(status);
  }
});

test.skipIf(!DB)("no-op leaves no HistoryEntry and no seq bump (end-to-end)", async () => {
  // Drive to terminal step_b (status completed), then cancel: nothing appended.
  const body = cancelBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const done = await executeManualTransition(i, "path_ab", body, actor);
  expect(done.status).toBe("completed");
  const seqBefore = await rowSeq(i.instanceId);

  const res = await cancelInstance(done, body, actor);
  expect(res.status).toBe("completed"); // returned unchanged
  expect(await rowSeq(i.instanceId)).toBe(seqBefore); // no seq bump
  expect((await histEntries(i.instanceId)).map((e) => e.cause)).toEqual(["user"]); // no cancel entry
});

test.skipIf(!DB)("cancel enqueues every onCancel plus sink onEntry, still excluding onExit", async () => {
  // Enriched body: two onCancel actions and a sink WITH onEntry. The publish-injected
  // sink has no onEntry, so this defensively exercises the [onCancel, sink.onEntry]
  // concatenation that the realistic body never reaches. Strict insertion order is
  // not DB-observable within one commit (all rows share now()), so assert the set.
  const body = mkBody([
    step("step_a", { onExit: [act("exit1")], onCancel: [act("clean1"), act("clean2")], paths: [manualPath("path_ab", "step_b")] }),
    step("step_b", { terminal: true }),
    step(CANCEL_SINK_STEP_ID, { terminal: true, onEntry: [act("sink_enter")] }),
  ]);
  const i = await createInstance(body, { processId: pid, version: 1 });
  await cancelInstance(i, body, actor);

  // Both onCancel actions + the sink onEntry are enqueued; onExit (exit1) is excluded.
  expect(await outboxActionIds(i.instanceId)).toEqual(["action_clean1", "action_clean2", "action_sink_enter"]);
});

test.skipIf(!DB)("cancel racing a normal transition from the same seq: exactly one wins", async () => {
  const body = cancelBody();
  const i = await createInstance(body, { processId: pid, version: 1 }); // seq 0 at step_a

  const results = await Promise.allSettled([
    executeManualTransition(i, "path_ab", body, actor),
    cancelInstance(i, body, actor),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].reason).toBeInstanceOf(ConcurrencyConflict);

  // Exactly one committed transition: seq 1, one history entry — no double-apply.
  expect(await rowSeq(i.instanceId)).toBe(1);
  expect(await histEntries(i.instanceId)).toHaveLength(1);
});

test.skipIf(!DB)("synthesized cancel transition disarms the source timer (null path, terminal target)", async () => {
  // step_a carries a duration timer, armed at creation. Cancel targets the terminal
  // sink, so the source timer is disarmed and no new timer is armed.
  const body = mkBody([
    step("step_a", {
      timers: [{ id: "timer_c", duration: "PT1H", onFire: { targetPath: "path_ab", actions: [] } }],
      onCancel: [act("cleanup1")],
      paths: [manualPath("path_ab", "step_b")],
    }),
    step("step_b", { terminal: true }),
    sinkStep(),
  ]);
  const i = await createInstance(body, { processId: pid, version: 1 });
  expect(await nextTimerAt(i.instanceId)).not.toBeNull(); // armed at creation

  await cancelInstance(i, body, actor);
  expect(await nextTimerAt(i.instanceId)).toBeNull(); // disarmed; terminal sink arms none
  const e = (await histEntries(i.instanceId))[0];
  expect(e.pathId).toBeNull();
  expect(String(e.toStepId)).toBe(CANCEL_SINK_STEP_ID);
});

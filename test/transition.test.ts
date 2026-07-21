/**
 * The plan/apply seam behind commitTransition: planStepEntry (pure, no I/O) and
 * applyStepEntry (writes a plan inside a supplied transaction). Pure cases
 * (status derivation, the spawn/return outbox rows, defaults) run without
 * Postgres, since planStepEntry takes no `db` argument at all. DB-backed cases
 * exercise applyStepEntry's atomicity and OCC predicate, and skip when
 * DATABASE_URL is unset — a skip is visible, a false green is not. Equivalence
 * (task 4.2) is a captured expectation, not a re-derivation through the same
 * code being tested.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance, withTransaction } from "../src/engine/store.js";
import {
  planStepEntry,
  applyStepEntry,
  executeManualTransition,
  ConcurrencyConflict,
  SPAWN_ACTION_TYPE,
  RETURN_ACTION_TYPE,
  type StepEntryOpts,
} from "../src/engine/transition.js";
import { idempotencyKey, subprocessChildId } from "../src/engine/idempotency.js";
import type { ProcessBody, Instance, Step, HistoryEntry, InstanceEvent, Action, TimerState } from "../src/schema/definition.js";

const DB = !!process.env.DATABASE_URL;
const actor = { id: "user_1", roles: [] };
const pid = "proc_1" as Instance["processId"];

const cel = (src: string) => ({ lang: "cel", src });
const act = (id: string): Action => ({ id, type: "notify", config: {} }) as unknown as Action;
const manualPath = (id: string, to: string) => ({ id, key: id, to, trigger: "manual" });
const step = (id: string, over: Record<string, unknown> = {}): Step =>
  ({ id, key: id, label: id, type: "task", ...over }) as unknown as Step;
const mkBody = (steps: Step[], initialStep = "step_a"): ProcessBody =>
  ({ fields: [{ id: "field_due", key: "due", label: "Due", type: "text" }], workflow: { initialStep, steps } }) as unknown as ProcessBody;

// step_a --(manual)--> step_b (terminal). Plain two-step body for the pure tests.
const simpleBody = (): ProcessBody =>
  mkBody([
    step("step_a", { paths: [manualPath("path_ab", "step_b")] }),
    step("step_b", { terminal: true }),
  ]);

const inst = (over: Record<string, unknown> = {}): Instance =>
  ({
    instanceId: "inst_x", processId: pid, version: 1, definitionHash: "x",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-01-01T00:00:00Z", ...over,
  }) as unknown as Instance;

const baseOpts = (): StepEntryOpts => ({ pathId: "path_ab" as HistoryEntry["pathId"], cause: "user", actorId: "user_1", actions: [] });

// A deadline reading an unseeded field: evaluate() raises, so arming drops it
// with reason "expression-raised" — the planner's own event, distinct from
// anything a caller supplies via opts.events.
const dueTimer = { id: "timer_d1", deadline: cel("data.due"), onFire: { actions: [] } };

const subprocessTarget = (): Step =>
  step("step_sub", {
    type: "subprocess",
    subprocess: { processId: "proc_child", versionBinding: "pinned", pinnedVersion: 1, inputMapping: {}, outputMapping: {} },
  });

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events`;
});

// --- 5.4: status derivation (pure) ---------------------------------------------

test("status: terminal target with no override completes the instance", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(inst({ status: "running" }), target, body, baseOpts());
  expect(plan.instance.status).toBe("completed");
});

test("status: non-terminal target with no override carries the instance's status", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_a")!;
  const plan = planStepEntry(inst({ status: "running" }), target, body, baseOpts());
  expect(plan.instance.status).toBe("running");
});

test("status: an explicit override wins over the derived default", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!; // terminal -> would derive "completed"
  const plan = planStepEntry(inst({ status: "running" }), target, body, { ...baseOpts(), status: "cancelled" });
  expect(plan.instance.status).toBe("cancelled");
});

// --- opts.timers (pure) ---------------------------------------------------------

test("a supplied timer set replaces arming and drives nextTimerAt, with no drops", () => {
  const body = mkBody([step("step_b", { terminal: true, timers: [dueTimer] })]);
  const target = body.workflow.steps[0]!;
  const supplied: TimerState[] = [{ timerId: "timer_supplied", fireAt: "2026-09-01T00:00:00.000Z" } as unknown as TimerState];
  // The instance arrives carrying a timer the supplied set omits. The committed set
  // wholly replaces what was carried rather than merging with it — the replacement
  // rule the timers carve-out preserves. The carried fireAt is deliberately EARLIER
  // than the supplied one, so a merge would surface twice: in the set and in
  // nextTimerAt, which would report the carried timer as the earliest.
  const carried = { timerId: "timer_carried", fireAt: "2026-08-01T00:00:00.000Z" } as unknown as TimerState;
  const plan = planStepEntry(inst({ timers: [carried] }), target, body, { ...baseOpts(), timers: supplied });
  expect(plan.instance.timers).toEqual(supplied);
  expect((plan.instance.timers ?? []).map((t: TimerState) => t.timerId as string)).not.toContain("timer_carried");
  expect(plan.nextTimerAt).toBe("2026-09-01T00:00:00.000Z");
  expect(plan.events).toHaveLength(0); // the target's own dueTimer is not armed, so it cannot drop
});

test("arming from the target step also replaces a carried timer", () => {
  const body = mkBody([step("step_b", { terminal: true, timers: [{ id: "timer_ok", duration: "PT1H", onFire: { actions: [] } }] })]);
  const target = body.workflow.steps[0]!;
  const carried = { timerId: "timer_carried", fireAt: "2026-08-01T00:00:00.000Z" } as unknown as TimerState;
  const plan = planStepEntry(inst({ timers: [carried] }), target, body, baseOpts());
  expect((plan.instance.timers ?? []).map((t: TimerState) => t.timerId as string)).toEqual(["timer_ok"]);
});

test("with no timers override, the target step is armed and its drop is recorded", () => {
  const body = mkBody([step("step_b", { terminal: true, timers: [dueTimer] })]);
  const target = body.workflow.steps[0]!;
  const plan = planStepEntry(inst(), target, body, baseOpts()); // data.due unseeded -> raises
  expect(plan.instance.timers).toEqual([]);
  expect(plan.nextTimerAt).toBeNull();
  expect(plan.events).toHaveLength(1);
  expect(plan.events[0]!.kind).toBe("timer.unarmed");
});

// --- opts.entryVersion (pure) ----------------------------------------------------

test("entryVersion overrides the version on both the HistoryEntry and a drop event", () => {
  const body = mkBody([step("step_b", { terminal: true, timers: [dueTimer] })]);
  const target = body.workflow.steps[0]!;
  const plan = planStepEntry(inst({ version: 1 }), target, body, { ...baseOpts(), entryVersion: 7 });
  expect(plan.entry.version).toBe(7);
  expect(plan.events).toHaveLength(1);
  expect(plan.events[0]!.version).toBe(7);
});

test("with no entryVersion override, the instance's own version is recorded", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(inst({ version: 3 }), target, body, baseOpts());
  expect(plan.entry.version).toBe(3);
});

// --- opts.events (pure) ----------------------------------------------------------

test("caller-supplied events are appended to the plan's own drop events", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const extra: InstanceEvent = {
    id: "evt_caller_1a2b3c4d-0000-4000-8000-000000000099",
    instanceId: "inst_x",
    transitionSeq: 1,
    version: 1,
    kind: "timer.fired",
    payload: { timerId: "timer_1a2b3c4d-0000-4000-8000-000000000099" },
    at: "2026-01-01T00:00:00Z",
  } as unknown as InstanceEvent;
  const plan = planStepEntry(inst(), target, body, { ...baseOpts(), events: [extra] });
  expect(plan.events).toEqual([extra]); // no drops of its own here, so only the supplied event
});

// --- opts.suppressSpawn (pure) ---------------------------------------------------

test("suppressSpawn omits the spawn row entering a subprocess target", () => {
  const body = mkBody([subprocessTarget()]);
  const target = body.workflow.steps[0]!;
  const plan = planStepEntry(inst(), target, body, { ...baseOpts(), suppressSpawn: true });
  expect(plan.outbox.some((r) => r.action.type === SPAWN_ACTION_TYPE)).toBe(false);
});

test("without suppressSpawn, entering a subprocess target enqueues a spawn keyed on the new sequence", () => {
  const body = mkBody([subprocessTarget()]);
  const target = body.workflow.steps[0]!;
  const from = inst({ transitionSeq: 4 });
  const plan = planStepEntry(from, target, body, baseOpts());
  const spawnRow = plan.outbox.find((r) => r.action.type === SPAWN_ACTION_TYPE);
  expect(spawnRow).toBeDefined();
  // A different transitionSeq derives a different deterministic child id, which
  // the spawn handler's existence guard (keyed on that id) does not match.
  const idAtThisSeq = subprocessChildId(from.instanceId, from.transitionSeq + 1, target.id as string);
  const idAtAnotherSeq = subprocessChildId(from.instanceId, from.transitionSeq + 2, target.id as string);
  expect(idAtThisSeq).not.toBe(idAtAnotherSeq);
  expect(spawnRow!.idempotencyKey).toBe(idempotencyKey(from.instanceId, from.transitionSeq + 1, spawnRow!.actionId));
});

// --- the subprocess return (pure) -------------------------------------------------

test("a terminal target with a parent enqueues exactly one return row", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!; // terminal
  const withParent = inst({ parent: { instanceId: "inst_parent", stepId: "step_p_sub" } });
  const plan = planStepEntry(withParent, target, body, baseOpts());
  const returns = plan.outbox.filter((r) => r.action.type === RETURN_ACTION_TYPE);
  expect(returns).toHaveLength(1);
});

test("a terminal target with no parent enqueues no return row", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(inst(), target, body, baseOpts()); // no `parent`
  expect(plan.outbox.some((r) => r.action.type === RETURN_ACTION_TYPE)).toBe(false);
});

test("a non-terminal target with a parent enqueues no return row", () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_a")!; // not terminal
  const withParent = inst({ parent: { instanceId: "inst_parent", stepId: "step_p_sub" } });
  const plan = planStepEntry(withParent, target, body, baseOpts());
  expect(plan.outbox.some((r) => r.action.type === RETURN_ACTION_TYPE)).toBe(false);
});

// --- 5.10: defaults reproduce current behaviour exactly (pure) -------------------

test("with no overrides at all, every default matches today's behaviour", () => {
  const body = mkBody([step("step_b", { terminal: true, timers: [{ id: "timer_ok", duration: "PT1H", onFire: { actions: [] } }] })]);
  const target = body.workflow.steps[0]!;
  const from = inst({ version: 5, status: "running" });
  const plan = planStepEntry(from, target, body, baseOpts());
  expect(plan.instance.status).toBe("completed"); // derived from target.terminal
  expect(plan.entry.version).toBe(5); // the instance's own version
  expect((plan.instance.timers ?? []).map((t: TimerState) => t.timerId as string)).toEqual(["timer_ok"]); // armed from the target
  expect(plan.events).toHaveLength(0); // only the planner's own events, and it dropped nothing
});

// --- DB-backed: applyStepEntry ----------------------------------------------------

test.skipIf(!DB)("planning a step entry writes nothing until it is applied", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  planStepEntry(i, target, body, baseOpts()); // never applied

  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(0); // unchanged
  const hist = (await sql`SELECT 1 FROM history_entries WHERE instance_id = ${i.instanceId}`) as unknown[];
  expect(hist).toHaveLength(0);
});

test.skipIf(!DB)("a caller writes an extra row atomically with the applied plan", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(i, target, body, baseOpts());

  const extraKey = `test-extra-${i.instanceId}`;
  await withTransaction(sql, async (tx) => {
    await applyStepEntry(tx, plan);
    await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
      VALUES (${extraKey}, ${i.instanceId}, ${plan.entry.transitionSeq}, 'action_extra', ${{}})`;
  });

  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(1);
  const extra = (await sql`SELECT 1 FROM outbox WHERE idempotency_key = ${extraKey}`) as unknown[];
  expect(extra).toHaveLength(1);
});

test.skipIf(!DB)("a failure after the extra write rolls back both the plan and the extra row", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(i, target, body, baseOpts());

  const extraKey = `test-extra-${i.instanceId}`;
  let raised: unknown;
  try {
    await withTransaction(sql, async (tx) => {
      await applyStepEntry(tx, plan);
      await tx`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
        VALUES (${extraKey}, ${i.instanceId}, ${plan.entry.transitionSeq}, 'action_extra', ${{}})`;
      throw new Error("boom");
    });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);

  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(0); // rolled back
  const extra = (await sql`SELECT 1 FROM outbox WHERE idempotency_key = ${extraKey}`) as unknown[];
  expect(extra).toHaveLength(0);
});

test.skipIf(!DB)("extraFields is written under the OCC predicate: applied from a stale sequence, none of it lands", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(i, target, body, baseOpts());

  // Advance the row out from under the plan before applying it.
  await sql`UPDATE instances SET transition_seq = 9 WHERE instance_id = ${i.instanceId}`;

  let raised: unknown;
  try {
    await withTransaction(sql, (tx) => applyStepEntry(tx, plan, { data: { field_marker: "should-not-land" } }));
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(ConcurrencyConflict);

  const row = (await sql`SELECT body FROM instances WHERE instance_id = ${i.instanceId}`) as { body: unknown }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  expect((parsed as { data: Record<string, unknown> }).data).not.toHaveProperty("field_marker");
});

// A plan carries freshly minted record ids and is safe to recompute after a failed
// apply. Both branches of "at most once" are checked, because the two are guarded by
// different mechanisms: a rolled-back apply leaves the sequence untouched so the
// replan is legitimate, while a committed one is stopped by the OCC predicate before
// any insert — which is also what keeps the deterministic outbox key from colliding.

test.skipIf(!DB)("a replanned entry after a rolled-back apply commits exactly once", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const opts = { ...baseOpts(), actions: [act("a1")] };

  let raised: unknown;
  try {
    await withTransaction(sql, async (tx) => {
      await applyStepEntry(tx, planStepEntry(i, target, body, opts));
      throw new Error("boom");
    });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);

  // The rollback left transitionSeq untouched, so the same instance replans validly.
  await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(i, target, body, opts)));

  const rows = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as { transition_seq: number }[];
  expect(rows[0]!.transition_seq).toBe(1);
  expect((await sql`SELECT id FROM history_entries WHERE instance_id = ${i.instanceId}`) as unknown[]).toHaveLength(1);
  expect((await sql`SELECT idempotency_key FROM outbox WHERE instance_id = ${i.instanceId}`) as unknown[]).toHaveLength(1);
});

test.skipIf(!DB)("replanning after a successful apply loses on the concurrency predicate", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const opts = { ...baseOpts(), actions: [act("a1")] };

  await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(i, target, body, opts)));

  // Replanned from the same, now stale, instance. The OCC fires on the UPDATE, so the
  // colliding outbox key is never reached and the failure is a conflict, not a
  // duplicate-key error.
  let raised: unknown;
  try {
    await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(i, target, body, opts)));
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(ConcurrencyConflict);

  expect((await sql`SELECT id FROM history_entries WHERE instance_id = ${i.instanceId}`) as unknown[]).toHaveLength(1);
  expect((await sql`SELECT idempotency_key FROM outbox WHERE instance_id = ${i.instanceId}`) as unknown[]).toHaveLength(1);
});

test.skipIf(!DB)("applyStepEntry writes a supplied field patch alongside its own fields", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(i, target, body, baseOpts());

  await withTransaction(sql, (tx) => applyStepEntry(tx, plan, { data: { field_marker: "patched" } }));

  const row = (await sql`SELECT body FROM instances WHERE instance_id = ${i.instanceId}`) as { body: unknown }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  expect((parsed as { data: Record<string, unknown> }).data).toEqual({ field_marker: "patched" });
  expect((parsed as { status: string }).status).toBe("completed"); // the plan's own field, alongside the patch
});

test.skipIf(!DB)("extraFields cannot overwrite the plan's own fields", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const plan = planStepEntry(i, target, body, baseOpts());

  // A caller colliding with the plan's keys. The plan wins: a body sequence taken
  // from the patch would disagree with the promoted column and the OCC predicate,
  // both of which use the plan's value, and rehydrate reads the body.
  await withTransaction(sql, (tx) =>
    applyStepEntry(tx, plan, { transitionSeq: 99, status: "running", data: { field_marker: "ok" } }));

  const row = (await sql`SELECT body, transition_seq FROM instances WHERE instance_id = ${i.instanceId}`) as
    { body: unknown; transition_seq: number }[];
  const parsed = (typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body) as
    { transitionSeq: number; status: string; data: Record<string, unknown> };
  expect(parsed.transitionSeq).toBe(1); // the plan's, not the patch's 99
  expect(row[0]!.transition_seq).toBe(1); // column and body agree
  expect(parsed.status).toBe("completed"); // derived from the terminal target, not the patch's "running"
  expect(parsed.data).toEqual({ field_marker: "ok" }); // a non-colliding key still lands
});

test.skipIf(!DB)("opts.events are written in the commit transaction and roll back with it", async () => {
  const body = simpleBody();
  const i = await createInstance(body, { processId: pid, version: 1 });
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!;
  const extra: InstanceEvent = {
    id: "evt_caller_1a2b3c4d-0000-4000-8000-000000000042",
    instanceId: i.instanceId,
    transitionSeq: i.transitionSeq + 1,
    version: i.version,
    kind: "timer.fired",
    payload: { timerId: "timer_1a2b3c4d-0000-4000-8000-000000000042" },
    at: "2026-01-01T00:00:00Z",
  } as unknown as InstanceEvent;
  const plan = planStepEntry(i, target, body, { ...baseOpts(), events: [extra] });

  await withTransaction(sql, (tx) => applyStepEntry(tx, plan));
  const rows = (await sql`SELECT id FROM instance_events WHERE instance_id = ${i.instanceId}`) as { id: string }[];
  expect(rows.map((r) => r.id)).toEqual([extra.id]);
});

test.skipIf(!DB)("suppressSpawn enqueues no spawn row; the same commit without it does", async () => {
  const child = mkBody([subprocessTarget(), step("step_out", { terminal: true })]);
  child.workflow.steps[0]!.paths = [manualPath("path_out", "step_out")] as unknown as Step["paths"];
  const target = child.workflow.steps[0]!;

  const i1 = await createInstance(child, { processId: pid, version: 1 });
  await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(i1, target, child, { ...baseOpts(), suppressSpawn: true })));
  const spawns1 = (await sql`SELECT action_id FROM outbox WHERE instance_id = ${i1.instanceId} AND action->>'type' = ${SPAWN_ACTION_TYPE}`) as unknown[];
  expect(spawns1).toHaveLength(0);

  const i2 = await createInstance(child, { processId: pid, version: 1 });
  await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(i2, target, child, baseOpts())));
  const spawns2 = (await sql`SELECT action_id FROM outbox WHERE instance_id = ${i2.instanceId} AND action->>'type' = ${SPAWN_ACTION_TYPE}`) as unknown[];
  expect(spawns2).toHaveLength(1);
});

test.skipIf(!DB)("a terminal entry with a parent enqueues exactly one return row", async () => {
  const body = simpleBody();
  const target = body.workflow.steps.find((s) => (s.id as string) === "step_b")!; // terminal
  const child = await createInstance(body, {
    processId: pid, version: 1,
    parent: { instanceId: "inst_parent_1", stepId: "step_p_sub" as unknown as Instance["currentStepId"] },
  });
  await withTransaction(sql, (tx) => applyStepEntry(tx, planStepEntry(child, target, body, baseOpts())));

  const returns = (await sql`SELECT action_id FROM outbox WHERE instance_id = ${child.instanceId} AND action->>'type' = ${RETURN_ACTION_TYPE}`) as unknown[];
  expect(returns).toHaveLength(1);
});

// --- 4.2/4.3: equivalence — a captured expectation, not a re-derivation ----------

test.skipIf(!DB)("the nothing-supplied path (via executeManualTransition) writes exactly the expected shape", async () => {
  const body = mkBody([
    step("step_a", { onExit: [act("exit1")], paths: [manualPath("path_ab", "step_b")] }),
    step("step_b", { terminal: true, onEntry: [act("entry1")] }),
  ]);
  const i = await createInstance(body, { processId: pid, version: 1 });

  const result = await executeManualTransition(i, "path_ab", body, actor as never);

  expect(result.currentStepId as string).toBe("step_b");
  expect(result.transitionSeq).toBe(1);
  expect(result.status).toBe("completed"); // step_b is terminal

  const row = (await sql`SELECT body, transition_seq, next_timer_at FROM instances WHERE instance_id = ${i.instanceId}`) as
    { body: unknown; transition_seq: number; next_timer_at: string | null }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  expect(parsed).toMatchObject({ currentStepId: "step_b", transitionSeq: 1, status: "completed", timers: [] });
  expect(row[0]!.transition_seq).toBe(1);
  expect(row[0]!.next_timer_at).toBeNull();

  const hist = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${i.instanceId}`) as { entry: unknown }[];
  expect(hist).toHaveLength(1);
  const entry = (typeof hist[0]!.entry === "string" ? JSON.parse(hist[0]!.entry as string) : hist[0]!.entry) as HistoryEntry;
  expect({ ...entry, id: undefined, at: undefined }).toMatchObject({
    instanceId: i.instanceId, transitionSeq: 1, version: 1, pathId: "path_ab",
    fromStepId: "step_a", toStepId: "step_b", cause: "user", actorId: "user_1",
  });

  const outboxIds = ((await sql`SELECT action_id FROM outbox WHERE instance_id = ${i.instanceId} ORDER BY action_id`) as { action_id: string }[])
    .map((r) => r.action_id);
  expect(outboxIds).toEqual(["entry1", "exit1"]);
});

// --- faulted-status gate: executeManualTransition no-ops on a non-running instance -

test.skipIf(!DB)("a manual transition is ignored on a faulted instance", async () => {
  const body = simpleBody();
  const created = await createInstance(body, { processId: pid, version: 1 });
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${created.instanceId}`;
  const faulted = { ...created, status: "faulted" } as Instance;

  const result = await executeManualTransition(faulted, "path_ab", body, actor as never);

  expect(result).toBe(faulted); // same reference back: no commit attempted
  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${created.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(0); // unchanged
  const hist = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${created.instanceId}`) as unknown[];
  expect(hist).toHaveLength(0); // no HistoryEntry appended
});

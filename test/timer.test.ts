/**
 * Timers: arm on entry, disarm on exit, the two firing semantics (transition with
 * guard bypass, reminder as a side effect), fire-once under concurrency, and the
 * scheduler firing an overdue timer. DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, fireTimer, resolveAutomatic, startInstance } from "../src/engine/transition.js";
import { drainTimers } from "../src/engine/timers.js";
import type { ProcessBody, Instance, Action } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const cel = (src: string) => ({ lang: "cel", src });
const act = (id: string, type: string) => ({ id, type, config: {} }) as unknown as Action;

// step_a --ab(manual)--> step_wait (wait-state: auto path_go guard data.go=="yes" [parks];
// carries `timer`) --path_go--> step_done (terminal).
const waitTimerBody = (timer: unknown): ProcessBody =>
  ({
    fields: [{ id: "field_go", key: "go", label: "Go", type: "text" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: "A", type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        { id: "step_wait", key: "wait", label: "Wait", type: "task", timers: [timer],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const transitionTimer = { id: "timer_t1", duration: "PT1H", onFire: { targetPath: "path_go", actions: [act("action_esc", "notify")] } };
const reminderTimer = { id: "timer_r1", duration: "PT1H", onFire: { actions: [act("action_rem", "notify")] } };

const createFrom = (body: ProcessBody) => createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readInst = async (id: string): Promise<any> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return typeof r[0].body === "string" ? JSON.parse(r[0].body as string) : r[0].body;
};
const nextTimerAt = async (id: string): Promise<string | null> =>
  ((await sql`SELECT next_timer_at FROM instances WHERE instance_id = ${id}`) as { next_timer_at: string | null }[])[0].next_timer_at;
const outboxActionIds = async (id: string): Promise<string[]> =>
  ((await sql`SELECT action_id FROM outbox WHERE instance_id = ${id} ORDER BY action_id`) as { action_id: string }[]).map((r) => r.action_id);
const historyCauses = async (id: string): Promise<string[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry as string) : (row.entry as { cause: string })).cause);
};

beforeAll(async () => { if (DB) await initSchema(); });
beforeEach(async () => { if (DB) await sql`TRUNCATE outbox, instances, history_entries`; });

// --- 6.1 arm on entry ---------------------------------------------------------

test.skipIf(!DB)("a duration timer is armed with fireAt = entry + duration; next_timer_at set", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  const before = Date.now();
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait");
  const row = await readInst(inst.instanceId);
  expect(row.timers).toHaveLength(1);
  expect(row.timers[0].timerId).toBe("timer_t1");
  const fireAtMs = new Date(row.timers[0].fireAt).getTime();
  expect(fireAtMs).toBeGreaterThanOrEqual(before + 3_600_000 - 5000);
  expect(fireAtMs).toBeLessThanOrEqual(Date.now() + 3_600_000 + 5000);
  expect(await nextTimerAt(inst.instanceId)).not.toBeNull();
});

test.skipIf(!DB)("a step without timers arms nothing", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body); // sits on step_a (manual, no timer)
  const row = await readInst(inst.instanceId);
  expect(row.timers ?? []).toHaveLength(0);
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
});

// --- initial-step arming is atomic with creation (regression: no strand window) -

const initialWaitBody = (timer: unknown): ProcessBody =>
  ({
    fields: [{ id: "field_go", key: "go", label: "Go", type: "text" }],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: "Wait", type: "task", timers: [timer],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: "Done", type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("an initial timer-bearing wait-state is armed atomically at creation", async () => {
  const body = initialWaitBody(transitionTimer);
  const started = await startInstance(body, { processId: "proc_1" as Instance["processId"], version: 1 }, actor);
  expect(started.currentStepId as string).toBe("step_wait"); // guard false -> parks at seq 0
  expect(started.transitionSeq).toBe(0);
  // Armed in the same row that creation wrote — not a separate post-INSERT UPDATE.
  const row = await readInst(started.instanceId);
  expect(row.timers).toHaveLength(1);
  expect(row.timers[0].timerId).toBe("timer_t1");
  expect(await nextTimerAt(started.instanceId)).not.toBeNull();
});

// --- 6.2 transition timer: guard bypass, cause timer, actions enqueued ---------

test.skipIf(!DB)("a transition timer forces its target path despite a false guard", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor); // go unset -> guard false -> parks
  expect(parked.currentStepId as string).toBe("step_wait");

  await fireTimer(parked, "timer_t1", body); // guard still false
  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_done"); // forced despite the false guard
  expect(row.status).toBe("completed");
  expect(await historyCauses(inst.instanceId)).toContain("timer");
  expect(await outboxActionIds(inst.instanceId)).toContain("action_esc"); // onFire action enqueued
});

// --- 6.3 reminder timer: side effect only, fire-once --------------------------

test.skipIf(!DB)("a reminder timer enqueues actions and marks fired without moving; no re-enqueue", async () => {
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  await fireTimer(parked, "timer_r1", body);
  let row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_wait"); // did not move
  expect(row.transitionSeq).toBe(parked.transitionSeq); // no seq bump
  expect(row.timers[0].fired).toBe(true);
  expect(await outboxActionIds(inst.instanceId)).toEqual(["action_rem"]);
  expect(await nextTimerAt(inst.instanceId)).toBeNull(); // only timer, now fired

  await fireTimer(parked, "timer_r1", body); // second poll
  expect(await outboxActionIds(inst.instanceId)).toEqual(["action_rem"]); // not re-enqueued
});

// --- 6.4 disarm on a normal exit ----------------------------------------------

test.skipIf(!DB)("taking a normal transition off a timer-bearing step disarms its timer", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  expect((await readInst(inst.instanceId)).timers).toHaveLength(1);

  // Write go=yes and re-resolve: the automatic path fires, leaving step_wait.
  await sql`UPDATE instances SET body = jsonb_set(body, '{data,field_go}', '"yes"'::jsonb) WHERE instance_id = ${inst.instanceId}`;
  const withGo = await readInst(inst.instanceId);
  await resolveAutomatic(withGo as Instance, body, actor);

  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_done");
  expect(row.timers ?? []).toHaveLength(0); // the step_wait timer is gone
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
});

// --- 6.5 fire-once under concurrency ------------------------------------------

test.skipIf(!DB)("two concurrent fireTimer calls commit exactly one transition", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  const results = await Promise.allSettled([
    fireTimer(parked, "timer_t1", body),
    fireTimer(parked, "timer_t1", body),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1); // the OCC loser
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_done");
  expect((await historyCauses(inst.instanceId)).filter((c) => c === "timer")).toHaveLength(1);
});

// --- 6.6 scheduler fires an overdue timer -------------------------------------

test.skipIf(!DB)("the scheduler fires an overdue timer on its first pass", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // armed ~1h out
  // Simulate elapsed time / a restart after the fire time: backdate the timer.
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${inst.instanceId}`;

  expect(await drainTimers(sql, () => body)).toBe(1);
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_done");
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
});

/**
 * Timers: arm on entry (duration and deadline), disarm on exit, the two firing
 * semantics (transition with guard bypass, reminder as a side effect), fire-once
 * under concurrency, and the scheduler firing an overdue timer. DB-backed; skips
 * when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach, spyOn } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { cancelInstance, executeManualTransition, fireTimer, resolveAutomatic, startInstance } from "../src/engine/transition.js";
import { drainTimers } from "../src/engine/timers.js";
import { CANCEL_SINK_STEP_ID } from "../src/schema/definition.js";
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
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "text" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers: [timer],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
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
// timestamptz comes back driver-shaped (Date or string); normalize for an exact compare.
const nextTimerIso = async (id: string): Promise<string | null> => {
  const v = await nextTimerAt(id);
  return v === null ? null : new Date(v).toISOString();
};
const outboxActionIds = async (id: string): Promise<string[]> =>
  ((await sql`SELECT action_id FROM outbox WHERE instance_id = ${id} ORDER BY action_id`) as { action_id: string }[]).map((r) => r.action_id);
const historyCauses = async (id: string): Promise<string[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((row) => (typeof row.entry === "string" ? JSON.parse(row.entry as string) : (row.entry as { cause: string })).cause);
};
// The instance's runtime events, ordered as the record defines: by `at`, then
// insertion (the id tiebreak is stable, not chronological — several events written
// in one commit share an `at`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventsOf = async (id: string): Promise<any[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${id} ORDER BY event->>'at', id`) as { event: unknown }[];
  return r.map((row) => (typeof row.event === "string" ? JSON.parse(row.event as string) : row.event));
};

beforeAll(async () => { if (DB) await initSchema(); });
beforeEach(async () => { if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events`; });

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
    baseLocale: "en",
    fields: [{ id: "field_go", key: "go", label: { en: "Go" }, type: "text" }],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers: [timer],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
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

test.skipIf(!DB)("a reminder fire records a timer.fired event carrying the seq in force", async () => {
  // The fired flag says a fire happened without saying when or what it delivered;
  // the event is the fire's own runtime record.
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  await fireTimer(parked, "timer_r1", body);
  const events = await eventsOf(inst.instanceId);
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe("timer.fired");
  expect(events[0].payload).toEqual({ timerId: "timer_r1" });
  expect(events[0].version).toBe(1); // resolves the timer id against the definition in force
  // Carried, not advanced: the event names the seq the instance was at, and the
  // instance is still at it. A reminder is not a hop.
  expect(events[0].transitionSeq).toBe(parked.transitionSeq);
  expect((await readInst(inst.instanceId)).transitionSeq).toBe(parked.transitionSeq);
  // No HistoryEntry: the only history is the manual hop that entered step_wait.
  expect(await historyCauses(inst.instanceId)).toEqual(["user"]);
});

test.skipIf(!DB)("a second reminder poll re-emits no timer.fired event", async () => {
  // The event is appended behind the same guard as the fired flag, so the existing
  // no-op covers it: a redundant fire enqueues nothing AND records nothing.
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  await fireTimer(parked, "timer_r1", body);
  expect(await eventsOf(inst.instanceId)).toHaveLength(1);

  await fireTimer(parked, "timer_r1", body); // already fired
  expect(await eventsOf(inst.instanceId)).toHaveLength(1); // not a second record
  expect(await outboxActionIds(inst.instanceId)).toEqual(["action_rem"]);
});

test.skipIf(!DB)("a reminder fire against a moved-off instance records no event", async () => {
  // The other no-op guard: the UPDATE is gated on the observed seq, so a scheduler
  // holding a stale instance that has since transitioned writes nothing at all.
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  await sql`UPDATE instances SET body = jsonb_set(body, '{data,field_go}', '"yes"'::jsonb) WHERE instance_id = ${inst.instanceId}`;
  const withGo = await readInst(inst.instanceId);
  await resolveAutomatic(withGo as Instance, body, actor); // leaves step_wait, seq bumps
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_done");

  await fireTimer(parked, "timer_r1", body); // stale instance, stale seq
  expect(await eventsOf(inst.instanceId)).toHaveLength(0);
  expect(await outboxActionIds(inst.instanceId)).toHaveLength(0);
});

// --- faulted-status gate: fireTimer no-ops on a non-running instance -----------

test.skipIf(!DB)("a transition timer is ignored on a faulted instance", async () => {
  const body = waitTimerBody(transitionTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${inst.instanceId}`;

  await fireTimer({ ...parked, status: "faulted" } as Instance, "timer_t1", body);
  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_wait"); // did not move
  expect(row.transitionSeq).toBe(parked.transitionSeq); // no seq bump
  expect(await historyCauses(inst.instanceId)).toEqual(["user"]); // only the manual hop that parked it
  expect(await outboxActionIds(inst.instanceId)).toHaveLength(0); // onFire action not enqueued
});

test.skipIf(!DB)("a reminder timer is ignored on a faulted instance", async () => {
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"faulted"'::jsonb) WHERE instance_id = ${inst.instanceId}`;

  await fireTimer({ ...parked, status: "faulted" } as Instance, "timer_r1", body);
  const row = await readInst(inst.instanceId);
  expect(row.timers[0].fired).toBeUndefined(); // fired flag unchanged (never set)
  expect(await eventsOf(inst.instanceId)).toHaveLength(0); // no timer.fired event
  expect(await outboxActionIds(inst.instanceId)).toHaveLength(0); // no action enqueued
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

// --- deadline timers -----------------------------------------------------------

// The waitTimerBody shape plus a `due` field for a deadline expression to read, and
// an open step list so a step can carry several timers. initialStep is a parameter
// so the same body serves both arming call sites (transition and creation).
const deadlineBody = (timers: unknown[], initialStep = "step_a"): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [
      { id: "field_go", key: "go", label: { en: "Go" }, type: "text" },
      { id: "field_due", key: "due", label: { en: "Due" }, type: "text" },
    ],
    workflow: {
      initialStep,
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers,
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const dueTimer = { id: "timer_d1", deadline: cel("data.due"), onFire: { targetPath: "path_go", actions: [act("action_esc", "notify")] } };
const seeded = (body: ProcessBody, data: Record<string, unknown>) =>
  createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1, data: data as Instance["data"] });

test.skipIf(!DB)("a deadline timer arms with the instant its expression yields, normalized to UTC", async () => {
  // One case per accepted instant shape; the deadline reads the seeded field in all three.
  const cases: [string, string][] = [
    ["2026-08-01T09:00:00Z", "2026-08-01T09:00:00.000Z"],
    ["2026-08-01", "2026-08-01T00:00:00.000Z"], // date-only -> midnight UTC
    ["2026-08-01T10:00:00+02:00", "2026-08-01T08:00:00.000Z"], // offset -> UTC
  ];
  const body = deadlineBody([dueTimer]);
  for (const [due, fireAt] of cases) {
    const inst = await seeded(body, { field_due: due });
    await executeManualTransition(inst, "path_ab", body, actor);
    const row = await readInst(inst.instanceId);
    expect(row.timers).toHaveLength(1);
    expect(row.timers[0].timerId).toBe("timer_d1");
    expect(row.timers[0].fireAt).toBe(fireAt);
    expect(row.timers[0].fired).toBeUndefined();
    expect(row.timers[0].provenance).toEqual({ kind: "deadline", src: "data.due", armedAt: expect.any(String) });
    expect(await nextTimerIso(inst.instanceId)).toBe(fireAt);
  }
});

test.skipIf(!DB)("a deadline and a duration timer on one step both arm; next_timer_at is the earlier", async () => {
  // The deadline is in the past, the duration an hour out — so the earlier fireAt is
  // the deadline's, and next_timer_at cannot be right by accident of arming order.
  const body = deadlineBody([dueTimer, reminderTimer]);
  const inst = await seeded(body, { field_due: "2020-01-01T00:00:00Z" });
  await executeManualTransition(inst, "path_ab", body, actor);

  const row = await readInst(inst.instanceId);
  expect(row.timers.map((t: { timerId: string }) => t.timerId).sort()).toEqual(["timer_d1", "timer_r1"]);
  const byId = Object.fromEntries(row.timers.map((t: { timerId: string; fireAt: string }) => [t.timerId, t.fireAt]));
  expect(byId.timer_d1).toBe("2020-01-01T00:00:00.000Z");
  expect(new Date(byId.timer_r1).getTime()).toBeGreaterThan(Date.now()); // ~1h out
  expect(await nextTimerIso(inst.instanceId)).toBe("2020-01-01T00:00:00.000Z");
});

// The one form both branches must produce: a four-digit year, milliseconds, `Z`,
// 24 characters. minFireAt sorts armed fireAt values lexically, so a value in the
// expanded-year form (`+029405-01-26T...`) would win that sort on its leading `+`
// (0x2B, below every digit) regardless of the instant it denotes, suppressing every
// other timer on the step.
const FIXED_WIDTH = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test.skipIf(!DB)("a duration and a deadline timer arm the same fixed-width form; the earlier is selected", async () => {
  // Each case declares the LATER timer first, so picking the first-armed timer is
  // wrong in both; the deadline sits on the opposite side of the duration in each,
  // so a fixed preference for either branch is wrong in one. Only true
  // chronological order passes both.
  const cases: { due: string; timers: unknown[]; earlier: string }[] = [
    { due: "2020-01-01T00:00:00Z", timers: [reminderTimer, dueTimer], earlier: "timer_d1" },
    { due: "2030-01-01T00:00:00Z", timers: [dueTimer, reminderTimer], earlier: "timer_r1" },
  ];
  for (const c of cases) {
    const later = c.earlier === "timer_d1" ? "timer_r1" : "timer_d1";
    expect((c.timers[0] as { id: string }).id).toBe(later); // the case discriminates

    const body = deadlineBody(c.timers);
    const inst = await seeded(body, { field_due: c.due });
    await executeManualTransition(inst, "path_ab", body, actor);

    const row = await readInst(inst.instanceId);
    const byId = Object.fromEntries(
      row.timers.map((t: { timerId: string; fireAt: string }) => [t.timerId, t.fireAt]),
    ) as Record<string, string>;
    expect(Object.keys(byId).sort()).toEqual(["timer_d1", "timer_r1"]);
    expect(byId.timer_d1).toMatch(FIXED_WIDTH); // deadline branch
    expect(byId.timer_r1).toMatch(FIXED_WIDTH); // duration branch

    // Compared as epoch ms, not as strings: the assertion states the chronology the
    // selection must reflect rather than restating minFireAt's lexical comparison.
    const earlyAt = byId[c.earlier] as string;
    expect(new Date(earlyAt).getTime()).toBeLessThan(new Date(byId[later] as string).getTime());
    expect(await nextTimerIso(inst.instanceId)).toBe(earlyAt);
  }
});

test.skipIf(!DB)("a deadline reading an unwritten field commits the entry and arms only the other timer", async () => {
  const body = deadlineBody([dueTimer, reminderTimer]);
  const inst = await createFrom(body); // no seed: `due` is absent from data
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait"); // the entry committed

  const row = await readInst(inst.instanceId);
  expect(row.timers.map((t: { timerId: string }) => t.timerId)).toEqual(["timer_r1"]); // deadline omitted
  expect(await nextTimerAt(inst.instanceId)).not.toBeNull(); // the duration timer still sets it
});

test.skipIf(!DB)("a deadline yielding a non-instant string commits the entry and is not armed", async () => {
  const body = deadlineBody([dueTimer]);
  const inst = await seeded(body, { field_due: "next tuesday" }); // resolves, does not parse
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait");

  expect((await readInst(inst.instanceId)).timers ?? []).toHaveLength(0);
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
});

// --- an omitted timer is recorded rather than dropped silently ------------------

// A second deadline reading the same field, so a step can drop every timer it
// declares and the entry still has to commit.
const dueTimer2 = { id: "timer_d2", deadline: cel("data.due"), onFire: { targetPath: "path_go", actions: [act("action_esc2", "notify")] } };

test.skipIf(!DB)("a deadline that raises records timer.unarmed with reason expression-raised", async () => {
  const body = deadlineBody([dueTimer]);
  const inst = await createFrom(body); // no seed: `due` is absent, so evaluation raises
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  const events = await eventsOf(inst.instanceId);
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe("timer.unarmed");
  expect(events[0].payload).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
  // The entry's own seq, and the version the dropped timer id resolves against.
  expect(events[0].transitionSeq).toBe(parked.transitionSeq);
  expect(events[0].version).toBe(1);
});

test.skipIf(!DB)("a deadline yielding a non-instant records timer.unarmed with reason not-an-instant", async () => {
  const body = deadlineBody([dueTimer]);
  const inst = await seeded(body, { field_due: "next tuesday" }); // resolves, does not parse
  await executeManualTransition(inst, "path_ab", body, actor);

  const events = await eventsOf(inst.instanceId);
  expect(events).toHaveLength(1);
  expect(events[0].payload.timerId).toBe("timer_d1");
  // The two causes are distinguished at the point that knows them, so the reason
  // separates this drop from the raising one above rather than collapsing into it.
  expect(events[0].payload.reason).toBe("not-an-instant");
  expect(events[0].payload.reason).not.toBe("expression-raised");
});

test.skipIf(!DB)("one dropped timer records one event while the other arms and drives next_timer_at", async () => {
  const body = deadlineBody([dueTimer, reminderTimer]);
  const inst = await createFrom(body); // `due` unwritten: the deadline drops, the duration arms
  await executeManualTransition(inst, "path_ab", body, actor);

  const row = await readInst(inst.instanceId);
  expect(row.timers.map((t: { timerId: string }) => t.timerId)).toEqual(["timer_r1"]);
  // The drop does not suppress the surviving timer's bound: selection reflects it.
  expect(await nextTimerIso(inst.instanceId)).toBe(row.timers[0].fireAt);

  const events = await eventsOf(inst.instanceId);
  expect(events).toHaveLength(1); // exactly one — the armed timer records nothing
  expect(events[0].payload).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
});

test.skipIf(!DB)("dropping every timer on a step still commits the entry and records each drop", async () => {
  // Arming is total. It runs inside the transition commit, so a step that loses all
  // of its bounds must still land the entry — recorded as unarmed, never raised.
  const body = deadlineBody([dueTimer, dueTimer2]);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait"); // the entry committed

  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_wait");
  expect(row.timers ?? []).toHaveLength(0);
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
  expect(await historyCauses(inst.instanceId)).toEqual(["user"]); // the entry is on the record

  const events = await eventsOf(inst.instanceId);
  expect(events.map((e) => e.payload.timerId).sort()).toEqual(["timer_d1", "timer_d2"]);
  // Both carry the entry's seq: several events sharing one sequence is expected.
  expect(events.every((e) => e.transitionSeq === parked.transitionSeq)).toBe(true);
});

test.skipIf(!DB)("a deadline dropped on the initial step is recorded at creation", async () => {
  // The other arming call site: createInstance, which writes no HistoryEntry and
  // rests at seq 0, so the event is the only record the drop can leave.
  const body = deadlineBody([dueTimer], "step_wait");
  const inst = await createFrom(body); // no seed, initial step is the deadline-bearing one
  expect(inst.currentStepId as string).toBe("step_wait");
  expect(inst.transitionSeq).toBe(0);
  expect((await readInst(inst.instanceId)).timers ?? []).toHaveLength(0);

  const events = await eventsOf(inst.instanceId);
  expect(events).toHaveLength(1);
  expect(events[0].kind).toBe("timer.unarmed");
  expect(events[0].payload).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
  expect(events[0].transitionSeq).toBe(0); // creation advances no sequence
  expect(await historyCauses(inst.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("a step whose timers all arm records no timer.unarmed event", async () => {
  const body = deadlineBody([dueTimer, reminderTimer]);
  const inst = await seeded(body, { field_due: "2026-08-01T09:00:00Z" });
  await executeManualTransition(inst, "path_ab", body, actor);

  expect((await readInst(inst.instanceId)).timers).toHaveLength(2);
  expect(await eventsOf(inst.instanceId)).toHaveLength(0);
});

test.skipIf(!DB)("a writeback of the field an omitted deadline reads does not re-arm it", async () => {
  // A deadline is evaluated once, at entry. Writing `due` afterwards (the shape a
  // post-commit action writeback takes) leaves the timer unarmed forever.
  const body = deadlineBody([dueTimer]);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  expect((await readInst(inst.instanceId)).timers ?? []).toHaveLength(0);

  await sql`UPDATE instances SET body = jsonb_set(body, '{data,field_due}', '"2026-08-01T09:00:00Z"'::jsonb) WHERE instance_id = ${inst.instanceId}`;
  const withDue = await readInst(inst.instanceId);
  await resolveAutomatic(withDue as Instance, body, actor); // go still unset -> stays parked

  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_wait");
  expect(row.timers ?? []).toHaveLength(0); // still unarmed
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
});

test.skipIf(!DB)("a deadline already in the past arms as-is and the scheduler fires it", async () => {
  const body = deadlineBody([dueTimer]);
  const inst = await seeded(body, { field_due: "2020-01-01T00:00:00Z" });
  await executeManualTransition(inst, "path_ab", body, actor);
  // Armed with the past instant — not clamped to now, not skipped, not fired in the commit.
  expect((await readInst(inst.instanceId)).timers[0].fireAt).toBe("2020-01-01T00:00:00.000Z");
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_wait");
  expect(await nextTimerIso(inst.instanceId)).toBe("2020-01-01T00:00:00.000Z");

  expect(await drainTimers(sql, () => body)).toBe(1); // due on the first poll
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_done");
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
  // The whole chain, and the only test that traverses it: the deadline is ARMED,
  // that armed fireAt drives next_timer_at, the scheduler selects the row, and the
  // fire is a guard-bypassing forced transition with its onFire action delivered.
  // Asserting this on the direct-fireTimer test below would not cover arming —
  // fireTimer resolves the timer from the body, not from instance.timers, so it
  // fires whether or not the timer was ever armed.
  expect(await historyCauses(inst.instanceId)).toContain("timer");
  expect(await outboxActionIds(inst.instanceId)).toContain("action_esc");
});

test.skipIf(!DB)("an armed deadline timer forces its target path despite a false guard", async () => {
  // Once armed, a deadline timer is indistinguishable from a duration timer.
  const body = deadlineBody([dueTimer]);
  const inst = await seeded(body, { field_due: "2026-08-01T09:00:00Z" });
  const parked = await executeManualTransition(inst, "path_ab", body, actor); // go unset -> parks
  expect(parked.currentStepId as string).toBe("step_wait");

  await fireTimer(parked, "timer_d1", body); // guard still false
  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_done"); // forced despite the false guard
  expect(row.status).toBe("completed");
  expect(await historyCauses(inst.instanceId)).toContain("timer");
  expect(await outboxActionIds(inst.instanceId)).toContain("action_esc");
});

test.skipIf(!DB)("a deadline on the initial step is armed over seed data in the INSERT", async () => {
  const body = deadlineBody([dueTimer], "step_wait");
  const inst = await seeded(body, { field_due: "2026-08-01T09:00:00Z" });
  expect(inst.currentStepId as string).toBe("step_wait");
  expect(inst.transitionSeq).toBe(0); // creation, not a transition

  const row = await readInst(inst.instanceId);
  expect(row.timers).toHaveLength(1);
  expect(row.timers[0].timerId).toBe("timer_d1");
  expect(row.timers[0].fireAt).toBe("2026-08-01T09:00:00.000Z");
  expect(await nextTimerIso(inst.instanceId)).toBe("2026-08-01T09:00:00.000Z");
});

// A deadline that reads `actor` — the authoring checker registers `actor` in the
// deadline scope, and the ternary infers to `string`, so this is publishable. Every
// other deadline here reads `data.due`, which is actor-independent: arming with a
// transition's real actor instead of the system identity would leave them all green.
const actorDeadlineTimer = {
  id: "timer_d1",
  deadline: cel('actor.id == "system" ? "2026-08-01T09:00:00Z" : "2030-01-01T00:00:00Z"'),
  onFire: { targetPath: "path_go", actions: [act("action_esc", "notify")] },
};
const SYSTEM_FIRE_AT = "2026-08-01T09:00:00.000Z";

test.skipIf(!DB)("arming uses the system identity, so both call sites arm the same fireAt", async () => {
  // Same steps and same timer; the two bodies differ only in initialStep, which is
  // what selects the call site — creation arms step_wait, a transition arms it via
  // executeManualTransition carrying `actor` (user_1, not the system identity).
  const created = await createFrom(deadlineBody([actorDeadlineTimer], "step_wait"));
  expect(created.currentStepId as string).toBe("step_wait");
  expect(created.transitionSeq).toBe(0); // creation, not a transition
  const createdRow = await readInst(created.instanceId);
  expect(createdRow.timers).toHaveLength(1);
  expect(createdRow.timers[0].timerId).toBe("timer_d1");
  expect(createdRow.timers[0].fireAt).toBe(SYSTEM_FIRE_AT);
  expect(await nextTimerIso(created.instanceId)).toBe(SYSTEM_FIRE_AT);

  const transitionBody = deadlineBody([actorDeadlineTimer]);
  const inst = await createFrom(transitionBody);
  const parked = await executeManualTransition(inst, "path_ab", transitionBody, actor);
  expect(parked.currentStepId as string).toBe("step_wait");
  const movedRow = await readInst(inst.instanceId);
  expect(movedRow.timers).toHaveLength(1);
  // The system branch, not the "2030-..." branch the caller's actor would select.
  expect(movedRow.timers[0].fireAt).toBe(SYSTEM_FIRE_AT);
  expect(await nextTimerIso(inst.instanceId)).toBe(SYSTEM_FIRE_AT);

  // Deterministic across call sites: the two entries agree.
  expect(movedRow.timers[0].fireAt).toBe(createdRow.timers[0].fireAt);
});

// Deadlines that read `instance`. Arming is handed the instance as of the entry being
// committed — the TARGET step and the NEW seq — not the instance the transition started
// from. Every other deadline here reads `data.due` or `actor`, neither of which that
// distinction moves, so arming from the pre-transition instance leaves them all green.
// Each ternary branch is a different instant, so the wrong instance is a wrong fireAt.
const enteringStepTimer = {
  id: "timer_d1",
  deadline: cel('instance.currentStepId == "step_wait" ? "2026-08-01T09:00:00Z" : "2030-01-01T00:00:00Z"'),
  onFire: { targetPath: "path_go", actions: [act("action_esc", "notify")] },
};
const enteringSeqTimer = {
  id: "timer_d2",
  deadline: cel('instance.transitionSeq == 1 ? "2026-08-02T09:00:00Z" : "2030-01-01T00:00:00Z"'),
  onFire: { targetPath: "path_go", actions: [act("action_esc2", "notify")] },
};

test.skipIf(!DB)("a deadline armed by a transition sees the target step and the new seq", async () => {
  const body = deadlineBody([enteringStepTimer, enteringSeqTimer]);
  const inst = await createFrom(body);
  // The values the pre-transition instance carries: both select the "2030-..." branch.
  expect(inst.currentStepId as string).toBe("step_a");
  expect(inst.transitionSeq).toBe(0);

  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait");
  expect(parked.transitionSeq).toBe(1);

  const row = await readInst(inst.instanceId);
  const byId = Object.fromEntries(
    row.timers.map((t: { timerId: string; fireAt: string }) => [t.timerId, t.fireAt]),
  ) as Record<string, string>;
  expect(Object.keys(byId).sort()).toEqual(["timer_d1", "timer_d2"]);
  expect(byId.timer_d1).toBe("2026-08-01T09:00:00.000Z"); // step_wait, not step_a
  expect(byId.timer_d2).toBe("2026-08-02T09:00:00.000Z"); // seq 1, not seq 0
  expect(await nextTimerIso(inst.instanceId)).toBe("2026-08-01T09:00:00.000Z");
});

test.skipIf(!DB)("cancel still commits to the sink from a deadline-armed step, disarming it", async () => {
  // The cancel path arms through commitTransition with the synthesized sink, which
  // declares no timers: the source step's armed deadline is disarmed, nothing replaces it.
  const body = deadlineBody([dueTimer], "step_wait");
  const withSink = {
    ...body,
    workflow: { ...body.workflow, steps: [...body.workflow.steps, { id: CANCEL_SINK_STEP_ID, key: "cancelled", label: { en: "Cancelled" }, type: "task", terminal: true }] },
  } as unknown as ProcessBody;
  const inst = await seeded(withSink, { field_due: "2026-08-01T09:00:00Z" });
  expect(await nextTimerAt(inst.instanceId)).not.toBeNull(); // armed at creation

  const cancelled = await cancelInstance(inst, withSink, actor);
  expect(cancelled.currentStepId as string).toBe(CANCEL_SINK_STEP_ID);
  expect(cancelled.status).toBe("cancelled");
  expect((await readInst(inst.instanceId)).timers ?? []).toHaveLength(0);
  expect(await nextTimerAt(inst.instanceId)).toBeNull();
  expect(await historyCauses(inst.instanceId)).toEqual(["cancel"]);
});

// --- poison-row isolation: a corrupt row at the scan head does not block ------

test.skipIf(!DB)("an unparseable row at the head of the timer scan does not block due timers", async () => {
  const body = waitTimerBody(reminderTimer);
  const good = await createFrom(body);
  await executeManualTransition(good, "path_ab", body, actor); // arms timer_r1
  // Force the good instance's reminder overdue.
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${good.instanceId}`;
  // A poison row ordered ahead of it (earlier next_timer_at): status 'running' so it
  // is selected, but no other Instance fields, so parseInstance throws at the head.
  await sql`INSERT INTO instances (instance_id, transition_seq, body, next_timer_at)
    VALUES (${"inst_poison"}, ${0}, ${{ status: "running" }}, '2019-01-01T00:00:00.000Z')`;

  // The poison sits at the head of ORDER BY next_timer_at; the good timer still fires.
  expect(await drainTimers(sql, () => body)).toBe(1);
  // The poison row's parse failure hit the catch boundary, which pushes it out
  // of the scan too — not just isolates it for this one pass.
  const poisonNext = await nextTimerAt("inst_poison");
  expect(poisonNext).not.toBe("2019-01-01T00:00:00.000Z" as unknown);
  expect(new Date(poisonNext!).getTime()).toBeGreaterThan(Date.now());
});

// --- progress marker: a failing instance leaves the due scan -----------------

test.skipIf(!DB)("a failing timer instance is pushed out of the scan and not reselected on the next pass", async () => {
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor); // arms timer_r1
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${inst.instanceId}`;

  const before = await nextTimerAt(inst.instanceId);
  // A resolver miss exercises the "resolver miss" push path (distinct from the
  // generic catch boundary the poison-row test above exercises).
  expect(await drainTimers(sql, () => undefined)).toBe(0);
  const after = await nextTimerAt(inst.instanceId);
  expect(after).not.toBe(before); // pushed out of the scan
  expect(new Date(after!).getTime()).toBeGreaterThan(Date.now());

  // A second pass, with a working resolver, does not reselect it: its
  // next_timer_at is no longer due, even though the timer's own fireAt (2020)
  // still is — proving the push, not the fireAt, is what kept it out.
  expect(await drainTimers(sql, () => body)).toBe(0);
});

test.skipIf(!DB)("a transient fault heals on its own once the pushed interval elapses", async () => {
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${inst.instanceId}`;

  expect(await drainTimers(sql, () => undefined)).toBe(0); // resolver miss: pushed out ~1 minute
  // Simulate the interval having elapsed (no operator action taken): backdate
  // the pushed next_timer_at into the past, as a later real pass would find it.
  await sql`UPDATE instances SET next_timer_at = now() - interval '1 second' WHERE instance_id = ${inst.instanceId}`;

  // The cause (an unresolvable body) has cleared — a working resolver is now
  // supplied, standing in for the definition becoming resolvable again — and
  // the timer fires without any operator intervening on the row itself.
  expect(await drainTimers(sql, () => body)).toBe(1);
  expect((await readInst(inst.instanceId)).currentStepId).toBe("step_wait"); // reminder: doesn't move
  expect(await nextTimerAt(inst.instanceId)).toBeNull(); // fired, no other timer
});

test.skipIf(!DB)("a concurrently re-armed timer is not clobbered by the push", async () => {
  const body = waitTimerBody(reminderTimer);
  const inst = await createFrom(body);
  await executeManualTransition(inst, "path_ab", body, actor);
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${inst.instanceId}`;

  const REARMED = "2099-01-01T00:00:00.000Z";
  // Stands in for "something else re-armed next_timer_at between this pass's
  // read and its push" — the resolver call is awaited in exactly that window —
  // then reports a miss, so drainTimers still attempts the push.
  const rearmingResolver = async () => {
    await sql`UPDATE instances SET next_timer_at = ${REARMED} WHERE instance_id = ${inst.instanceId}`;
    return undefined;
  };
  expect(await drainTimers(sql, rearmingResolver)).toBe(0);

  // The push's predicate (next_timer_at equal to the STALE 2020 value this
  // pass observed) matched zero rows once the concurrent re-arm landed first,
  // so the newly armed time stands, not "now + 1 minute".
  expect(await nextTimerIso(inst.instanceId)).toBe(REARMED);
});

// --- the per-instance boundary logs -----------------------------------------

// surface-worker-failures: drainTimers' per-instance catch used to discard its
// error with no line. The catch sits inside the drain loop, so the tick returns
// normally and pollForever's own line never fires — an instance failing every
// pass was invisible.
test.skipIf(!DB)("an instance the timer drain skips logs an error line carrying its id", async () => {
  const body = waitTimerBody(reminderTimer);
  const good = await createFrom(body);
  await executeManualTransition(good, "path_ab", body, actor);
  await sql`UPDATE instances SET
    body = jsonb_set(body, '{timers,0,fireAt}', '"2020-01-01T00:00:00.000Z"'::jsonb),
    next_timer_at = '2020-01-01T00:00:00.000Z'
    WHERE instance_id = ${good.instanceId}`;
  // 'running' so the scan selects it, but no other Instance field, so
  // parseInstance throws — the same seam the poison-row test above uses.
  await sql`INSERT INTO instances (instance_id, transition_seq, body, next_timer_at)
    VALUES (${"inst_logged_poison"}, ${0}, ${{ status: "running" }}, '2019-01-01T00:00:00.000Z')`;

  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  const fired = await drainTimers(sql, () => body);
  const lines = errorSpy.mock.calls
    .map((c) => JSON.parse(c[0] as string) as Record<string, unknown>)
    .filter((l) => l.msg === "worker skipped a failing item");
  errorSpy.mockRestore();

  expect(lines).toHaveLength(1);
  expect(lines[0].level).toBe("error");
  expect(lines[0].worker).toBe("timers");
  expect(lines[0].instanceId).toBe("inst_logged_poison");
  expect(typeof lines[0].error).toBe("string");

  expect(fired).toBe(1); // the rest of the batch still ran
});

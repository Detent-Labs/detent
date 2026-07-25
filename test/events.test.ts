/**
 * InstanceEvent: the record's shape (schema-only), and the guarantees the
 * runtime-events spec makes about the log itself — an event records the seq in
 * force without advancing it, several events share a seq and order by their
 * instant, an event carries the version in force, events do not outlive a
 * rolled-back commit, and the log is queryable by kind. The DB-backed half skips
 * when DATABASE_URL is unset.
 */
import { describe, it, test, expect, beforeAll, beforeEach } from "bun:test";
import { instanceEvent } from "../src/schema/definition.js";
import type { Action, Instance, InstanceEvent, ProcessBody } from "../src/schema/definition.js";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, fireTimer } from "../src/engine/transition.js";
import { idempotencyKey } from "../src/engine/idempotency.js";
import type { Actor } from "../src/cel/eval.js";

const fired = () => ({
  id: "evt_1a2b3c4d-0000-4000-8000-000000000001",
  instanceId: "inst_1a2b3c4d-0000-4000-8000-000000000002",
  transitionSeq: 3,
  version: 1,
  kind: "timer.fired",
  at: "2026-07-20T10:00:00.000Z",
  payload: { timerId: "timer_1a2b3c4d-0000-4000-8000-000000000003" },
});

const unarmed = () => ({
  ...fired(),
  kind: "timer.unarmed",
  payload: {
    timerId: "timer_1a2b3c4d-0000-4000-8000-000000000003",
    reason: "not-an-instant",
  },
});

const spawnEnqueued = () => ({
  ...fired(),
  transitionSeq: 0,
  kind: "subprocess.spawn-enqueued",
  payload: { stepId: "step_1a2b3c4d-0000-4000-8000-000000000005" },
});

const faulted = () => ({
  ...fired(),
  kind: "instance.faulted",
  payload: {
    stepId: "step_1a2b3c4d-0000-4000-8000-000000000005",
    reason: "automatic-cascade-loop",
  },
});

describe("InstanceEvent", () => {
  it("accepts both declared kinds", () => {
    expect(instanceEvent.safeParse(fired()).success).toBe(true);
    expect(instanceEvent.safeParse(unarmed()).success).toBe(true);
  });

  it("accepts subprocess.spawn-enqueued with and without outcomes", () => {
    expect(instanceEvent.safeParse(spawnEnqueued()).success).toBe(true);
    const withOutcome = {
      ...spawnEnqueued(),
      actions: [
        {
          actionId: "action_spawn_step_1a2b3c4d-0000-4000-8000-000000000005",
          resolvedHandler: "core.spawnSubprocess",
          idempotencyKey: "key-1",
          status: "succeeded",
          attempts: 1,
          at: "2026-07-20T10:00:01.000Z",
        },
      ],
    };
    expect(instanceEvent.safeParse(withOutcome).success).toBe(true);
  });

  it("rejects an extra key on the subprocess.spawn-enqueued payload", () => {
    const e = spawnEnqueued();
    expect(instanceEvent.safeParse({ ...e, payload: { ...e.payload, parentSeq: 0 } }).success).toBe(false);
    // And the kind's own payload is required: a sibling kind's does not satisfy it.
    expect(instanceEvent.safeParse({ ...e, payload: fired().payload }).success).toBe(false);
  });

  it("accepts an event carrying action outcomes", () => {
    const e = {
      ...fired(),
      actions: [
        {
          actionId: "action_1a2b3c4d-0000-4000-8000-000000000004",
          resolvedHandler: "notify.email",
          idempotencyKey: "key-1",
          status: "succeeded",
          attempts: 1,
          at: "2026-07-20T10:00:01.000Z",
        },
      ],
    };
    expect(instanceEvent.safeParse(e).success).toBe(true);
  });

  it("rejects a wrong id prefix", () => {
    expect(instanceEvent.safeParse({ ...fired(), id: "hist_1a2b3c4d-0000-4000-8000-000000000001" }).success).toBe(false);
    expect(instanceEvent.safeParse({ ...fired(), id: "1a2b3c4d-0000-4000-8000-000000000001" }).success).toBe(false);
  });

  it("rejects a payload that does not match its kind", () => {
    // timer.unarmed's reason on a timer.fired payload.
    expect(instanceEvent.safeParse({ ...fired(), payload: unarmed().payload }).success).toBe(false);
    // timer.fired's payload on a timer.unarmed event: no reason.
    expect(instanceEvent.safeParse({ ...unarmed(), payload: fired().payload }).success).toBe(false);
  });

  it("rejects an unknown reason on timer.unarmed", () => {
    const e = unarmed();
    expect(instanceEvent.safeParse({ ...e, payload: { ...e.payload, reason: "unresolved" } }).success).toBe(false);
  });

  it("accepts instance.faulted and rejects an unknown reason", () => {
    const e = faulted();
    expect(instanceEvent.safeParse(e).success).toBe(true);
    expect(instanceEvent.safeParse({ ...e, payload: { ...e.payload, reason: "unknown-cause" } }).success).toBe(false);
  });

  it("rejects a missing version", () => {
    const { version, ...rest } = fired();
    expect(instanceEvent.safeParse(rest).success).toBe(false);
  });

  it("rejects an undeclared kind", () => {
    expect(instanceEvent.safeParse({ ...fired(), kind: "migration.applied" }).success).toBe(false);
  });
});

// --- the log's own guarantees (DB-backed) --------------------------------------

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const cel = (src: string) => ({ lang: "cel", src });
const act = (id: string, type: string) => ({ id, type, config: {} }) as unknown as Action;

// step_a --ab(manual)--> step_wait (carries `timers`; its automatic path parks
// while `go` is unset) --path_go--> step_done. `initialStep` selects which arming
// call site runs: step_a exercises commitTransition, step_wait createInstance.
const waitBody = (
  timers: unknown[],
  opts: { initialStep?: string; onEntry?: unknown[] } = {},
): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [
      { id: "field_go", key: "go", label: { en: "Go" }, type: "text" },
      { id: "field_due", key: "due", label: { en: "Due" }, type: "text" },
    ],
    workflow: {
      initialStep: opts.initialStep ?? "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_wait", trigger: "manual" }] },
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers,
          ...(opts.onEntry ? { onEntry: opts.onEntry } : {}),
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// A deadline reading `due`. Unseeded it raises (expression-raised); seeded with a
// string that resolves but does not parse it yields not-an-instant; seeded with a
// real instant it arms. One timer, three outcomes, selected by the seed alone.
const dueTimer = { id: "timer_d1", deadline: cel("data.due"), onFire: { targetPath: "path_go", actions: [act("action_esc", "notify")] } };
const reminder = (id: string, actionId: string) => ({ id, duration: "PT1H", onFire: { actions: [act(actionId, "notify")] } });

const createFrom = (body: ProcessBody, data: Record<string, unknown> = {}, version = 1) =>
  createInstance(body, { processId: "proc_1" as Instance["processId"], version, data: data as Instance["data"] });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readInst = async (id: string): Promise<any> => {
  const r = (await sql`SELECT body FROM instances WHERE instance_id = ${id}`) as { body: unknown }[];
  return typeof r[0].body === "string" ? JSON.parse(r[0].body as string) : r[0].body;
};
const asJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
/** One instance's events, ordered by their recorded instant then insertion. */
const eventsOf = async (id: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events
    WHERE instance_id = ${id} ORDER BY event->>'at', id`) as { event: unknown }[];
  return r.map((row) => asJson(row.event) as InstanceEvent);
};
/** The log queried by kind, across every instance. */
const eventsOfKind = async (kind: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events
    WHERE kind = ${kind} ORDER BY instance_id, event->>'at'`) as { event: unknown }[];
  return r.map((row) => asJson(row.event) as InstanceEvent);
};
/** A payload widened out of its branded ids, so it compares structurally. */
const payloadOf = (e: InstanceEvent | undefined): Record<string, unknown> | undefined =>
  e?.payload as Record<string, unknown> | undefined;
const historyCount = async (id: string): Promise<number> =>
  ((await sql`SELECT count(*)::int AS n FROM history_entries WHERE instance_id = ${id}`) as { n: number }[])[0].n;

beforeAll(async () => { if (DB) await initSchema(); });
beforeEach(async () => { if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events`; });

// --- 6.1 the sequence in force, and ordering within it -------------------------

test.skipIf(!DB)("an event records the transitionSeq in force without advancing it", async () => {
  // Two emitters at one seq: the entry drops the unresolvable deadline, then the
  // reminder fires. Neither is a hop, so the instance must still be at seq 1.
  const body = waitBody([dueTimer, reminder("timer_r1", "action_rem")]);
  const inst = await createFrom(body); // `due` unseeded -> the deadline raises at entry
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.transitionSeq).toBe(1);

  const afterEntry = await eventsOf(inst.instanceId);
  expect(afterEntry).toHaveLength(1);
  expect(afterEntry[0].kind).toBe("timer.unarmed");
  expect(afterEntry[0].transitionSeq).toBe(1); // the seq in force, not 0 and not 2
  // The instance itself, read back: the event carried 1 and left the instance at 1.
  expect((await readInst(inst.instanceId)).transitionSeq).toBe(1);

  await fireTimer(parked, "timer_r1", body);
  const afterFire = await eventsOf(inst.instanceId);
  expect(afterFire).toHaveLength(2);
  expect(afterFire[1].kind).toBe("timer.fired");
  expect(afterFire[1].transitionSeq).toBe(1);
  expect((await readInst(inst.instanceId)).transitionSeq).toBe(1); // still 1
  // One hop, one HistoryEntry: the two events did not manufacture transitions.
  expect(await historyCount(inst.instanceId)).toBe(1);
});

test.skipIf(!DB)("several events at one sequence are all retained and ordered by their instant", async () => {
  // Three events at seq 1 — one drop at entry, then two reminder fires, spaced so
  // their recorded instants are distinct and the causal order is checkable.
  const body = waitBody([dueTimer, reminder("timer_r1", "action_r1"), reminder("timer_r2", "action_r2")]);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);

  await new Promise((r) => setTimeout(r, 5));
  await fireTimer(parked, "timer_r1", body);
  await new Promise((r) => setTimeout(r, 5));
  await fireTimer(parked, "timer_r2", body);

  const evts = await eventsOf(inst.instanceId); // ordered by `at`
  expect(evts).toHaveLength(3); // all retained — sharing a seq is not a collision
  expect(evts.map((e) => e.transitionSeq)).toEqual([1, 1, 1]);
  expect(evts.map((e) => e.kind)).toEqual(["timer.unarmed", "timer.fired", "timer.fired"]);
  expect(evts.map((e) => ("timerId" in e.payload ? (e.payload.timerId as string) : undefined))).toEqual(["timer_d1", "timer_r1", "timer_r2"]);
  // Ordering by `at` is the causal order, not an accident of the id sort above.
  const at = evts.map((e) => new Date(e.at as string).getTime());
  expect(at[0]).toBeLessThan(at[1]);
  expect(at[1]).toBeLessThan(at[2]);
  expect((await readInst(inst.instanceId)).transitionSeq).toBe(1);
});

test.skipIf(!DB)("an event carries the definition version in force", async () => {
  // Version 7, not the default 1: the emitter must read the instance's pin rather
  // than defaulting. Both call sites are covered — createInstance arms the initial
  // step here, commitTransition the entered step below.
  const created = await createFrom(waitBody([dueTimer], { initialStep: "step_wait" }), {}, 7);
  const atCreation = await eventsOf(created.instanceId);
  expect(atCreation).toHaveLength(1);
  expect(atCreation[0].version).toBe(7);
  expect(atCreation[0].transitionSeq).toBe(0); // creation advances no sequence

  const body = waitBody([dueTimer]);
  const inst = await createFrom(body, {}, 7);
  await executeManualTransition(inst, "path_ab", body, actor);
  const atEntry = await eventsOf(inst.instanceId);
  expect(atEntry).toHaveLength(1);
  expect(atEntry[0].version).toBe(7);
  // The payload's timer id resolves against that version's body — the reason the
  // version is carried at all.
  const step = body.workflow.steps.find((s) => (s.id as string) === "step_wait");
  const entryPayload = atEntry[0].payload;
  expect((step?.timers ?? []).some((t) => "timerId" in entryPayload && (t.id as string) === entryPayload.timerId)).toBe(true);
});

// --- 6.2 atomicity -------------------------------------------------------------

test.skipIf(!DB)("a failed commit persists neither the state change nor its events", async () => {
  // A genuine failure inside the transaction, raised after the events are appended:
  // the outbox PK is the deterministic idempotency key, so squatting on the key the
  // entry's onEntry action will use makes its INSERT a unique violation. The commit
  // order is UPDATE -> HistoryEntry -> events -> outbox, so the events exist in the
  // transaction when it dies and only the rollback can remove them.
  const body = waitBody([dueTimer], { onEntry: [act("action_entry", "notify")] });
  const inst = await createFrom(body); // `due` unseeded -> the entry would drop timer_d1
  const squatted = idempotencyKey(inst.instanceId, 1, "action_entry");
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${squatted}, ${inst.instanceId}, 1, 'action_entry', ${{}})`;

  let raised: unknown;
  try {
    await executeManualTransition(inst, "path_ab", body, actor);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);

  const row = await readInst(inst.instanceId);
  expect(row.currentStepId).toBe("step_a"); // the hop rolled back
  expect(row.transitionSeq).toBe(0);
  expect(await historyCount(inst.instanceId)).toBe(0);
  expect(await eventsOf(inst.instanceId)).toHaveLength(0); // no event outlived it
});

// --- 6.3 queryability ----------------------------------------------------------

test.skipIf(!DB)("querying the timer.unarmed kind returns every instance that dropped a timer", async () => {
  const transitionBody = waitBody([dueTimer]);
  const initialBody = waitBody([dueTimer], { initialStep: "step_wait" });

  // Raised expression, via a transition.
  const raised = await createFrom(transitionBody);
  await executeManualTransition(raised, "path_ab", transitionBody, actor);
  // Resolved but unparseable value, via a transition.
  const nonInstant = await createFrom(transitionBody, { field_due: "next tuesday" });
  await executeManualTransition(nonInstant, "path_ab", transitionBody, actor);
  // A drop on the step the instance was created on — the other arming call site.
  const atCreation = await createFrom(initialBody);
  // A control that dropped nothing: its deadline resolves to a real instant.
  const armedOk = await createFrom(transitionBody, { field_due: "2026-08-01T09:00:00Z" });
  await executeManualTransition(armedOk, "path_ab", transitionBody, actor);

  const dropped = await eventsOfKind("timer.unarmed");
  const byInstance = new Map(dropped.map((e) => [e.instanceId as string, e]));
  expect(dropped).toHaveLength(3);
  // Each instance that lost a timer is returned, with the timer and the reason.
  expect(payloadOf(byInstance.get(raised.instanceId))).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
  expect(payloadOf(byInstance.get(nonInstant.instanceId))).toEqual({ timerId: "timer_d1", reason: "not-an-instant" });
  expect(payloadOf(byInstance.get(atCreation.instanceId))).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
  expect(byInstance.has(armedOk.instanceId)).toBe(false);
});

// --- 6.4 a step whose timers all arm ------------------------------------------

test.skipIf(!DB)("a step whose timers all arm records no timer.unarmed event", async () => {
  // Both branches of arming succeed: a duration timer and a deadline over a seeded
  // instant. A drop event here would mean arming reports omissions it did not make.
  const body = waitBody([dueTimer, reminder("timer_r1", "action_rem")]);
  const inst = await createFrom(body, { field_due: "2026-08-01T09:00:00Z" });
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait");

  const row = await readInst(inst.instanceId);
  expect(row.timers.map((t: { timerId: string }) => t.timerId).sort()).toEqual(["timer_d1", "timer_r1"]);
  expect(await eventsOfKind("timer.unarmed")).toHaveLength(0);
  expect(await eventsOf(inst.instanceId)).toHaveLength(0); // the entry emitted nothing at all
});

// --- creation-site guarantees -------------------------------------------------
// createInstance is the second emit site and its INSERT is `ON CONFLICT DO NOTHING`
// for a redelivered subprocess spawn. Both guarantees below were mutation-verified
// as uncovered: deleting the RETURNING guard, and moving the append out of the
// transaction, each left the suite green.

// The initial step IS the wait-state, so creation arms it and drops the deadline.
const initialDropBody = (): ProcessBody =>
  ({
    baseLocale: "en",
    fields: [{ id: "field_due", key: "due", label: { en: "Due" }, type: "text" }],
    workflow: {
      initialStep: "step_wait",
      steps: [
        { id: "step_wait", key: "wait", label: { en: "Wait" }, type: "task", timers: [dueTimer],
          paths: [{ id: "path_go", key: "go", to: "step_done", trigger: "automatic", priority: 1, guard: cel('data.go == "yes"') }] },
        { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a replayed creation records its drop events only once", async () => {
  // The redelivered-subprocess-spawn path: the same deterministic instanceId twice.
  // Without the RETURNING guard the second call appends a duplicate event set for a
  // row it did not insert. `due` is unseeded, so the deadline drops on both calls.
  const body = initialDropBody();
  const opts = { processId: "proc_1" as Instance["processId"], version: 1, instanceId: "inst_replay_fixture" };
  await createInstance(body, opts);
  await createInstance(body, opts); // conflicts: inserts nothing, must record nothing

  const events = await eventsOf("inst_replay_fixture");
  expect(events).toHaveLength(1);
  expect(events[0]!.kind).toBe("timer.unarmed");
  expect(payloadOf(events[0])).toEqual({ timerId: "timer_d1", reason: "expression-raised" });
});

test.skipIf(!DB)("a failed creation persists neither the instance nor its events", async () => {
  // The creation-site twin of the rollback test above, which covers only
  // commitTransition. The failure has to come from the append itself, and it cannot
  // come from a duplicate id — that INSERT is ON CONFLICT DO NOTHING, so a collision
  // is a silent no-op rather than a raise. A temporary CHECK constraint makes the
  // drop event unwritable, so the append raises after the instance row was inserted.
  const body = initialDropBody();
  const id = "inst_rollback_fixture";
  await sql`ALTER TABLE instance_events ADD CONSTRAINT tmp_no_unarmed CHECK (kind <> 'timer.unarmed')`;
  let raised: unknown;
  try {
    await createInstance(body, { processId: "proc_1" as Instance["processId"], version: 1, instanceId: id });
  } catch (e) {
    raised = e;
  } finally {
    await sql`ALTER TABLE instance_events DROP CONSTRAINT tmp_no_unarmed`;
  }
  expect(raised).toBeInstanceOf(Error);
  const rows = (await sql`SELECT instance_id FROM instances WHERE instance_id = ${id}`) as unknown[];
  expect(rows).toHaveLength(0); // the instance rolled back with its event
});

// --- fireTimer's atomicity ------------------------------------------------------
// The third emit site. The two above cover commitTransition and createInstance;
// mutation-verified as uncovered here: appending on the pool instead of the tx left
// the suite green. The failure has to land AFTER the append inside the same
// transaction, otherwise both the correct and the mutated code roll back alike —
// so the outbox INSERT that follows it is squatted on its deterministic key.
test.skipIf(!DB)("a failed reminder fire persists neither the fired flag nor its event", async () => {
  const body = waitBody([reminder("timer_r1", "action_rem")]);
  const inst = await createFrom(body);
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  expect(parked.currentStepId as string).toBe("step_wait");

  // fireTimer enqueues at the seq it observes; squatting that key makes its INSERT
  // a unique violation, and the commit order is UPDATE -> event -> outbox.
  const squatted = idempotencyKey(inst.instanceId, parked.transitionSeq, "action_rem");
  await sql`INSERT INTO outbox (idempotency_key, instance_id, transition_seq, action_id, action)
    VALUES (${squatted}, ${inst.instanceId}, ${parked.transitionSeq}, 'action_rem', ${{}})`;

  let raised: unknown;
  try {
    await fireTimer(parked, "timer_r1", body);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);

  const row = await readInst(inst.instanceId);
  expect(row.timers[0].fired).toBeUndefined(); // the fire rolled back
  expect(await eventsOfKind("timer.fired")).toHaveLength(0); // and took its event
});

// --- schema round-trip ----------------------------------------------------------
// The rejecting tests above parse hand-built literals. This is the only assertion
// that what an emitter actually persists still satisfies the contract, so emitter
// drift is caught by more than `tsc`.
test.skipIf(!DB)("a persisted event parses back through instanceEvent", async () => {
  const body = waitBody([dueTimer, reminder("timer_r1", "action_rem")]);
  const inst = await createFrom(body); // `due` unseeded -> the entry drops timer_d1
  const parked = await executeManualTransition(inst, "path_ab", body, actor);
  await fireTimer(parked, "timer_r1", body);

  const rows = (await sql`SELECT event FROM instance_events WHERE instance_id = ${inst.instanceId}`) as { event: unknown }[];
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const kinds = rows.map((r) => instanceEvent.parse(asJson(r.event)).kind).sort();
  expect(kinds).toEqual(["timer.fired", "timer.unarmed"]);
});

/**
 * The `assignment.unresolved` event: recorded at each step-entry site when a
 * step's declared assignment resolves to no candidate, in the transaction that
 * commits the entry. DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { executeManualTransition, startInstance } from "../src/engine/transition.js";
import { createAssignmentRegistry, registerAssignmentStrategy, createDefaultAssignmentRegistry } from "../src/engine/registry.js";
import type { ProcessBody, Instance, InstanceEvent, HistoryEntry } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };

const eventsOf = async (id: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${id} ORDER BY id`) as { event: unknown }[];
  return r.map((x) => (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as InstanceEvent);
};

const historyOf = async (id: string): Promise<HistoryEntry[]> => {
  const r = (await sql`SELECT entry FROM history_entries WHERE instance_id = ${id} ORDER BY transition_seq`) as { entry: unknown }[];
  return r.map((x) => (typeof x.entry === "string" ? JSON.parse(x.entry) : x.entry) as HistoryEntry);
};

const unresolvedEvents = (events: InstanceEvent[]) => events.filter((e) => e.kind === "assignment.unresolved");

/** step_a (unassigned, initial) -> step_b, whose assignment carries `strategy`. */
const bodyWith = (strategy: { type: string; config: Record<string, unknown> }): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", assignment: { strategy } },
      ],
    },
  }) as unknown as ProcessBody;

/** The same shape, but the assignment sits on the INITIAL step, so creation resolves it. */
const initialAssignedBody = (strategy: { type: string; config: Record<string, unknown> }): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", assignment: { strategy } }],
    },
  }) as unknown as ProcessBody;

const regWith = (resolve: () => Promise<string[]>) => {
  const reg = createAssignmentRegistry();
  registerAssignmentStrategy(reg, "test.strategy", { resolve });
  return reg;
};

const testStrategy = { type: "test.strategy", config: {} };

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, instance_events, history_entries, definitions`;
});

test.skipIf(!DB)("a transition onto a step resolving to nobody records the event and still commits", async () => {
  const body = bodyWith(testStrategy);
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, actor, sql, undefined, regWith(async () => []));

  expect(onB.currentStepId as string).toBe("step_b");
  expect(onB.assignment!.candidates).toEqual([]);

  const [event] = unresolvedEvents(await eventsOf(inst.instanceId));
  expect(event).toBeDefined();
  expect(event!.kind).toBe("assignment.unresolved");
  expect(event!.payload).toEqual({ stepId: "step_b", reason: "no-candidates" });
});

test.skipIf(!DB)("a resolver that raises still commits the transition", async () => {
  const body = bodyWith(testStrategy);
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(
    inst,
    "path_ab",
    body,
    actor,
    sql,
    undefined,
    regWith(async () => {
      throw new Error("directory unreachable");
    }),
  );

  expect(onB.currentStepId as string).toBe("step_b");
  expect(onB.assignment!.candidates).toEqual([]);
  const [event] = unresolvedEvents(await eventsOf(inst.instanceId));
  expect(event!.payload).toEqual({ stepId: "step_b", reason: "resolver-raised" });
});

test.skipIf(!DB)("a resolver exceeding the deadline records the timed-out reason", async () => {
  process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS = "40";
  try {
    const body = bodyWith(testStrategy);
    const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
    const onB = await executeManualTransition(
      inst,
      "path_ab",
      body,
      actor,
      sql,
      undefined,
      regWith(() => new Promise<string[]>((resolve) => setTimeout(() => resolve(["too-late"]), 400))),
    );
    expect(onB.currentStepId as string).toBe("step_b");
    const [event] = unresolvedEvents(await eventsOf(inst.instanceId));
    expect(event!.payload).toEqual({ stepId: "step_b", reason: "timed-out" });
  } finally {
    delete process.env.ASSIGNMENT_RESOLUTION_TIMEOUT_MS;
  }
});

test.skipIf(!DB)("the event shares the entry's transitionSeq", async () => {
  const body = bodyWith(testStrategy);
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  await executeManualTransition(inst, "path_ab", body, actor, sql, undefined, regWith(async () => []));

  const [event] = unresolvedEvents(await eventsOf(inst.instanceId));
  const entry = (await historyOf(inst.instanceId)).find((e) => e.toStepId === "step_b")!;
  expect(entry).toBeDefined();
  expect(event!.transitionSeq).toBe(entry.transitionSeq);
  expect(event!.version).toBe(entry.version);
});

test.skipIf(!DB)("a successful resolution records no event", async () => {
  const body = bodyWith(testStrategy);
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, actor, sql, undefined, regWith(async () => ["user_7"]));

  expect(onB.assignment!.candidates).toEqual(["user_7"]);
  expect(unresolvedEvents(await eventsOf(inst.instanceId))).toEqual([]);
});

test.skipIf(!DB)("a step declaring no assignment records no event", async () => {
  // step_b carries no assignment at all: resolution never runs for it.
  const body = {
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task" },
      ],
    },
  } as unknown as ProcessBody;
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, actor, sql, undefined, regWith(async () => []));

  expect(onB.assignment).toBeUndefined();
  expect(unresolvedEvents(await eventsOf(inst.instanceId))).toEqual([]);
});

test.skipIf(!DB)("a static strategy configured with an empty list records the event too", async () => {
  // Uniform across every registered strategy: the engine does not decide by
  // comparing a type against a literal, and an empty static list stalls just as
  // visibly as a failed lookup.
  const body = bodyWith({ type: "static", config: { candidates: [] } });
  const inst = await createInstance(body, { processId: "proc_ev" as Instance["processId"], version: 1 });
  await executeManualTransition(inst, "path_ab", body, actor, sql, undefined, createDefaultAssignmentRegistry());

  const [event] = unresolvedEvents(await eventsOf(inst.instanceId));
  expect(event!.payload).toEqual({ stepId: "step_b", reason: "no-candidates" });
});

test.skipIf(!DB)("a creation records the event at transitionSeq 0, where no HistoryEntry exists", async () => {
  const body = initialAssignedBody(testStrategy);
  const created = await startInstance(
    body,
    { processId: "proc_ev" as Instance["processId"], version: 1 },
    actor,
    sql,
    regWith(async () => []),
  );

  const [event] = unresolvedEvents(await eventsOf(created.instanceId));
  expect(event).toBeDefined();
  expect(event!.transitionSeq).toBe(0);
  expect(event!.payload).toEqual({ stepId: "step_a", reason: "no-candidates" });
  expect(await historyOf(created.instanceId)).toEqual([]);
});

test.skipIf(!DB)("a creation whose initial step resolves records no event", async () => {
  const body = initialAssignedBody(testStrategy);
  const created = await startInstance(
    body,
    { processId: "proc_ev" as Instance["processId"], version: 1 },
    actor,
    sql,
    regWith(async () => ["user_9"]),
  );
  expect(created.assignment!.candidates).toEqual(["user_9"]);
  expect(unresolvedEvents(await eventsOf(created.instanceId))).toEqual([]);
});

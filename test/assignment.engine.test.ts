/**
 * Engine-level assignment: candidate resolution at step entry (planStepEntry,
 * store.ts::createInstance) and claim/release (transition.ts::claimStep/
 * releaseClaim). DB-backed; skips when DATABASE_URL is unset, matching
 * engine.test.ts's style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import {
  executeManualTransition,
  claimStep,
  releaseClaim,
  delegateClaim,
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimantError,
  startInstance,
  planStepEntry,
} from "../src/engine/transition.js";
import {
  createAssignmentRegistry,
  type AssignmentRegistry,
  type AssignmentContext,
} from "../src/engine/registry.js";
import type { ProcessBody, Instance, InstanceEvent } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const eventsOf = async (id: string): Promise<InstanceEvent[]> => {
  const r = (await sql`SELECT event FROM instance_events WHERE instance_id = ${id} ORDER BY id`) as { event: unknown }[];
  return r.map((x) => (typeof x.event === "string" ? JSON.parse(x.event) : x.event) as InstanceEvent);
};

const DB = !!process.env.DATABASE_URL;
const candidate: Actor = { id: "user_1", roles: [] };
const roleActor: Actor = { id: "user_2", roles: ["role_x"] };
const outsider: Actor = { id: "user_3", roles: [] };

// bun's `expect(promise).rejects` matcher hangs against Bun.sql here (see
// bun-test-rejects-sql-hang memory); assert the caught error directly instead.
async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

const assignedStrategy = { strategy: { type: "static", config: { candidates: ["role_x", "user_1"] } } };

// step_a (unassigned, initial) <-> step_b (assigned), both directions manual —
// re-entering step_b a second time exercises the "recomputed fresh" rule.
const loopBody = (): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          assignment: assignedStrategy,
          paths: [{ id: "path_ba", key: "ba", label: "Ba", to: "step_a", trigger: "manual" }],
        },
      ],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, instance_events, history_entries, definitions`;
});

test.skipIf(!DB)("a step with no assignment leaves instance.assignment unset", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  expect(inst.assignment).toBeUndefined();
});

test.skipIf(!DB)("entering an assignment-bearing step populates candidates atomically with the commit", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  expect(onB.currentStepId as string).toBe("step_b");
  expect(onB.assignment?.candidates).toEqual(["role_x", "user_1"]);
  expect(onB.assignment?.claimedBy).toBeUndefined();
});

test.skipIf(!DB)("re-entering the same step via a loop-back recomputes fresh candidates and clears a prior claim", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  const claimed = await claimStep(onB.instanceId, candidate);
  expect(claimed.assignment?.claimedBy).toBe(candidate.id);

  const backOnA = await executeManualTransition(claimed, "path_ba", body, candidate);
  expect(backOnA.assignment).toBeUndefined(); // step_a declares no assignment

  const onBAgain = await executeManualTransition(backOnA, "path_ab", body, candidate);
  expect(onBAgain.assignment?.candidates).toEqual(["role_x", "user_1"]);
  expect(onBAgain.assignment?.claimedBy).toBeUndefined(); // not carried from the earlier claim
});

test.skipIf(!DB)("claimStep rejects a step with no declared assignment", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  // step_a (the initial step) declares no assignment.
  await rejectsWith(claimStep(inst.instanceId, candidate), NotAssignedError);
});

test.skipIf(!DB)("claimStep succeeds for an eligible candidate by id, rejects a non-candidate", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);

  await rejectsWith(claimStep(onB.instanceId, outsider), NotACandidateError);

  const claimed = await claimStep(onB.instanceId, candidate);
  expect(claimed.assignment?.claimedBy).toBe(candidate.id);
  expect(claimed.assignment?.claimedAt).toBeDefined();

  const events = await eventsOf(onB.instanceId);
  const claimedEvent = events.find((e) => e.kind === "assignment.claimed");
  expect(claimedEvent).toBeDefined();
  expect(claimedEvent!.instanceId).toBe(onB.instanceId);
  expect(claimedEvent!.version).toBe(claimed.version);
  expect(claimedEvent!.transitionSeq).toBe(claimed.transitionSeq); // not advanced
  expect((claimedEvent as unknown as { payload: { actorId: string } }).payload).toEqual({ actorId: candidate.id });
});

test.skipIf(!DB)("claimStep succeeds for an eligible candidate by role", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  const claimed = await claimStep(onB.instanceId, roleActor);
  expect(claimed.assignment?.claimedBy).toBe(roleActor.id);
});

test.skipIf(!DB)("claiming an already-claimed step is rejected", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  await claimStep(onB.instanceId, candidate);
  await rejectsWith(claimStep(onB.instanceId, roleActor), AlreadyClaimedError);
});

test.skipIf(!DB)("releaseClaim succeeds for the claimant, rejects a non-claimant", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  await claimStep(onB.instanceId, candidate);

  await rejectsWith(releaseClaim(onB.instanceId, roleActor), NotClaimantError);

  const released = await releaseClaim(onB.instanceId, candidate);
  expect(released.assignment?.claimedBy).toBeUndefined();
  expect(released.assignment?.claimedAt).toBeUndefined();
  expect(released.assignment?.candidates).toEqual(["role_x", "user_1"]); // unchanged

  const events = await eventsOf(onB.instanceId);
  const releasedEvent = events.find((e) => e.kind === "assignment.released");
  expect(releasedEvent).toBeDefined();
  expect(releasedEvent!.instanceId).toBe(onB.instanceId);
  expect(releasedEvent!.version).toBe(released.version);
  expect(releasedEvent!.transitionSeq).toBe(released.transitionSeq); // not advanced
  expect((releasedEvent as unknown as { payload: { actorId: string } }).payload).toEqual({ actorId: candidate.id });
});

test.skipIf(!DB)("delegateClaim succeeds for the claimant, rejects a non-claimant, and leaves candidates untouched", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  await claimStep(onB.instanceId, candidate);

  await rejectsWith(delegateClaim(onB.instanceId, roleActor, outsider.id), NotClaimantError);

  const delegated = await delegateClaim(onB.instanceId, candidate, outsider.id);
  expect(delegated.assignment?.claimedBy).toBe(outsider.id);
  expect(delegated.assignment?.claimedAt).toBeDefined();
  expect(delegated.assignment?.candidates).toEqual(["role_x", "user_1"]); // unchanged

  const events = await eventsOf(onB.instanceId);
  const delegatedEvent = events.find((e) => e.kind === "assignment.delegated");
  expect(delegatedEvent).toBeDefined();
  expect(delegatedEvent!.instanceId).toBe(onB.instanceId);
  expect(delegatedEvent!.version).toBe(delegated.version);
  expect(delegatedEvent!.transitionSeq).toBe(delegated.transitionSeq); // not advanced
  expect(delegatedEvent!.at).toBe(delegated.assignment!.claimedAt!); // same instant, computed once
  expect((delegatedEvent as unknown as { payload: { fromActorId: string; toActorId: string } }).payload).toEqual({
    fromActorId: candidate.id,
    toActorId: outsider.id,
  });
});

test.skipIf(!DB)("delegateClaim against a non-running instance is a silent no-op", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);
  const claimed = await claimStep(onB.instanceId, candidate);
  // A direct status flip, not `cancelInstance` — that routes through the
  // cancel-sink step, which this suite's hand-built, uncompiled bodies don't
  // carry (only `compileProcessBody` injects it). Flipping `status` alone is
  // enough to exercise the no-op path, without pulling compilation into an
  // otherwise engine-level test.
  await sql`UPDATE instances SET body = jsonb_set(body, '{status}', '"cancelled"') WHERE instance_id = ${claimed.instanceId}`;

  const unchanged = await delegateClaim(claimed.instanceId, candidate, outsider.id);
  expect(unchanged.status).toBe("cancelled");
  expect(unchanged.assignment?.claimedBy).toBe(candidate.id); // no guard or write ran

  const events = await eventsOf(claimed.instanceId);
  expect(events.some((e) => e.kind === "assignment.delegated")).toBe(false);
});

test.skipIf(!DB)("two actors racing to claim the same unclaimed step resolve to exactly one winner", async () => {
  const body = loopBody();
  const inst = await createInstance(body, { processId: "proc_assign" as Instance["processId"], version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate);

  const results = await Promise.allSettled([claimStep(onB.instanceId, candidate), claimStep(onB.instanceId, roleActor)]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  expect(fulfilled.length).toBe(1);
  expect(rejected.length).toBe(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AlreadyClaimedError);
});

// --- registry-backed resolution ----------------------------------------------

// A body whose INITIAL step carries the assignment, so creation — itself a step
// entry — is exercised rather than only a transition.
const assignedInitialBody = (strategy: { type: string; config: Record<string, unknown> }): ProcessBody =>
  ({
    key: "p",
    label: { en: "P" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** A registry whose single entry records every context it was called with. */
const spyRegistry = (candidates: string[] = []): { reg: AssignmentRegistry; calls: AssignmentContext[] } => {
  const calls: AssignmentContext[] = [];
  const reg = createAssignmentRegistry();
  reg.set("spy", {
    resolve: async (ctx) => {
      calls.push(ctx);
      // Yield to the microtask queue: an awaited resolver, not a synchronous one
      // the caller happens to get away with.
      await Promise.resolve();
      return candidates;
    },
  });
  return { reg, calls };
};

const pid = "proc_assign" as Instance["processId"];

test.skipIf(!DB)("a static strategy resolves its configured list verbatim at creation", async () => {
  const body = assignedInitialBody({ type: "static", config: { candidates: ["finance-approver", "user_42"] } });
  const created = await startInstance(body, { processId: pid, version: 1 }, candidate);
  expect(created.assignment?.candidates).toEqual(["finance-approver", "user_42"]);
  expect(created.assignment?.claimedBy).toBeUndefined();
});

test.skipIf(!DB)("a step with no assignment calls no resolver", async () => {
  const { reg, calls } = spyRegistry(["never"]);
  const body = loopBody(); // step_a, the initial step, declares no assignment
  const created = await startInstance(body, { processId: pid, version: 1 }, candidate, sql, reg);
  expect(created.assignment).toBeUndefined();
  expect(calls.length).toBe(0);
});

test.skipIf(!DB)("a resolver returning a promise is awaited and its list lands in candidates", async () => {
  const { reg, calls } = spyRegistry(["role_x", "user_1"]);
  const body = assignedInitialBody({ type: "spy", config: {} });
  const created = await startInstance(body, { processId: pid, version: 1 }, candidate, sql, reg);
  expect(created.assignment?.candidates).toEqual(["role_x", "user_1"]);
  expect(calls.length).toBe(1);
  expect(calls[0]!.stepId).toBe("step_a");
  // The context exposes exactly id, startedBy and data — nothing else.
  expect(Object.keys(calls[0]!.instance).sort()).toEqual(["data", "id", "startedBy"]);
  expect(calls[0]!.instance.id).toBe(created.instanceId);
});

test.skipIf(!DB)("an unregistered strategy type at entry yields empty candidates and the entry commits", async () => {
  const body = loopBody(); // step_b declares `static`
  const emptyReg = createAssignmentRegistry(); // holds nothing, not even `static`
  const inst = await createInstance(body, { processId: pid, version: 1 });
  const onB = await executeManualTransition(inst, "path_ab", body, candidate, sql, undefined, emptyReg);
  expect(onB.currentStepId as string).toBe("step_b");
  expect(onB.assignment?.candidates).toEqual([]);
});

test.skipIf(!DB)("a step whose resolved candidates are empty rejects every actor at claimStep", async () => {
  const body = assignedInitialBody({ type: "static", config: { candidates: [] } });
  const created = await startInstance(body, { processId: pid, version: 1 }, candidate);
  expect(created.assignment?.candidates).toEqual([]);
  // No fallback assignee is substituted — not the starter, not an admin.
  await rejectsWith(claimStep(created.instanceId, candidate), NotACandidateError);
  await rejectsWith(claimStep(created.instanceId, outsider), NotACandidateError);
});

test.skipIf(!DB)("a resolver on a transition carrying a dataPatch sees the merged value", async () => {
  const { reg, calls } = spyRegistry([]);
  // step_a (unassigned, initial) -> step_b, whose strategy is the spy.
  const body = structuredClone(loopBody()) as unknown as {
    workflow: { steps: { id: string; assignment?: { strategy: unknown } }[] };
  };
  body.workflow.steps.find((s) => s.id === "step_b")!.assignment = { strategy: { type: "spy", config: {} } };
  const b = body as unknown as ProcessBody;

  const inst = await createInstance(b, { processId: pid, version: 1 });
  const patch = { field_x: "submitted" } as unknown as Instance["data"];
  await executeManualTransition(inst, "path_ab", b, candidate, sql, patch, reg);

  expect(calls.length).toBe(1);
  expect((calls[0]!.instance.data as Record<string, unknown>).field_x).toBe("submitted");
});

// --- planStepEntry stays free of resolution -----------------------------------

test("planStepEntry consumes the caller's resolved set and calls no resolver", () => {
  const body = loopBody();
  const target = body.workflow.steps.find((s) => s.id === "step_b")!;
  const instance = {
    instanceId: "inst_x", processId: pid, version: 1, definitionHash: "x",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-01-01T00:00:00Z",
  } as unknown as Instance;

  // The step declares `static` with ["role_x", "user_1"]; the planner writes what
  // the caller handed it instead, which no resolver would have produced.
  const plan = planStepEntry(instance, target, body, {
    pathId: null,
    cause: "user",
    actorId: "user_1",
    actions: [],
    assignment: { candidates: ["resolved_elsewhere"], claimedBy: undefined, claimedAt: undefined },
  });
  expect(plan.instance.assignment?.candidates).toEqual(["resolved_elsewhere"]);
});

test("planStepEntry carries the instance's assignment forward on { carry: true }", () => {
  const body = loopBody();
  const target = body.workflow.steps.find((s) => s.id === "step_b")!;
  const carried = { candidates: ["role_x"], claimedBy: "user_1", claimedAt: "2026-01-01T00:00:00Z" };
  const instance = {
    instanceId: "inst_x", processId: pid, version: 1, definitionHash: "x",
    currentStepId: "step_a", transitionSeq: 0, data: {}, status: "running",
    startedAt: "2026-01-01T00:00:00Z", assignment: carried,
  } as unknown as Instance;

  const plan = planStepEntry(instance, target, body, {
    pathId: null, cause: "migration", actorId: undefined, actions: [], assignment: { carry: true },
  });
  expect(plan.instance.assignment).toEqual(carried);
});

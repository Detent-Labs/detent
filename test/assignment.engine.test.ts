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
  NotAssignedError,
  NotACandidateError,
  AlreadyClaimedError,
  NotClaimantError,
} from "../src/engine/transition.js";
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
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          assignment: assignedStrategy,
          paths: [{ id: "path_ba", key: "ba", to: "step_a", trigger: "manual" }],
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

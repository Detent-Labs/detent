/**
 * Runtime API Layer assignment/claim surface: claimStep, releaseClaim, and
 * submitAndTransition's claimant-only enforcement check. DB-backed (skips
 * when DATABASE_URL is unset), bodies go through the real `publishBody` —
 * mirrors runtime-api.test.ts's style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { NotAssignedError, NotACandidateError, AlreadyClaimedError, NotClaimedError, NotClaimantError } from "../src/engine/transition.js";
import { createProcessInstance, claimStep, releaseClaim, submitAndTransition } from "../src/runtime/api.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId, PathId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const candidate: Actor = { id: "user_1", roles: [] };
const roleActor: Actor = { id: "user_2", roles: ["approver"] };
const outsider: Actor = { id: "user_3", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_assign_rtapi" as ProcessId;

async function rejectsWith(p: Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

// step_a (assigned, initial) --(path_ab, manual, guardless)--> step_b (terminal).
// step_c is a sibling initial-less unassigned step used by the regression test.
const assignedBody = (): ProcessBody =>
  ({
    key: "assign_rt",
    label: { en: "Assign RT" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["approver", "user_1"] } } },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const unassignedBody = (): ProcessBody =>
  ({
    key: "unassign_rt",
    label: { en: "Unassign RT" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("claimStep succeeds for an eligible candidate on an unclaimed step", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  const claimed = await claimStep(inst.instanceId, candidate);
  expect(claimed.assignment?.claimedBy).toBe(candidate.id);
});

test.skipIf(!DB)("claimStep rejects a step with no declared assignment", async () => {
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await rejectsWith(claimStep(inst.instanceId, candidate), NotAssignedError);
});

test.skipIf(!DB)("claimStep rejects a non-candidate", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await rejectsWith(claimStep(inst.instanceId, outsider), NotACandidateError);
});

test.skipIf(!DB)("claimStep rejects claiming an already-claimed step", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await claimStep(inst.instanceId, candidate);
  await rejectsWith(claimStep(inst.instanceId, roleActor), AlreadyClaimedError);
});

test.skipIf(!DB)("releaseClaim succeeds for the claimant, rejects a non-claimant", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await claimStep(inst.instanceId, candidate);
  await rejectsWith(releaseClaim(inst.instanceId, roleActor), NotClaimantError);
  const released = await releaseClaim(inst.instanceId, candidate);
  expect(released.assignment?.claimedBy).toBeUndefined();
});

test.skipIf(!DB)("submitAndTransition rejects an unclaimed assigned step", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await rejectsWith(submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, candidate, dataSourceReg), NotClaimedError);
});

test.skipIf(!DB)("submitAndTransition rejects a claim held by a different actor", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await claimStep(inst.instanceId, candidate);
  await rejectsWith(submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, roleActor, dataSourceReg), NotClaimantError);
});

test.skipIf(!DB)("submitAndTransition succeeds for the claimant", async () => {
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  await claimStep(inst.instanceId, candidate);
  const updated = await submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, candidate, dataSourceReg);
  expect(updated.currentStepId as string).toBe("step_b");
  expect(updated.status).toBe("completed");
});

test.skipIf(!DB)("a step with no assignment is unaffected by claim enforcement (regression guard)", async () => {
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  // No claim taken at all — succeeds exactly as before this change. `candidate`
  // is the instance's starter here, so this pins the starter case of the
  // assignment-less floor, not "anyone authenticated."
  const updated = await submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, candidate, dataSourceReg);
  expect(updated.currentStepId as string).toBe("step_b");
});

test.skipIf(!DB)("submitAndTransition rejects an outsider on a step with no declared assignment", async () => {
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  // outsider neither started the instance nor carries ADMIN_ROLE, and the
  // step declares no assignment to be a candidate on — the floor rejects.
  await rejectsWith(submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, outsider, dataSourceReg), AuthorizationError);
});

test.skipIf(!DB)("submitAndTransition succeeds for an ADMIN_ROLE actor on a step with no declared assignment, without having started it", async () => {
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, candidate, dataSourceReg);
  // operator did not start the instance, but carries ADMIN_ROLE — the floor's
  // second arm.
  const updated = await submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, operator, dataSourceReg);
  expect(updated.currentStepId as string).toBe("step_b");
});

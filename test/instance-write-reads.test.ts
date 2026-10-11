/**
 * Write calls answer a write result, never the instance (runtime-api spec "A
 * write call answers a write result, never the instance"). The unit block
 * pins `toWriteResult`'s key set. The DB block drives `cancelInstance`,
 * `claimStep`, `releaseClaim` and `delegateClaim` end to end and checks that
 * no instance member beyond the allowed four comes back. DB-backed cases skip
 * when DATABASE_URL is unset; bodies go through the real `publishBody`, as in
 * assignment.runtime-api.test.ts.
 */
import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createProcessInstance, claimStep, releaseClaim, delegateClaim, submitAndTransition, cancelInstance } from "../src/runtime/api.js";
import { toWriteResult } from "../src/runtime/internal.js";
import { CANCEL_ANY_ROLE } from "../src/auth/authorize.js";
import type { Instance, InstanceId, ProcessBody, ProcessId, PathId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const candidate: Actor = { id: "user_1", roles: [] };
const outsider: Actor = { id: "user_3", roles: [] };
const canceller: Actor = { id: "user_canceller", roles: [CANCEL_ANY_ROLE] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();
const PID = "proc_write_result" as ProcessId;

// The write result's whole key set. Nothing else of an `Instance` may appear.
const ALLOWED_KEYS = ["assignment", "instanceId", "status", "transitionSeq"];
// Instance members a reader's rule guards; a write result must carry none.
const INSTANCE_ONLY_MEMBERS = ["data", "startedBy", "version", "processId", "definitionHash", "currentStepId", "startedAt", "kind", "timers", "parent"];

function expectOnlyWriteResultMembers(result: object): void {
  for (const key of Object.keys(result)) expect(ALLOWED_KEYS).toContain(key);
  for (const member of INSTANCE_ONLY_MEMBERS) expect(result).not.toHaveProperty(member);
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

// step_a (assigned to user_1 and role approver) --(path_ab, manual)--> step_b (terminal).
const assignedBody = (): ProcessBody =>
  ({
    key: "write_result",
    label: { en: "Write result" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["approver", "user_1"] } } },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

const fullInstance = (over: Record<string, unknown> = {}): Instance =>
  ({
    instanceId: "inst_x", processId: "proc_x", version: 3, definitionHash: "hash_x",
    currentStepId: "step_a", transitionSeq: 4, data: { secret: "s" },
    status: "running", startedAt: "2026-01-01T00:00:00Z", startedBy: "user_1",
    kind: "published", timers: [], parent: { instanceId: "inst_p", stepId: "step_p" },
    assignment: { candidates: ["user_1"], claimedBy: "user_1", claimedAt: "2026-01-01T00:00:01Z" },
    ...over,
  }) as unknown as Instance;

describe("toWriteResult: the key set", () => {
  test("a running instance with an assignment yields exactly the four members", () => {
    const result = toWriteResult(fullInstance());
    expect(Object.keys(result).sort()).toEqual(ALLOWED_KEYS);
    expect(result).toEqual({
      instanceId: "inst_x" as InstanceId,
      status: "running",
      transitionSeq: 4,
      assignment: { candidates: ["user_1"], claimedBy: "user_1", claimedAt: "2026-01-01T00:00:01Z" },
    });
    expectOnlyWriteResultMembers(result);
  });

  test("a stored null assignment yields no assignment key", () => {
    const result = toWriteResult(fullInstance({ assignment: null }));
    expect(Object.keys(result).sort()).toEqual(["instanceId", "status", "transitionSeq"]);
    expect(result).not.toHaveProperty("assignment");
  });

  test("an absent assignment yields no assignment key", () => {
    const result = toWriteResult(fullInstance({ assignment: undefined }));
    expect(Object.keys(result).sort()).toEqual(["instanceId", "status", "transitionSeq"]);
  });

  test("a non-running instance that carries an assignment yields no assignment key", () => {
    for (const status of ["completed", "cancelled", "faulted"] as const) {
      const result = toWriteResult(fullInstance({ status }));
      expect(Object.keys(result).sort()).toEqual(["instanceId", "status", "transitionSeq"]);
      expect(result.status).toBe(status);
    }
  });

  test("a member added to the instance later does not reach the result", () => {
    const result = toWriteResult(fullInstance({ futureMember: "leak" }));
    expect(result).not.toHaveProperty("futureMember");
    expect(Object.keys(result).sort()).toEqual(ALLOWED_KEYS);
  });
});

describe("write results over the Runtime API Layer", () => {
  test.skipIf(!DB)("cancelInstance by a cancel-any holder returns no instance data", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);

    const result = await cancelInstance(inst.instanceId, canceller);
    expect(result.instanceId).toBe(inst.instanceId);
    expect(result.status).toBe("cancelled");
    expect(result.transitionSeq).toBe(1);
    // The cancelled instance runs no step any more, so no assignment shows.
    expect(Object.keys(result).sort()).toEqual(["instanceId", "status", "transitionSeq"]);
    expectOnlyWriteResultMembers(result);
  });

  test.skipIf(!DB)("cancelInstance by the starter returns no instance data", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);

    const result = await cancelInstance(inst.instanceId, candidate);
    expect(result.status).toBe("cancelled");
    expectOnlyWriteResultMembers(result);
  });

  test.skipIf(!DB)("cancelInstance on an already-cancelled instance answers status cancelled", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);
    const first = await cancelInstance(inst.instanceId, candidate);

    const again = await cancelInstance(inst.instanceId, candidate);
    expect(again.status).toBe("cancelled");
    expect(again.transitionSeq).toBe(first.transitionSeq);
    expectOnlyWriteResultMembers(again);

    const byCanceller = await cancelInstance(inst.instanceId, canceller);
    expect(byCanceller.status).toBe("cancelled");
    expectOnlyWriteResultMembers(byCanceller);
  });

  test.skipIf(!DB)("cancelInstance by a cancel-any holder on a completed instance answers its status and no assignment", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);
    await claimStep(inst.instanceId, candidate);
    const done = await submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, candidate, dataSourceReg);
    expect(done.status).toBe("completed");

    const result = await cancelInstance(inst.instanceId, canceller);
    expect(result.status).toBe("completed");
    expect(result.transitionSeq).toBe(done.transitionSeq);
    expect(result).not.toHaveProperty("assignment");
    expectOnlyWriteResultMembers(result);
  });

  test.skipIf(!DB)("claimStep returns the write result with the new claim and no instance data", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);

    const result = await claimStep(inst.instanceId, candidate);
    expect(result.instanceId).toBe(inst.instanceId);
    expect(result.status).toBe("running");
    expect(result.assignment?.claimedBy).toBe(candidate.id);
    expect(result.assignment?.candidates).toEqual(["approver", "user_1"]);
    expectOnlyWriteResultMembers(result);
  });

  test.skipIf(!DB)("releaseClaim returns the write result with the cleared claim and no instance data", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);
    await claimStep(inst.instanceId, candidate);

    const result = await releaseClaim(inst.instanceId, candidate);
    expect(result.status).toBe("running");
    expect(result.assignment).toBeDefined();
    expect(result.assignment?.claimedBy).toBeUndefined();
    expect(result.assignment?.claimedAt).toBeUndefined();
    expectOnlyWriteResultMembers(result);
  });

  test.skipIf(!DB)("delegateClaim returns the write result with the new claimant and no instance data", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, candidate, dataSourceReg);
    await claimStep(inst.instanceId, candidate);

    const result = await delegateClaim(inst.instanceId, candidate, outsider.id);
    expect(result.status).toBe("running");
    expect(result.assignment?.claimedBy).toBe(outsider.id);
    expect(result.assignment?.claimedAt).toBeDefined();
    expectOnlyWriteResultMembers(result);
  });
});

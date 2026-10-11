/**
 * Write calls answer a write result, never the instance (runtime-api spec "A
 * write call answers a write result, never the instance"). The unit block
 * pins `toWriteResult`'s key set. The DB block drives `cancelInstance`,
 * `claimStep`, `releaseClaim` and `delegateClaim` end to end and checks that
 * no instance member beyond the allowed four comes back. The reader blocks
 * pin the other half of the rule: a write call reports a non-running
 * instance to a caller who may read it, and refuses everyone else with one
 * fixed text (instance-visibility-set, "A write call reveals a finished
 * instance only to a reader"). DB-backed cases skip when DATABASE_URL is
 * unset; bodies go through the real `publishBody`, as in
 * assignment.runtime-api.test.ts.
 */
import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import {
  createProcessInstance,
  claimStep,
  releaseClaim,
  delegateClaim,
  submitAndTransition,
  cancelInstance,
  saveInstanceDraft,
  revokeVisibility,
  InstanceNotRunningError,
} from "../src/runtime/api.js";
import { toWriteResult, throwToReader } from "../src/runtime/internal.js";
import { getInstanceDraft } from "../src/engine/instance-drafts.js";
import { NotFoundError } from "../src/errors.js";
import { CANCEL_ANY_ROLE, ADMIN_ROLE, AuthorizationError } from "../src/auth/authorize.js";
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
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_drafts, instance_principals, instance_principals_denied, definitions`;
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

// ============================================================
// The reader rule: a write call reports a non-running instance to readers only
// ============================================================

const starter: Actor = { id: "user_starter", roles: [] };
const stranger: Actor = { id: "user_stranger", roles: [] };
const operator: Actor = { id: "user_operator", roles: [ADMIN_ROLE] };
const PLAIN_PID = "proc_write_reader_plain" as ProcessId;

// step_a (no assignment) --(path_ab, manual)--> step_b (terminal). Only the
// starter or an administrator may act on step_a, so a stranger is neither.
const plainBody = (): ProcessBody =>
  ({
    key: "write_reader_plain",
    label: { en: "Write reader plain" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

async function startPlain(): Promise<InstanceId> {
  await publishBody(PLAIN_PID, plainBody(), reg, dataSourceReg);
  return (await createProcessInstance(PLAIN_PID, starter, dataSourceReg)).instanceId;
}

const submitPlain = (id: InstanceId, actor: Actor) => submitAndTransition(id, "path_ab" as PathId, {}, actor, dataSourceReg);

/**
 * The error a call rejects with. A call that resolves fails the test, so no
 * assertion below passes because nothing was thrown.
 */
async function rejection(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to reject, but it resolved");
}

// Each entry drives a fresh plain instance to a non-running status the starter caused.
const FINISHERS: [status: "cancelled" | "completed", finish: (id: InstanceId) => Promise<unknown>][] = [
  ["cancelled", (id) => cancelInstance(id, starter)],
  ["completed", (id) => submitPlain(id, starter)],
];

describe("submit and draft save report a non-running instance to readers only", () => {
  for (const [status, finish] of FINISHERS) {
    test.skipIf(!DB)(`submit to a ${status} instance: a stranger gets AuthorizationError, the starter and an administrator get InstanceNotRunningError`, async () => {
      const id = await startPlain();
      await finish(id);

      // Without throwToReader the stranger would get InstanceNotRunningError here.
      const refused = await rejection(submitPlain(id, stranger));
      expect(refused).toBeInstanceOf(AuthorizationError);
      expect(refused).not.toBeInstanceOf(InstanceNotRunningError);

      // A throwToReader that always refused would turn these into AuthorizationError.
      for (const reader of [starter, operator]) {
        const told = await rejection(submitPlain(id, reader));
        expect(told).toBeInstanceOf(InstanceNotRunningError);
        expect((told as InstanceNotRunningError).status).toBe(status);
      }
    });

    test.skipIf(!DB)(`draft save on a ${status} instance: a stranger gets AuthorizationError, the starter and an administrator get InstanceNotRunningError, nothing is stored`, async () => {
      const id = await startPlain();
      await finish(id);

      const refused = await rejection(saveInstanceDraft(id, { note: "x" }, stranger, sql));
      expect(refused).toBeInstanceOf(AuthorizationError);
      expect(refused).not.toBeInstanceOf(InstanceNotRunningError);

      for (const reader of [starter, operator]) {
        const told = await rejection(saveInstanceDraft(id, { note: "x" }, reader, sql));
        expect(told).toBeInstanceOf(InstanceNotRunningError);
        expect((told as InstanceNotRunningError).status).toBe(status);
      }
      expect(await getInstanceDraft(id, sql)).toBeUndefined();
    });
  }

  test.skipIf(!DB)("the losing claimant of a double submit, who is not the starter, still gets InstanceNotRunningError", async () => {
    await publishBody(PID, assignedBody(), reg, dataSourceReg);
    const inst = await createProcessInstance(PID, starter, dataSourceReg);
    // Pins the fixture: the claimant reads the instance through its claim, not as the starter.
    expect(inst.startedBy).not.toBe(candidate.id);
    await claimStep(inst.instanceId, candidate);

    const submit = () => submitAndTransition(inst.instanceId, "path_ab" as PathId, {}, candidate, dataSourceReg);
    const outcomes = await Promise.allSettled([submit(), submit()]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(InstanceNotRunningError);
    expect((rejected[0]!.reason as InstanceNotRunningError).status).toBe("completed");

    // The claimant stays a reader after the instance finished.
    const draft = await rejection(saveInstanceDraft(inst.instanceId, {}, candidate, sql));
    expect(draft).toBeInstanceOf(InstanceNotRunningError);
  });
});

describe("a starter whom a revocation names", () => {
  test.skipIf(!DB)("is refused on submit and draft save once the instance has completed", async () => {
    const id = await startPlain();
    await submitPlain(id, starter);

    // Baseline: before the revocation the starter reads the instance and learns its status.
    expect(await rejection(submitPlain(id, starter))).toBeInstanceOf(InstanceNotRunningError);
    expect(await rejection(saveInstanceDraft(id, {}, starter, sql))).toBeInstanceOf(InstanceNotRunningError);

    await revokeVisibility(id, starter.id, operator, sql);

    expect(await rejection(submitPlain(id, starter))).toBeInstanceOf(AuthorizationError);
    expect(await rejection(saveInstanceDraft(id, {}, starter, sql))).toBeInstanceOf(AuthorizationError);
    expect(await getInstanceDraft(id, sql)).toBeUndefined();
  });

  test.skipIf(!DB)("keeps write authority on a running instance whose step has no assignment", async () => {
    const id = await startPlain();
    await revokeVisibility(id, starter.id, operator, sql);

    // Draft save and submit both rest on requireSubmitAuthority alone; a revocation narrows reads.
    const saved = await saveInstanceDraft(id, { note: "wip" }, starter, sql);
    expect(saved.updatedBy).toBe(starter.id);
    expect(await getInstanceDraft(id, sql)).toBeDefined();

    const done = await submitPlain(id, starter);
    expect(done.status).toBe("completed");
  });

  for (const [status, finish] of FINISHERS) {
    test.skipIf(!DB)(`is refused on cancel once the instance is ${status}, with the read text`, async () => {
      const id = await startPlain();
      await finish(id);

      // Baseline: a starter who may read gets the idempotent no-op and the status.
      const before = await cancelInstance(id, starter);
      expect(before.status).toBe(status);

      await revokeVisibility(id, starter.id, operator, sql);

      const refused = await rejection(cancelInstance(id, starter));
      expect(refused).toBeInstanceOf(AuthorizationError);
      expect((refused as AuthorizationError).message).toMatch(/may not read instance/);
    });
  }

  test.skipIf(!DB)("still cancels a running instance", async () => {
    const id = await startPlain();
    await revokeVisibility(id, starter.id, operator, sql);

    const result = await cancelInstance(id, starter);
    expect(result.status).toBe("cancelled");
  });
});

describe("the refusal does not separate a finished, a running and an unknown instance", () => {
  const unknown = "inst_does_not_exist" as InstanceId;
  const refusalText = (id: string) => `actor '${stranger.id}' may not submit instance '${id}'`;

  const textOf = async (call: Promise<unknown>): Promise<string> => {
    const err = await rejection(call);
    expect(err).toBeInstanceOf(AuthorizationError);
    return (err as AuthorizationError).message;
  };

  test.skipIf(!DB)("submit gives a stranger one text, up to the instance id", async () => {
    const finished = await startPlain();
    await cancelInstance(finished, starter);
    const running = await startPlain();

    expect(await textOf(submitPlain(finished, stranger))).toBe(refusalText(finished));
    expect(await textOf(submitPlain(running, stranger))).toBe(refusalText(running));
    expect(await textOf(submitPlain(unknown, stranger))).toBe(refusalText(unknown));
  });

  test.skipIf(!DB)("draft save gives a stranger the same text", async () => {
    const finished = await startPlain();
    await cancelInstance(finished, starter);
    const running = await startPlain();

    expect(await textOf(saveInstanceDraft(finished, {}, stranger, sql))).toBe(refusalText(finished));
    expect(await textOf(saveInstanceDraft(running, {}, stranger, sql))).toBe(refusalText(running));
    expect(await textOf(saveInstanceDraft(unknown, {}, stranger, sql))).toBe(refusalText(unknown));
  });

  test.skipIf(!DB)("an unknown id gives an administrator NotFoundError on both calls, and a stranger never NotFoundError", async () => {
    expect(await rejection(submitPlain(unknown, operator))).toBeInstanceOf(NotFoundError);
    expect(await rejection(saveInstanceDraft(unknown, {}, operator, sql))).toBeInstanceOf(NotFoundError);

    expect(await rejection(submitPlain(unknown, stranger))).not.toBeInstanceOf(NotFoundError);
    expect(await rejection(saveInstanceDraft(unknown, {}, stranger, sql))).not.toBeInstanceOf(NotFoundError);
  });
});

describe("throwToReader", () => {
  test.skipIf(!DB)("rethrows the status error for a reader, the refusal for a stranger, and any other load error unchanged", async () => {
    const id = await startPlain();
    await cancelInstance(id, starter);
    const err = new InstanceNotRunningError(id, "cancelled");
    const refusal = new AuthorizationError("refusal");

    expect(await rejection(throwToReader(err, starter, refusal, sql))).toBe(err);
    expect(await rejection(throwToReader(err, stranger, refusal, sql))).toBe(refusal);

    // An administrator's load of a missing instance raises NotFoundError, which is neither.
    const missing = new InstanceNotRunningError("inst_does_not_exist", "cancelled");
    const loadErr = await rejection(throwToReader(missing, operator, refusal, sql));
    expect(loadErr).toBeInstanceOf(NotFoundError);
    expect(loadErr).not.toBe(missing);
    expect(loadErr).not.toBe(refusal);
  });
});

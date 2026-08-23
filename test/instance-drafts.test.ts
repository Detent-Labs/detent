/**
 * The instance-form-drafts capability: the engine's `instance_drafts` store
 * (src/engine/instance-drafts.ts) and the runtime API's `saveInstanceDraft`/
 * `getInstanceView` integration (src/runtime/api.ts). DB-backed — skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { getInstanceDraft, saveInstanceDraft as engineSaveInstanceDraft, deleteInstanceDraft } from "../src/engine/instance-drafts.js";
import {
  createProcessInstance,
  getInstanceView,
  saveInstanceDraft,
  claimStep,
  NotClaimedError,
  NotClaimantError,
  InstanceNotRunningError,
} from "../src/runtime/api.js";
import { RequestShapeError, NotFoundError } from "../src/errors.js";
import { AuthorizationError } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId, InstanceId, StepId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, instance_drafts, definitions`;
});

async function expectRejects(p: Promise<unknown>, ctor: new (...args: never[]) => Error): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ctor);
}

// ============================================================
// Engine: src/engine/instance-drafts.ts
// ============================================================

test.skipIf(!DB)("saveInstanceDraft (engine) creates a row, and a second save for the same instance replaces it", async () => {
  const instanceId = "inst_draft_1" as InstanceId;
  await engineSaveInstanceDraft(instanceId, "step_a" as StepId, { note: "first" }, "user_1", sql);
  await engineSaveInstanceDraft(instanceId, "step_a" as StepId, { note: "second" }, "user_1", sql);

  const rows = (await sql`SELECT count(*) AS c FROM instance_drafts WHERE instance_id = ${instanceId}`) as { c: string }[];
  expect(Number(rows[0].c)).toBe(1);
  const draft = await getInstanceDraft(instanceId, sql);
  expect(draft?.data).toEqual({ note: "second" });
});

test.skipIf(!DB)("a saved draft reads back with its data, step, actor, and save time", async () => {
  const instanceId = "inst_draft_2" as InstanceId;
  await engineSaveInstanceDraft(instanceId, "step_a" as StepId, { field_x: 1 }, "user_1", sql);

  const draft = await getInstanceDraft(instanceId, sql);
  expect(draft?.data).toEqual({ field_x: 1 });
  expect(draft?.stepId as string).toBe("step_a");
  expect(draft?.updatedBy).toBe("user_1");
  expect(draft?.updatedAt).toBeDefined();
});

test.skipIf(!DB)("the store validates only the envelope: an incomplete or wrong-typed draft is stored unchanged", async () => {
  const instanceId = "inst_draft_3" as InstanceId;
  await engineSaveInstanceDraft(instanceId, "step_a" as StepId, { field_amount: "not-a-number", extra: true }, "user_1", sql);

  const draft = await getInstanceDraft(instanceId, sql);
  expect(draft?.data).toEqual({ field_amount: "not-a-number", extra: true });
});

test.skipIf(!DB)("a non-object draft is refused: array, string, number, and null all raise RequestShapeError and store nothing", async () => {
  const instanceId = "inst_draft_4" as InstanceId;
  await expectRejects(engineSaveInstanceDraft(instanceId, "step_a" as StepId, [1, 2], "user_1", sql), RequestShapeError);
  await expectRejects(engineSaveInstanceDraft(instanceId, "step_a" as StepId, "nope", "user_1", sql), RequestShapeError);
  await expectRejects(engineSaveInstanceDraft(instanceId, "step_a" as StepId, 5, "user_1", sql), RequestShapeError);
  await expectRejects(engineSaveInstanceDraft(instanceId, "step_a" as StepId, null, "user_1", sql), RequestShapeError);

  expect(await getInstanceDraft(instanceId, sql)).toBeUndefined();
});

test.skipIf(!DB)("saving records the step id passed at save time", async () => {
  const instanceId = "inst_draft_5" as InstanceId;
  await engineSaveInstanceDraft(instanceId, "step_b" as StepId, {}, "user_1", sql);
  const draft = await getInstanceDraft(instanceId, sql);
  expect(draft?.stepId as string).toBe("step_b");
});

test.skipIf(!DB)("deleteInstanceDraft removes the row, and is a no-op when none exists", async () => {
  const instanceId = "inst_draft_6" as InstanceId;
  await engineSaveInstanceDraft(instanceId, "step_a" as StepId, {}, "user_1", sql);
  await deleteInstanceDraft(instanceId, sql);
  expect(await getInstanceDraft(instanceId, sql)).toBeUndefined();

  // No-op: deleting again raises nothing.
  await deleteInstanceDraft(instanceId, sql);
});

// ============================================================
// Runtime: src/runtime/api.ts saveInstanceDraft / getInstanceView
// ============================================================

/**
 * step_a (assignment: candidates ["approver"]) --(path_ab, manual,
 * guardless)--> step_b (terminal, no assignment).
 */
const assignedBody = (): ProcessBody =>
  ({
    key: "draft_runtime_body",
    label: { en: "Draft Runtime Body" },
    baseLocale: "en",
    fields: [{ id: "field_note", key: "note", label: { en: "Note" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          assignment: { strategy: { type: "static", config: { candidates: ["approver"] } } },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_a --(path_ab, manual)--> step_b (terminal), no assignment on either step. */
const unassignedBody = (): ProcessBody =>
  ({
    key: "draft_runtime_body_open",
    label: { en: "Draft Runtime Body Open" },
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

const pid = (n: string) => n as ProcessId;

test.skipIf(!DB)("saveInstanceDraft: the current claimant saves, and it stores the current step and data", async () => {
  const PID = pid("proc_draft_claimant");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const claimant: Actor = { id: "approver", roles: [] };
  await claimStep(created.instanceId, claimant);

  const saved = await saveInstanceDraft(created.instanceId, { field_note: "wip" }, claimant, sql);
  expect(saved.stepId as string).toBe("step_a");
  expect(saved.updatedBy).toBe("approver");
});

test.skipIf(!DB)("saveInstanceDraft: a non-claimant on an assignment-bearing step is refused", async () => {
  const PID = pid("proc_draft_nonclaimant");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const outsider: Actor = { id: "user_outsider", roles: [] };

  await expectRejects(saveInstanceDraft(created.instanceId, {}, outsider, sql), NotClaimedError);

  const claimant: Actor = { id: "approver", roles: [] };
  await claimStep(created.instanceId, claimant);
  await expectRejects(saveInstanceDraft(created.instanceId, {}, outsider, sql), NotClaimantError);
});

test.skipIf(!DB)("saveInstanceDraft: the starter saves on an assignment-less step", async () => {
  const PID = pid("proc_draft_starter");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const saved = await saveInstanceDraft(created.instanceId, { note: "wip" }, actor, sql);
  expect(saved.updatedBy).toBe(actor.id);
});

test.skipIf(!DB)("saveInstanceDraft: a non-starter, non-admin on an assignment-less step is refused", async () => {
  const PID = pid("proc_draft_starter_denied");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const outsider: Actor = { id: "user_outsider", roles: [] };

  await expectRejects(saveInstanceDraft(created.instanceId, {}, outsider, sql), AuthorizationError);
});

test.skipIf(!DB)("saveInstanceDraft: a non-running instance is refused with InstanceNotRunningError, and stores nothing", async () => {
  const PID = pid("proc_draft_not_running");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET body = body || '{"status":"cancelled"}'::jsonb WHERE instance_id = ${created.instanceId}`;

  await expectRejects(saveInstanceDraft(created.instanceId, {}, actor, sql), InstanceNotRunningError);
  expect(await getInstanceDraft(created.instanceId, sql)).toBeUndefined();
});

test.skipIf(!DB)("saveInstanceDraft: an unknown instance raises NotFoundError", async () => {
  await expectRejects(saveInstanceDraft("inst_missing" as InstanceId, {}, actor, sql), NotFoundError);
});

test.skipIf(!DB)("getInstanceView returns the matching draft, with its data and metadata", async () => {
  const PID = pid("proc_draft_view_match");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await saveInstanceDraft(created.instanceId, { note: "wip" }, actor, sql);

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg, sql);
  expect(view.draft?.data).toEqual({ note: "wip" });
  expect(view.draft?.stepId as string).toBe("step_a");
});

test.skipIf(!DB)("getInstanceView omits the draft once the instance has moved to another step", async () => {
  const PID = pid("proc_draft_view_stale");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await saveInstanceDraft(created.instanceId, { note: "wip" }, actor, sql);

  // Directly relocate the instance's currentStepId to step_b without going
  // through commitTransition, so the stored draft row (still stamped
  // step_a) is untouched — this isolates the view's own step_id gate from
  // the clear-on-transition hook, which a separate transition.test.ts case
  // covers.
  await sql`UPDATE instances SET body = body || '{"currentStepId":"step_b"}'::jsonb WHERE instance_id = ${created.instanceId}`;

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg, sql);
  expect(view.draft).toBeUndefined();
});

test.skipIf(!DB)("getInstanceView carries no draft field when none exists", async () => {
  const PID = pid("proc_draft_view_none");
  await publishBody(PID, unassignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg, sql);
  expect(view.draft).toBeUndefined();
});

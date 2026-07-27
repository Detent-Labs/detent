/**
 * Runtime API Layer (src/runtime/api.ts): createProcessInstance,
 * getInstanceView, submitAndTransition. DB-backed (skips when DATABASE_URL is
 * unset); bodies go through the real `publishBody` (not the ad-hoc casts
 * transition.test.ts uses), since createProcessInstance/getInstanceView/
 * submitAndTransition all resolve bodies from the published definition
 * store.
 */
import { readFileSync } from "node:fs";
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, withTransaction, appendInstanceEvent, newInstanceEventId } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { executeManualTransition, cancelInstance, ConcurrencyConflict, GuardRefused, AutomaticCascadeLoop } from "../src/engine/transition.js";
import {
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  claimStep,
  listInstances,
  getInstanceRecord,
  SubmissionValidationError,
  PinMismatch,
  type InstanceRecordElement,
} from "../src/runtime/api.js";
import type { ProcessBody, ProcessId, PathId, InstanceId, FieldId, Instance, StepId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const cel = (src: string) => ({ lang: "cel", src });
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

// ============================================================
// Fixture bodies
// ============================================================

/**
 * step_a: amount/name/category required, tags optional (multiselect+options),
 * note optional (has a validation.rule), readonly (view-readonly), group (a
 * group-container ref, marked required in the view — must never actually be
 * enforceable). field_untouched exists in the catalog but is NOT referenced
 * by step_a's view at all, so submitting it is an unknown-field.
 * step_a --(path_ab, manual, guardless)--> step_b (terminal).
 */
const viewBody = (): ProcessBody =>
  ({
    key: "view_body",
    label: { en: "View Body" },
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number", validation: { min: 0, max: 1000 } },
      {
        id: "field_name",
        key: "name",
        label: { en: "Name" },
        type: "string",
        validation: { minLength: 2, maxLength: 10, pattern: "^[A-Za-z]+$" },
      },
      {
        id: "field_category",
        key: "category",
        label: { en: "Category" },
        type: "select",
        options: [{ value: "a", label: { en: "A" } }, { value: "b", label: { en: "B" } }],
      },
      {
        id: "field_tags",
        key: "tags",
        label: { en: "Tags" },
        type: "multiselect",
        options: [{ value: "x", label: { en: "X" } }, { value: "y", label: { en: "Y" } }],
      },
      {
        id: "field_note",
        key: "note",
        label: { en: "Note" },
        type: "string",
        validation: { rule: cel("data.note != 'forbidden'") },
      },
      { id: "field_readonly", key: "readonly_f", label: { en: "Readonly" }, type: "string" },
      { id: "field_untouched", key: "untouched", label: { en: "Untouched" }, type: "string" },
      {
        id: "field_group",
        key: "grp",
        label: { en: "Group" },
        type: "group",
        fields: [{ id: "field_child", key: "child", label: { en: "Child" }, type: "string" }],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: {
            fields: [
              { ref: "field_amount", required: true },
              { ref: "field_name", required: true },
              { ref: "field_category", required: true },
              { ref: "field_tags" },
              { ref: "field_note" },
              { ref: "field_readonly", readonly: true },
              { ref: "field_group", required: true },
            ],
          },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/**
 * step_a --(path_ab, manual, guardless)--> step_b (all-automatic wait-state):
 * path_approved (priority 1, guard data.decision == 'approve') -> step_approved;
 * path_rejected (priority 2, guard data.decision == 'reject') -> step_rejected.
 * Regression fixture for the resolveAutomatic-sees-stale-data bug: a
 * submission at step_a that sets `decision` must land directly on the
 * matching terminal step, not park at step_b.
 */
const cascadeBody = (): ProcessBody =>
  ({
    key: "cascade_body",
    label: { en: "Cascade Body" },
    baseLocale: "en",
    fields: [
      {
        id: "field_decision",
        key: "decision",
        label: { en: "Decision" },
        type: "select",
        options: [{ value: "approve", label: { en: "Approve" } }, { value: "reject", label: { en: "Reject" } }],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_decision", required: true }] },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b",
          key: "b",
          label: { en: "B" },
          type: "task",
          paths: [
            { id: "path_approved", key: "approved", to: "step_approved", trigger: "automatic", priority: 1, guard: cel("data.decision == 'approve'") },
            { id: "path_rejected", key: "rejected", to: "step_rejected", trigger: "automatic", priority: 2, guard: cel("data.decision == 'reject'") },
          ],
        },
        { id: "step_approved", key: "approved_step", label: { en: "Approved" }, type: "task", terminal: true },
        { id: "step_rejected", key: "rejected_step", label: { en: "Rejected" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/**
 * step_x: a guardless self-loop (path_self) plus a guarded exit (path_done,
 * guard data.approved == true) back onto itself. Lets one instance take
 * several submissions in a row without leaving the step, so availablePaths
 * can be observed changing as data changes.
 */
const selfLoopBody = (): ProcessBody =>
  ({
    key: "self_loop_body",
    label: { en: "Self Loop Body" },
    baseLocale: "en",
    fields: [{ id: "field_approved", key: "approved", label: { en: "Approved" }, type: "boolean" }],
    workflow: {
      initialStep: "step_x",
      steps: [
        {
          id: "step_x",
          key: "x",
          label: { en: "X" },
          type: "task",
          view: { fields: [{ ref: "field_approved" }] },
          paths: [
            { id: "path_self", key: "self", to: "step_x", trigger: "manual" },
            { id: "path_done", key: "done", to: "step_done", trigger: "manual", guard: cel("data.approved == true") },
          ],
        },
        { id: "step_done", key: "done_step", label: { en: "Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** Two divergent guardless manual paths off one step, for the concurrency test. */
const twoPathsBody = (): ProcessBody =>
  ({
    key: "two_paths_body",
    label: { en: "Two Paths Body" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          paths: [
            { id: "path_x", key: "x", to: "step_x", trigger: "manual" },
            { id: "path_y", key: "y", to: "step_y", trigger: "manual" },
          ],
        },
        { id: "step_x", key: "x_step", label: { en: "X" }, type: "task", terminal: true },
        { id: "step_y", key: "y_step", label: { en: "Y" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** Minimal contracted child, immediately terminal — never actually spawned/delivered in these tests. */
const subprocessChildBody = (): ProcessBody =>
  ({
    key: "sub_child",
    label: { en: "Sub Child" },
    baseLocale: "en",
    contract: { inputFields: [], outputFields: [], outcomes: ["done"] },
    fields: [],
    workflow: {
      initialStep: "step_c",
      steps: [{ id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true, outcome: "done" }],
    },
  }) as unknown as ProcessBody;

/** Parent: step_p1 (manual) --> step_p_sub (subprocess wait-state, pinned to the child). */
const subprocessParentBody = (childProcessId: string, childVersion: number): ProcessBody =>
  ({
    key: "sub_parent",
    label: { en: "Sub Parent" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_p1",
      steps: [
        {
          id: "step_p1",
          key: "p1",
          label: { en: "P1" },
          type: "task",
          paths: [{ id: "path_p1_sub", key: "to_sub", to: "step_p_sub", trigger: "manual" }],
        },
        {
          id: "step_p_sub",
          key: "p_sub",
          label: { en: "P Sub" },
          type: "subprocess",
          subprocess: {
            processId: childProcessId,
            versionBinding: "pinned",
            pinnedVersion: childVersion,
            inputMapping: {},
            outputMapping: {},
          },
          paths: [{ id: "path_p_out", key: "out", to: "step_p_done", trigger: "automatic", guard: cel("child.outcome == 'done'") }],
        },
        { id: "step_p_done", key: "p_done", label: { en: "P Done" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/**
 * step_a (manual, seeds field_marker) --> step_g <--> step_h, both single
 * guardless automatic paths — a non-terminating cascade. Regression fixture
 * for AutomaticCascadeLoop reached through submitAndTransition: the manual
 * commit itself must succeed (and persist field_marker) before the
 * subsequent, separately-run resolveAutomatic cascade loops and throws.
 */
const cascadeLoopBody = (): ProcessBody =>
  ({
    key: "cascade_loop_body",
    label: { en: "Cascade Loop Body" },
    baseLocale: "en",
    fields: [{ id: "field_marker", key: "marker", label: { en: "Marker" }, type: "string" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_marker" }] },
          paths: [{ id: "path_ag", key: "ag", to: "step_g", trigger: "manual" }],
        },
        { id: "step_g", key: "g", label: { en: "G" }, type: "task", paths: [{ id: "path_gh", key: "gh", to: "step_h", trigger: "automatic" }] },
        { id: "step_h", key: "h", label: { en: "H" }, type: "task", paths: [{ id: "path_hg", key: "hg", to: "step_g", trigger: "automatic" }] },
      ],
    },
  }) as unknown as ProcessBody;

const pid = (n: string) => n as ProcessId;

// ============================================================
// createProcessInstance / getInstanceView happy path + status coverage
// ============================================================

test.skipIf(!DB)("createProcessInstance never enforces the required check, even when opts.data is empty", async () => {
  const PID = pid("proc_view_1");
  await publishBody(PID, viewBody(), reg, dataSourceReg);

  // amount/name/category are all required on step_a's view, yet an empty seed
  // is accepted: requiredness is a transition-time gate (submitAndTransition),
  // not an existence-time one — see design.md.
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: {} as Instance["data"] });
  expect(created.currentStepId as string).toBe("step_a");
  expect(created.data).toEqual({});
});

test.skipIf(!DB)("createProcessInstance validates opts.data's shape against the initial step's view", async () => {
  const PID = pid("proc_view_1b");
  await publishBody(PID, viewBody(), reg, dataSourceReg);

  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: "not-a-number" } as unknown as Instance["data"] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  const issues = (raised as SubmissionValidationError).issues;
  expect(issues).toEqual([{ kind: "type-mismatch", fieldId: "field_amount" as FieldId, expected: "number" }]);
});

test.skipIf(!DB)("createProcessInstance succeeds with a valid data seed, and getInstanceView resolves it", async () => {
  const PID = pid("proc_view_2");
  await publishBody(PID, viewBody(), reg, dataSourceReg);

  const data = {
    field_amount: 100,
    field_name: "Bob",
    field_category: "a",
  } as unknown as Instance["data"];
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data });
  expect(created.currentStepId as string).toBe("step_a");

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("running");
  expect(view.step.key).toBe("a");
  const byKey = new Map(view.fields.map((f) => [f.field.key, f]));
  expect(byKey.get("amount")!.value).toBe(100);
  expect(byKey.get("readonly_f")!.readonly).toBe(true);
  expect(view.availablePaths).toEqual([{ id: "path_ab" as PathId, key: "ab", label: undefined }]);
});

test.skipIf(!DB)("createProcessInstance pins to an explicit older version, not the newest", async () => {
  const PID = pid("proc_version_pin");
  const v1 = await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  // twoPathsBody differs from cascadeBody, so this publish assigns v2 — the
  // default (no opts.version) createProcessInstance call would resolve here.
  const v2 = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  expect(v2.version).toBe(v1.version + 1);

  const pinnedOld = await createProcessInstance(PID, actor, dataSourceReg, { version: v1.version });
  expect(pinnedOld.version).toBe(v1.version);
  expect(pinnedOld.currentStepId as string).toBe("step_a"); // cascadeBody's initial step

  const defaultNewest = await createProcessInstance(PID, actor, dataSourceReg);
  expect(defaultNewest.version).toBe(v2.version);
});

test.skipIf(!DB)("a group-container field never reports required, even when the view declares it", async () => {
  const PID = pid("proc_view_group");
  await publishBody(PID, viewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 1, field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
  });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  const groupField = view.fields.find((f) => f.field.key === "grp")!;
  expect(groupField).toBeDefined();
  expect(groupField.required).toBe(false);
  expect(groupField.value).toBeUndefined();
});

test.skipIf(!DB)("submitting a group-container field's own id is rejected as unknown-field", async () => {
  const PID = pid("proc_view_group2");
  await publishBody(PID, viewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 1, field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
  });

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_group: "x" } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "unknown-field", fieldId: "field_group" as FieldId }]);
});

test.skipIf(!DB)("getInstanceView on a completed instance still resolves, with no available paths", async () => {
  const PID = pid("proc_view_completed");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const result = await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_decision: "approve" } as unknown as Instance["data"],
    actor, dataSourceReg,
  );
  expect(result.status).toBe("completed");
  expect(result.currentStepId as string).toBe("step_approved");

  const view = await getInstanceView(result.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("completed");
  expect(view.availablePaths).toEqual([]);
});

test.skipIf(!DB)("getInstanceView on a cancelled instance still resolves, with no available paths", async () => {
  const PID = pid("proc_view_cancelled");
  const published = await publishBody(PID, selfLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const cancelled = await cancelInstance(created, published.definition, actor);
  expect(cancelled.status).toBe("cancelled");

  const view = await getInstanceView(cancelled.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("cancelled");
  expect(view.availablePaths).toEqual([]);
});

test.skipIf(!DB)("getInstanceView on a running subprocess wait-state has no available paths", async () => {
  const childVersion = (await publishBody(pid("proc_sub_child_1"), subprocessChildBody(), reg, dataSourceReg)).version;
  const PID = pid("proc_sub_parent_1");
  await publishBody(PID, subprocessParentBody("proc_sub_child_1", childVersion), reg, dataSourceReg);

  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const result = await submitAndTransition(created.instanceId, "path_p1_sub" as PathId, {} as Instance["data"], actor, dataSourceReg);
  expect(result.currentStepId as string).toBe("step_p_sub");
  expect(result.status).toBe("running"); // parked: the spawn is enqueued but never delivered here

  const view = await getInstanceView(result.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("running");
  expect(view.step.type).toBe("subprocess");
  expect(view.availablePaths).toEqual([]);
});

// ============================================================
// Submission validation — one test per issue kind
// ============================================================

async function freshInstance(): Promise<InstanceId> {
  const PID = pid(`proc_validate_${crypto.randomUUID()}`);
  await publishBody(PID, viewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 1, field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
  });
  return created.instanceId;
}

async function expectIssue(data: Record<string, unknown>, expected: Record<string, unknown>) {
  const instanceId = await freshInstance();
  let raised: unknown;
  try {
    await submitAndTransition(instanceId, "path_ab" as PathId, data as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  const issues = (raised as SubmissionValidationError).issues as unknown as Record<string, unknown>[];
  expect(issues).toContainEqual(expect.objectContaining(expected));
}

test.skipIf(!DB)("unknown-field: a field not in the current view is rejected", async () => {
  await expectIssue({ field_untouched: "x" }, { kind: "unknown-field", fieldId: "field_untouched" });
});

test.skipIf(!DB)("readonly-field: a view-readonly field is rejected", async () => {
  await expectIssue({ field_readonly: "x" }, { kind: "readonly-field", fieldId: "field_readonly" });
});

test.skipIf(!DB)("type-mismatch: a wrongly-shaped value is rejected", async () => {
  await expectIssue({ field_amount: "not-a-number" }, { kind: "type-mismatch", fieldId: "field_amount" });
});

test.skipIf(!DB)("invalid-option: a select value outside options is rejected", async () => {
  await expectIssue({ field_category: "z" }, { kind: "invalid-option", fieldId: "field_category" });
});

test.skipIf(!DB)("invalid-option: a multiselect item outside options is rejected", async () => {
  await expectIssue({ field_tags: ["x", "z"] }, { kind: "invalid-option", fieldId: "field_tags" });
});

test.skipIf(!DB)("constraint: a numeric value below min is rejected", async () => {
  await expectIssue({ field_amount: -5 }, { kind: "constraint", fieldId: "field_amount", constraint: "min" });
});

test.skipIf(!DB)("constraint: a numeric value above max is rejected", async () => {
  await expectIssue({ field_amount: 2000 }, { kind: "constraint", fieldId: "field_amount", constraint: "max" });
});

test.skipIf(!DB)("constraint: a string shorter than minLength is rejected", async () => {
  await expectIssue({ field_name: "a" }, { kind: "constraint", fieldId: "field_name", constraint: "minLength" });
});

test.skipIf(!DB)("constraint: a string longer than maxLength is rejected", async () => {
  await expectIssue({ field_name: "12345678901" }, { kind: "constraint", fieldId: "field_name", constraint: "maxLength" });
});

test.skipIf(!DB)("constraint: a string violating pattern is rejected", async () => {
  await expectIssue({ field_name: "B0b" }, { kind: "constraint", fieldId: "field_name", constraint: "pattern" });
});

test.skipIf(!DB)("rule-failed: a validation.rule that evaluates false is rejected", async () => {
  await expectIssue({ field_note: "forbidden" }, { kind: "rule-failed", fieldId: "field_note" });
});

test.skipIf(!DB)("required-missing: submitting without a required field already set is rejected", async () => {
  const PID = pid("proc_required_missing");
  await publishBody(PID, viewBody(), reg, dataSourceReg);
  // Created empty (legal — see the createProcessInstance tests above); the
  // required check only bites when actually trying to leave the step.
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  let raised: unknown;
  try {
    await submitAndTransition(
      created.instanceId,
      "path_ab" as PathId,
      { field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
      actor, dataSourceReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "required-missing", fieldId: "field_amount" as FieldId });
});

test.skipIf(!DB)("multiple validation issues are collected together, not fail-fast", async () => {
  const instanceId = await freshInstance();
  let raised: unknown;
  try {
    await submitAndTransition(
      instanceId,
      "path_ab" as PathId,
      { field_amount: -5, field_name: "a" } as unknown as Instance["data"],
      actor, dataSourceReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  const issues = (raised as SubmissionValidationError).issues;
  expect(issues).toContainEqual({ kind: "constraint", fieldId: "field_amount" as FieldId, constraint: "min" });
  expect(issues).toContainEqual({ kind: "constraint", fieldId: "field_name" as FieldId, constraint: "minLength" });
});

// ============================================================
// Data-loss / stale-data / concurrency regression coverage
// ============================================================

test.skipIf(!DB)("a submission covering only some fields preserves every other previously stored field", async () => {
  const instanceId = await freshInstance(); // seeded with amount/name/category
  const result = await submitAndTransition(
    instanceId,
    "path_ab" as PathId,
    { field_note: "hello" } as unknown as Instance["data"],
    actor, dataSourceReg,
  );
  expect(result.data).toMatchObject({ field_amount: 1, field_name: "Bob", field_category: "a", field_note: "hello" });

  const row = (await sql`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  expect((parsed as { data: Record<string, unknown> }).data).toMatchObject({
    field_amount: 1,
    field_name: "Bob",
    field_category: "a",
    field_note: "hello",
  });
});

test.skipIf(!DB)("a guard on the step a submission transitions into sees the just-submitted data", async () => {
  const PID = pid("proc_cascade_1");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const result = await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_decision: "approve" } as unknown as Instance["data"],
    actor, dataSourceReg,
  );

  // Lands directly on step_approved (via the automatic cascade off step_b),
  // not parked on step_b — the exact regression this fixture targets.
  expect(result.currentStepId as string).toBe("step_approved");
  expect(result.status).toBe("completed");
});

test.skipIf(!DB)("availablePaths reflects guard state as data changes across repeated submissions", async () => {
  const PID = pid("proc_selfloop_1");
  await publishBody(PID, selfLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const view1 = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view1.availablePaths.map((p) => p.id as string)).toEqual(["path_self"]);

  const afterFirst = await submitAndTransition(created.instanceId, "path_self" as PathId, {} as Instance["data"], actor, dataSourceReg);
  expect(afterFirst.currentStepId as string).toBe("step_x"); // re-entered itself
  const view2 = await getInstanceView(afterFirst.instanceId, actor, dataSourceReg);
  expect(view2.availablePaths.map((p) => p.id as string)).toEqual(["path_self"]);

  const afterSecond = await submitAndTransition(
    afterFirst.instanceId,
    "path_self" as PathId,
    { field_approved: true } as unknown as Instance["data"],
    actor, dataSourceReg,
  );
  expect(afterSecond.data).toMatchObject({ field_approved: true });
  const view3 = await getInstanceView(afterSecond.instanceId, actor, dataSourceReg);
  expect(view3.availablePaths.map((p) => p.id as string).sort()).toEqual(["path_done", "path_self"]);
});

test.skipIf(!DB)("a concurrent action writeback landing during submitAndTransition's locked commit is not lost", async () => {
  const instanceId = await freshInstance(); // seeded with amount/name/category
  const writeback = sql`UPDATE instances
    SET body = jsonb_set(body, '{data,field_readonly}'::text[], '"from-action"'::jsonb, true)
    WHERE instance_id = ${instanceId}`;
  const submit = submitAndTransition(instanceId, "path_ab" as PathId, { field_note: "hello" } as unknown as Instance["data"], actor, dataSourceReg);

  await Promise.all([submit, writeback]);

  const row = (await sql`SELECT body FROM instances WHERE instance_id = ${instanceId}`) as { body: unknown }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  const data = (parsed as { data: Record<string, unknown> }).data;
  expect(data.field_readonly).toBe("from-action"); // not silently discarded
  expect(data.field_note).toBe("hello"); // the submission's own write also landed
});

test.skipIf(!DB)("two concurrent submitAndTransition calls serialize instead of both committing", async () => {
  const PID = pid("proc_two_paths_1");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // Both resolve (fulfilled): the row lock serializes them, and the loser's
  // own read comes back fresh — by the time it runs, the instance is already
  // `completed` on a terminal step, so `commitManualTransition`'s existing
  // non-running no-op returns it unchanged rather than throwing. The
  // assertion that matters is that only ONE transition actually committed.
  const results = await Promise.allSettled([
    submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg),
    submitAndTransition(created.instanceId, "path_y" as PathId, {} as Instance["data"], actor, dataSourceReg),
  ]);
  expect(results.every((r) => r.status === "fulfilled")).toBe(true);

  const hist = (await sql`SELECT 1 FROM history_entries WHERE instance_id = ${created.instanceId}`) as unknown[];
  expect(hist).toHaveLength(1); // exactly one commit landed, no double-commit

  const row = (await sql`SELECT body FROM instances WHERE instance_id = ${created.instanceId}`) as { body: unknown }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  const finalStep = (parsed as { currentStepId: string }).currentStepId;
  expect(["step_x", "step_y"]).toContain(finalStep); // whichever won, exactly one did
});

test.skipIf(!DB)("an unlocked stale executeManualTransition call racing submitAndTransition surfaces ConcurrencyConflict", async () => {
  const PID = pid("proc_two_paths_2");
  const body = twoPathsBody();
  await publishBody(PID, body, reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // A stale snapshot, as if read before submitAndTransition ran.
  const stale = { ...created };

  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);

  let raised: unknown;
  try {
    await executeManualTransition(stale, "path_y", body, actor);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(ConcurrencyConflict);
});

test.skipIf(!DB)("a submission whose merged guard fails throws GuardRefused without committing", async () => {
  const PID = pid("proc_guardrefused_1");
  await publishBody(PID, selfLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  let raised: unknown;
  try {
    // approved is unset -> path_done's guard is false
    await submitAndTransition(created.instanceId, "path_done" as PathId, {} as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(GuardRefused);
  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${created.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(0);
});

test.skipIf(!DB)("a post-commit cascade loop throws AutomaticCascadeLoop but leaves the submission committed", async () => {
  const PID = pid("proc_cascade_loop_1");
  await publishBody(PID, cascadeLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  let raised: unknown;
  try {
    await submitAndTransition(
      created.instanceId,
      "path_ag" as PathId,
      { field_marker: "kept-despite-fault" } as unknown as Instance["data"],
      actor, dataSourceReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AutomaticCascadeLoop);

  // The manual commit (data write + transition to step_g) already landed
  // before the separately-run cascade looped and faulted the instance.
  const row = (await sql`SELECT body, transition_seq FROM instances WHERE instance_id = ${created.instanceId}`) as
    { body: unknown; transition_seq: number }[];
  const parsed = typeof row[0]!.body === "string" ? JSON.parse(row[0]!.body as string) : row[0]!.body;
  expect((parsed as { status: string }).status).toBe("faulted");
  expect((parsed as { data: Record<string, unknown> }).data).toEqual({ field_marker: "kept-despite-fault" });
  expect(row[0]!.transition_seq).toBeGreaterThan(0); // the manual hop (and at least one cascade hop) committed

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("faulted");
});

test.skipIf(!DB)("an unresolvable processId/version surfaces a plain Error", async () => {
  let raised: unknown;
  try {
    await createProcessInstance(pid("proc_does_not_exist"), actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect(raised).not.toBeInstanceOf(SubmissionValidationError);
});

test.skipIf(!DB)("a pin mismatch throws PinMismatch (via getInstanceView on a resolver mismatch)", async () => {
  const PID = pid("proc_pin_mismatch");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // Corrupt the persisted pin so it no longer matches the published body's hash.
  await sql`UPDATE instances SET body = jsonb_set(body, '{definitionHash}', '"deadbeef"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  let raised: unknown;
  try {
    await getInstanceView(created.instanceId, actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(PinMismatch);
});

test.skipIf(!DB)("a pin mismatch throws PinMismatch via submitAndTransition's own locked pin check", async () => {
  const PID = pid("proc_pin_mismatch_submit");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // submitAndTransition verifies the pin itself (it can't use rehydrate — the
  // row must be locked before the body is known) — this exercises that copy
  // of the check independently of getInstanceView's.
  await sql`UPDATE instances SET body = jsonb_set(body, '{definitionHash}', '"deadbeef"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, {} as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(PinMismatch);
});

// ============================================================
// Happy-path round trip against the real expense-approval example
// ============================================================

test.skipIf(!DB)("happy path: create -> view -> submit -> view against expense-approval.json", async () => {
  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  const authored = raw.definition as ProcessBody;
  const expenseReg = createRegistry();
  expenseReg.set("accounting.postInvoice", { handler: async () => ({ status: "pending" }) });
  expenseReg.set("notify.email", { handler: async () => ({}) });

  const PID = pid("proc_expense_approval");
  await publishBody(PID, authored, expenseReg, dataSourceReg);

  const amountField = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001" as FieldId;
  const reasonField = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002" as FieldId;
  const reviewNoteField = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003" as FieldId;
  const submitPath = "path_bbbb2222-0001-4a1c-8e2f-000000000001" as PathId;
  const approvePath = "path_bbbb2222-0002-4a1c-8e2f-000000000002" as PathId;
  // "capture" and "review" both declare an assignment (employee /
  // finance-approver respectively) — a dedicated actor holding both roles,
  // distinct from the file's roleless `actor`, so claimStep is eligible.
  const demoActor: Actor = { id: "user_demo", roles: ["employee", "finance-approver"] };

  const created = await createProcessInstance(PID, demoActor, dataSourceReg);
  const captureView = await getInstanceView(created.instanceId, demoActor, dataSourceReg);
  expect(captureView.step.key).toBe("capture");
  expect(captureView.availablePaths.map((p) => p.id)).toEqual([submitPath]);

  await claimStep(created.instanceId, demoActor);
  const afterCapture = await submitAndTransition(
    created.instanceId,
    submitPath,
    { [amountField]: 42, [reasonField]: "Taxi" } as unknown as Instance["data"],
    demoActor, dataSourceReg,
  );
  expect(afterCapture.currentStepId as string).toBe("step_aaaa1111-0002-4a1c-8e2f-000000000002");

  const reviewView = await getInstanceView(afterCapture.instanceId, demoActor, dataSourceReg);
  expect(reviewView.step.key).toBe("review");
  const byId = new Map(reviewView.fields.map((f) => [f.field.id as string, f]));
  expect(byId.get(amountField)!.readonly).toBe(true);
  expect(byId.get(amountField)!.value).toBe(42);
  expect(byId.get(reviewNoteField)!.required).toBe(true);

  await claimStep(afterCapture.instanceId, demoActor);
  const afterReview = await submitAndTransition(
    afterCapture.instanceId,
    approvePath,
    { [reviewNoteField]: "Looks fine" } as unknown as Instance["data"],
    demoActor, dataSourceReg,
  );
  // "book" is a wait-state driven by an async action's writeback, which is
  // never delivered here (no outbox worker running) — the instance parks
  // there, which is itself a valid resting state to assert on.
  expect(afterReview.currentStepId as string).toBe("step_aaaa1111-0003-4a1c-8e2f-000000000003");
  expect(afterReview.status).toBe("running");

  const bookView = await getInstanceView(afterReview.instanceId, demoActor, dataSourceReg);
  expect(bookView.step.key).toBe("book");
  expect(bookView.availablePaths).toEqual([]); // book's paths are automatic
});

// ============================================================
// listInstances
// ============================================================

/** step_a (assigned to "approver"/"user_1"), initial --(path_ab, manual, guardless)--> step_b (terminal). */
const assignedBody = (): ProcessBody =>
  ({
    key: "assigned_body_listing",
    label: { en: "Assigned Body" },
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

test.skipIf(!DB)("listInstances with no filters returns every instance, no data field", async () => {
  const PID = pid("proc_list_all");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances();
  expect(page.items.length).toBe(3);
  for (const item of page.items) expect((item as unknown as { data?: unknown }).data).toBeUndefined();
});

test.skipIf(!DB)("listInstances resolves processLabel/stepLabel from the pinned version body, and nothing else from it", async () => {
  const PID = pid("proc_list_labels");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ processId: PID });
  const item = page.items[0]!;
  expect(item.processLabel).toEqual({ en: "Two Paths Body" });
  expect(item.stepLabel).toEqual({ en: "A" });
  expect(item.processBaseLocale).toBe("en");
  expect(Object.keys(item)).not.toContain("workflow");
  expect(Object.keys(item)).not.toContain("fields");
});

test.skipIf(!DB)("listInstances' currentStepEnteredAt reflects the current step's entry, updated by a transition rather than fixed at creation", async () => {
  const PID = pid("proc_list_step_entered");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const beforePage = await listInstances({ processId: PID });
  const before = beforePage.items[0]!;
  expect(before.currentStepEnteredAt).toBeDefined();

  await new Promise((r) => setTimeout(r, 5));
  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);

  const afterPage = await listInstances({ processId: PID });
  const after = afterPage.items[0]!;
  expect(after.currentStepEnteredAt).toBeDefined();
  expect(new Date(after.currentStepEnteredAt!).getTime()).toBeGreaterThan(new Date(before.currentStepEnteredAt!).getTime());
});

test.skipIf(!DB)("listInstances filters by processId and status, excluding another process and another status", async () => {
  const PID_A = pid("proc_list_filter_a");
  const PID_B = pid("proc_list_filter_b");
  await publishBody(PID_A, twoPathsBody(), reg, dataSourceReg);
  await publishBody(PID_B, twoPathsBody(), reg, dataSourceReg);
  const toComplete = await createProcessInstance(PID_A, actor, dataSourceReg);
  await submitAndTransition(toComplete.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg); // completes it
  const stillRunning = await createProcessInstance(PID_A, actor, dataSourceReg);
  await createProcessInstance(PID_B, actor, dataSourceReg);

  const page = await listInstances({ processId: PID_A, status: ["running"] });
  expect(page.items.map((i) => i.instanceId)).toEqual([stillRunning.instanceId]);
});

test.skipIf(!DB)("listInstances filters by currentStepId", async () => {
  const PID = pid("proc_list_step");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const onA = await createProcessInstance(PID, actor, dataSourceReg);
  const toX = await createProcessInstance(PID, actor, dataSourceReg);
  await submitAndTransition(toX.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);

  const page = await listInstances({ currentStepId: "step_a" as StepId });
  expect(page.items.map((i) => i.instanceId)).toEqual([onA.instanceId]);
});

test.skipIf(!DB)("listInstances filters by claimedBy, excluding an instance claimed by a different actor", async () => {
  const PID = pid("proc_list_claimed_by");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const claimedByUser1 = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(claimedByUser1.instanceId, { id: "user_1", roles: [] });
  const claimedByApprover = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(claimedByApprover.instanceId, { id: "approver", roles: [] });

  const page = await listInstances({ claimedBy: "user_1" });
  expect(page.items.map((i) => i.instanceId)).toEqual([claimedByUser1.instanceId]);
});

test.skipIf(!DB)("listInstances' assignedTo matches an instance claimed by that actor", async () => {
  const PID = pid("proc_list_assigned_claimed");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(created.instanceId, { id: "user_1", roles: [] });

  const page = await listInstances({ assignedTo: "user_1" });
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("listInstances' assignedTo matches an unclaimed instance where the actor is a candidate", async () => {
  const PID = pid("proc_list_assigned_candidate");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ assignedTo: "approver" });
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("listInstances' assignedTo matches an unclaimed instance where one of the actor's roles is a candidate", async () => {
  const PID = pid("proc_list_assigned_role_candidate");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ assignedTo: "user_42", assignedToRoles: ["approver"] });
  expect(page.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("listInstances' assignedTo with a matching role still excludes an instance claimed by a different actor", async () => {
  const PID = pid("proc_list_assigned_role_excluded");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(created.instanceId, { id: "user_1", roles: [] });

  const page = await listInstances({ assignedTo: "user_42", assignedToRoles: ["approver"] });
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("listInstances' assignedTo excludes an instance claimed by a different actor", async () => {
  const PID = pid("proc_list_assigned_excluded");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(created.instanceId, { id: "user_1", roles: [] });

  const page = await listInstances({ assignedTo: "approver" });
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("listInstances filters combine conjunctively: a completed instance claimed by the actor is excluded by status", async () => {
  const PID = pid("proc_list_conjunctive");
  await publishBody(PID, assignedBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await claimStep(created.instanceId, { id: "user_1", roles: [] });
  await submitAndTransition(created.instanceId, "path_ab" as PathId, {} as Instance["data"], { id: "user_1", roles: [] }, dataSourceReg);

  const page = await listInstances({ assignedTo: "user_1", status: ["running"] });
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("listInstances pages through more instances than the limit, covering all of them exactly once", async () => {
  const PID = pid("proc_list_paging");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created: string[] = [];
  for (let i = 0; i < 5; i++) created.push((await createProcessInstance(PID, actor, dataSourceReg)).instanceId as string);

  const seen: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10 && (i === 0 || cursor); i++) {
    const page = await listInstances({}, { limit: 2, cursor });
    seen.push(...page.items.map((it) => it.instanceId as string));
    cursor = page.cursor;
    if (!cursor) break;
  }
  expect(new Set(seen)).toEqual(new Set(created));
  expect(seen.length).toBe(created.length);
});

test.skipIf(!DB)("listInstances orders newest-first", async () => {
  const PID = pid("proc_list_order");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);
  const last = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ processId: PID });
  expect(page.items[0]!.instanceId).toBe(last.instanceId);
});

test.skipIf(!DB)("listInstances caps a limit above the enforced maximum", async () => {
  const PID = pid("proc_list_cap");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({}, { limit: 100_000 });
  expect(page.items.length).toBeLessThanOrEqual(200);
});

test.skipIf(!DB)("an instance created after a listInstances page was read does not appear on the next page of that walk", async () => {
  const PID = pid("proc_list_stable_walk");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const first = await createProcessInstance(PID, actor, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const page1 = await listInstances({ processId: PID }, { limit: 1 });
  expect(page1.cursor).toBeDefined();
  await createProcessInstance(PID, actor, dataSourceReg); // created mid-walk

  const page2 = await listInstances({ processId: PID }, { limit: 1, cursor: page1.cursor });
  const seenIds = [...page1.items, ...page2.items].map((i) => i.instanceId);
  expect(new Set(seenIds).size).toBe(seenIds.length); // no duplicate across the two pages
  expect(seenIds).toContain(first.instanceId);
});

// ============================================================
// getInstanceRecord
// ============================================================

test.skipIf(!DB)("getInstanceRecord merges transitions and events, ordered by transitionSeq then at", async () => {
  const PID = pid("proc_record_merge");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);

  const seqOf = (el: InstanceRecordElement): number => (el.kind === "transition" ? el.entry.transitionSeq : el.event.transitionSeq);

  const page = await getInstanceRecord(created.instanceId);
  expect(page.items.length).toBeGreaterThan(0);
  expect(page.items[0]!.kind).toBe("transition");
  for (let i = 1; i < page.items.length; i++) {
    expect(seqOf(page.items[i]!)).toBeGreaterThanOrEqual(seqOf(page.items[i - 1]!));
  }
});

test.skipIf(!DB)("getInstanceRecord orders two events sharing one transitionSeq by their `at`", async () => {
  const PID = pid("proc_record_same_seq");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // Two synthetic events at the instance's current seq (0), inserted in
  // reverse-`at` order, to isolate the ordering rule from any particular
  // engine-emitted event kind.
  await withTransaction(sql, async (tx) => {
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: created.instanceId,
      transitionSeq: created.transitionSeq,
      version: created.version,
      kind: "migration.skipped",
      payload: { fromVersion: 1, toVersion: 2, reason: "step-unmappable" },
      at: "2026-01-01T00:00:02.000Z",
    });
    await appendInstanceEvent(tx, {
      id: newInstanceEventId(),
      instanceId: created.instanceId,
      transitionSeq: created.transitionSeq,
      version: created.version,
      kind: "migration.skipped",
      payload: { fromVersion: 1, toVersion: 2, reason: "pending-actions" },
      at: "2026-01-01T00:00:01.000Z",
    });
  });

  const page = await getInstanceRecord(created.instanceId);
  const events = page.items.filter((i): i is Extract<InstanceRecordElement, { kind: "event" }> => i.kind === "event");
  expect(events.length).toBe(2);
  expect((events[0]!.event.payload as { reason: string }).reason).toBe("pending-actions");
  expect((events[1]!.event.payload as { reason: string }).reason).toBe("step-unmappable");
});

test.skipIf(!DB)("getInstanceRecord of an unknown instance is an empty sequence, not an error", async () => {
  const page = await getInstanceRecord("inst_does_not_exist" as InstanceId);
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("getInstanceRecord pages, and the second page continues in the same order as the first", async () => {
  const PID = pid("proc_record_paging");
  await publishBody(PID, selfLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  // Three self-loop transitions -> three HistoryEntry rows, no events (no timers/assignment on this body).
  let cur = created;
  for (let i = 0; i < 3; i++) {
    cur = await submitAndTransition(cur.instanceId, "path_self" as PathId, { field_approved: false } as unknown as Instance["data"], actor, dataSourceReg);
  }

  const full = await getInstanceRecord(created.instanceId, { limit: 100 });
  expect(full.items.length).toBe(3);

  const page1 = await getInstanceRecord(created.instanceId, { limit: 2 });
  expect(page1.items.length).toBe(2);
  expect(page1.cursor).toBeDefined();
  const page2 = await getInstanceRecord(created.instanceId, { limit: 2, cursor: page1.cursor });
  expect(page2.items.length).toBe(1);
  expect(page2.cursor).toBeUndefined();
  const combined = [...page1.items, ...page2.items];
  const fullKeys = full.items.map((it) => (it.kind === "transition" ? it.entry.id : it.event.id));
  const combinedKeys = combined.map((it) => (it.kind === "transition" ? it.entry.id : it.event.id));
  expect(combinedKeys).toEqual(fullKeys);
});

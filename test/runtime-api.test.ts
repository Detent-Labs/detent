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
import { sql, initSchema, withTransaction, appendInstanceEvent, newInstanceEventId, createInstance } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry, createAssignmentRegistry } from "../src/engine/registry.js";
import { executeManualTransition, cancelInstance, fireTimer, ConcurrencyConflict, GuardRefused, AutomaticCascadeLoop } from "../src/engine/transition.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { definitionHash } from "../src/schema/hash.js";
import {
  createProcessInstance,
  getInstanceView,
  submitAndTransition,
  claimStep,
  listInstances,
  queryInstances,
  getInstanceRecord,
  SubmissionValidationError,
  PinMismatch,
  NotFoundError,
  InstanceNotRunningError,
  isResolvedViewField,
  type InstanceRecordElement,
  type InstanceSummary,
  type DegradedInstanceSummary,
  type InstanceQueryFilter,
} from "../src/runtime/api.js";
import { redactInstance } from "../src/engine/retention.js";
import { ADMIN_ROLE, DEVELOPER_ROLE, AUTHOR_ROLE, AuthorizationError } from "../src/auth/authorize.js";
import { RequestShapeError } from "../src/errors.js";
import type { ProcessBody, ProcessId, PathId, InstanceId, FieldId, Instance, StepId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const recordAdmin: Actor = { id: "user_admin_record_reader", roles: [ADMIN_ROLE] };
const cel = (src: string) => ({ lang: "cel", src });
const reg = createRegistry();
const dataSourceReg = createDataSourceRegistry();

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

// ============================================================
// Fixture bodies
// ============================================================

/**
 * step_a: amount/name/category required, tags optional (a `list` field with
 * options), due_on optional (`format: "date"`, so the submission validator
 * checks the value against the format's own domain, not only its JS shape),
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
        type: "string",
        options: [{ value: "a", label: { en: "A" } }, { value: "b", label: { en: "B" } }],
      },
      {
        id: "field_tags",
        key: "tags",
        label: { en: "Tags" },
        type: "list",
        options: [{ value: "x", label: { en: "X" } }, { value: "y", label: { en: "Y" } }],
      },
      {
        id: "field_note",
        key: "note",
        label: { en: "Note" },
        type: "string",
        validation: { rule: cel("data.note != 'forbidden'") },
      },
      { id: "field_due_on", key: "due_on", label: { en: "Due On" }, type: "string", format: "date" },
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
              { ref: "field_due_on" },
              { ref: "field_note" },
              { ref: "field_readonly", readonly: true },
              { ref: "field_group", required: true },
            ],
          },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** step_a's view: field_amount, a note visible only when data.amount > 5000, a
 * second note declaring no `visible` at all, then field_name. */
const noteViewBody = (): ProcessBody =>
  ({
    key: "note_view_body",
    label: { en: "Note View Body" },
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_name", key: "name", label: { en: "Name" }, type: "string" },
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
              { ref: "field_amount" },
              { kind: "note", text: { en: "Over 5000 needs the board." }, visible: cel("data.amount > 5000") },
              { kind: "note", text: { en: "Always shown." } },
              { ref: "field_name" },
            ],
          },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
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
        type: "string",
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
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b",
          key: "b",
          label: { en: "B" },
          type: "task",
          paths: [
            { id: "path_approved", key: "approved", label: "Approved", to: "step_approved", trigger: "automatic", priority: 1, guard: cel("data.decision == 'approve'") },
            { id: "path_rejected", key: "rejected", label: "Rejected", to: "step_rejected", trigger: "automatic", priority: 2, guard: cel("data.decision == 'reject'") },
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
            { id: "path_self", key: "self", label: "Self", to: "step_x", trigger: "manual" },
            { id: "path_done", key: "done", label: "Done", to: "step_done", trigger: "manual", guard: cel("data.approved == true") },
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
            { id: "path_x", key: "x", label: "X", to: "step_x", trigger: "manual" },
            { id: "path_y", key: "y", label: "Y", to: "step_y", trigger: "manual" },
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
          paths: [{ id: "path_p1_sub", key: "to_sub", label: "To Sub", to: "step_p_sub", trigger: "manual" }],
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
          paths: [{ id: "path_p_out", key: "out", label: "Out", to: "step_p_done", trigger: "automatic", guard: cel("child.outcome == 'done'") }],
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
          paths: [{ id: "path_ag", key: "ag", label: "Ag", to: "step_g", trigger: "manual" }],
        },
        { id: "step_g", key: "g", label: { en: "G" }, type: "task", paths: [{ id: "path_gh", key: "gh", label: "Gh", to: "step_h", trigger: "automatic" }] },
        { id: "step_h", key: "h", label: { en: "H" }, type: "task", paths: [{ id: "path_hg", key: "hg", label: "Hg", to: "step_g", trigger: "automatic" }] },
      ],
    },
  }) as unknown as ProcessBody;

/**
 * step_a (assigned: candidates ["approver", "user_id_candidate"]) --(path_ab,
 * manual, guardless)--> step_b (terminal, no assignment). Fixture for
 * getInstanceView's relationship-authorization arms: claimant, candidate by
 * id, candidate by role, and the "access follows the current step" scenario.
 */
const assignedViewBody = (): ProcessBody =>
  ({
    key: "assigned_view_body",
    label: { en: "Assigned View Body" },
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
          assignment: { strategy: { type: "static", config: { candidates: ["approver", "user_id_candidate"] } } },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
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
  expect(view.baseLocale).toBe("en");
  const byKey = new Map(view.fields.filter(isResolvedViewField).map((f) => [f.field.key, f]));
  expect(byKey.get("amount")!.value).toBe(100);
  expect(byKey.get("readonly_f")!.readonly).toBe(true);
  expect(view.availablePaths).toEqual([{ id: "path_ab" as PathId, key: "ab", label: "Ab" }]);
  expect(view.columns).toBe(1); // step_a's view declares no columns
});

test.skipIf(!DB)("a hidden note's text never appears in the resolved view", async () => {
  const PID = pid("proc_note_hidden");
  await publishBody(PID, noteViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 100, field_name: "Bob" } as unknown as Instance["data"],
  });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  // field_amount, the always-shown note, field_name — the conditional note's
  // visible (data.amount > 5000) is false, so it resolves to no entry at all.
  expect(view.fields).toHaveLength(3);
  expect(JSON.stringify(view)).not.toContain("board");
});

test.skipIf(!DB)("a field entry, a visible note and a field entry resolve in array order", async () => {
  const PID = pid("proc_note_visible");
  await publishBody(PID, noteViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 6000, field_name: "Bob" } as unknown as Instance["data"],
  });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.fields).toHaveLength(4);
  expect(isResolvedViewField(view.fields[0]!)).toBe(true);
  expect(view.fields[1]).toEqual({ kind: "note", text: { en: "Over 5000 needs the board." }, group: undefined, span: 1 });
  expect(view.fields[2]).toEqual({ kind: "note", text: { en: "Always shown." }, group: undefined, span: 1 });
  expect(isResolvedViewField(view.fields[3]!)).toBe(true);
});

test.skipIf(!DB)("a note declaring no visible resolves, the way a field entry with none does", async () => {
  const PID = pid("proc_note_default_visible");
  await publishBody(PID, noteViewBody(), reg, dataSourceReg);
  const hidden = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 100, field_name: "Bob" } as unknown as Instance["data"],
  });
  const shown = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 6000, field_name: "Bob" } as unknown as Instance["data"],
  });

  const hiddenView = await getInstanceView(hidden.instanceId, actor, dataSourceReg);
  const shownView = await getInstanceView(shown.instanceId, actor, dataSourceReg);
  expect(JSON.stringify(hiddenView)).toContain("Always shown.");
  expect(JSON.stringify(shownView)).toContain("Always shown.");
});

test.skipIf(!DB)("a note leaves the accepted submission keys unchanged", async () => {
  const PID = pid("proc_note_submit");
  await publishBody(PID, noteViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 100, field_name: "Bob" } as unknown as Instance["data"],
  });

  const result = await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_amount: 200, field_name: "Alice" } as unknown as Instance["data"],
    actor,
    dataSourceReg,
  );
  expect(result.currentStepId as string).toBe("step_b");
});

/** step_a --(path_ab, manual, guardless)--> step_b (terminal). view.columns: 2, one field with span: 2. */
const twoColumnViewBody = (): ProcessBody =>
  ({
    key: "two_column_view_body",
    label: { en: "Two Column View Body" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { columns: 2, fields: [{ ref: "field_amount", span: 2 }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("getInstanceView reports a declared view.columns, and a field's declared span survives", async () => {
  const PID = pid("proc_view_columns");
  await publishBody(PID, twoColumnViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.columns).toBe(2);
  const field = view.fields.filter(isResolvedViewField).find((f) => f.field.key === "amount")!;
  expect(field.span).toBe(2);
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
  const groupField = view.fields.filter(isResolvedViewField).find((f) => f.field.key === "grp")!;
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

// technical-field-marker: resolveFields forces required:false, readonly:true
// for a technical field regardless of the view entry's own declaration. These
// bodies violate compile.ts::checkTechnicalFields on purpose (a view entry
// naming a technical field with required/readonly declared, task 1.2's own
// rule), so they are inserted directly into `definitions` — bypassing
// publishBody's compileProcessBody call — to prove resolveFields is a
// defensive layer independent of the publish-time check, not merely
// downstream of it.
test.skipIf(!DB)("getInstanceView reports a technical field as required:false, readonly:true regardless of its view entry", async () => {
  const PID = pid("proc_technical_view");
  const body: ProcessBody = {
    key: "technical_body", label: { en: "Technical Body" }, baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number", technical: true }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_amount", required: true, readonly: false }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${definitionHash(body)}, 'published', ${body})`;
  const created = await createInstance(body, { processId: PID, version: 1, startedBy: actor.id });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  const field = view.fields.filter(isResolvedViewField).find((f) => f.field.key === "amount")!;
  expect(field.required).toBe(false);
  expect(field.readonly).toBe(true);
});

test.skipIf(!DB)("a field declaring both type: group and technical: true resolves via the group branch, not the technical one", async () => {
  const PID = pid("proc_technical_group");
  const body: ProcessBody = {
    key: "technical_group_body", label: { en: "Technical Group Body" }, baseLocale: "en",
    fields: [{ id: "field_g", key: "g", label: { en: "G" }, type: "group", technical: true, fields: [] }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_g" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  await sql`INSERT INTO definitions (process_id, version, definition_hash, status, body)
    VALUES (${PID}, 1, ${definitionHash(body)}, 'published', ${body})`;
  const created = await createInstance(body, { processId: PID, version: 1, startedBy: actor.id });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  const field = view.fields.filter(isResolvedViewField).find((f) => f.field.key === "g")!;
  expect(field.required).toBe(false);
  expect(field.readonly).toBe(false); // group wins over technical: neither flag forces readonly:true here
  expect(field.value).toBeUndefined();
});

test.skipIf(!DB)("getInstanceView resolves a technical: false field from its own view entry, identically to no technical key", async () => {
  const PID = pid("proc_technical_false");
  await publishBody(PID, viewBody(), reg, dataSourceReg); // viewBody's fields declare no `technical` key at all
  const withKey = structuredClone(viewBody());
  (withKey.fields[0] as unknown as { technical: boolean }).technical = false; // field_amount, required:true on step_a's view
  await publishBody(pid("proc_technical_false_2"), withKey, reg, dataSourceReg);

  const createdBaseline = await createProcessInstance(PID, actor, dataSourceReg, {
    data: { field_amount: 1, field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
  });
  const createdFalse = await createProcessInstance(pid("proc_technical_false_2"), actor, dataSourceReg, {
    data: { field_amount: 1, field_name: "Bob", field_category: "a" } as unknown as Instance["data"],
  });

  const baselineView = await getInstanceView(createdBaseline.instanceId, actor, dataSourceReg);
  const falseView = await getInstanceView(createdFalse.instanceId, actor, dataSourceReg);
  const baselineField = baselineView.fields.filter(isResolvedViewField).find((f) => f.field.key === "amount")!;
  const falseField = falseView.fields.filter(isResolvedViewField).find((f) => f.field.key === "amount")!;
  expect(falseField.required).toBe(baselineField.required);
  expect(falseField.readonly).toBe(baselineField.readonly);
});

/** step_a: field_amount required; field_secret is technical, placed visibly with no required/readonly key. */
const technicalDirectBody = (): ProcessBody =>
  ({
    key: "technical_direct_body",
    label: { en: "Technical Direct Body" },
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_secret", key: "secret", label: { en: "Secret" }, type: "string", technical: true },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_amount", required: true }, { ref: "field_secret" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("submitAndTransition rejects a submitted key naming a technical field with readonly-field", async () => {
  const PID = pid("proc_technical_submit");
  await publishBody(PID, technicalDirectBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 1 } as unknown as Instance["data"] });

  let raised: unknown;
  try {
    await submitAndTransition(
      created.instanceId,
      "path_ab" as PathId,
      { field_amount: 2, field_secret: "leak" } as unknown as Instance["data"],
      actor,
      dataSourceReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "readonly-field", fieldId: "field_secret" as FieldId }]);
});

test.skipIf(!DB)("createProcessInstance rejects a seeded key naming a technical field with readonly-field", async () => {
  const PID = pid("proc_technical_seed");
  await publishBody(PID, technicalDirectBody(), reg, dataSourceReg);

  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 1, field_secret: "leak" } as unknown as Instance["data"] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "readonly-field", fieldId: "field_secret" as FieldId }]);
});

/** step_a: field_amount required; field_secret is technical but no step's view references it at all. */
const technicalUnplacedBody = (): ProcessBody =>
  ({
    key: "technical_unplaced_body",
    label: { en: "Technical Unplaced Body" },
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number" },
      { id: "field_secret", key: "secret", label: { en: "Secret" }, type: "string", technical: true },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_amount", required: true }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)(
  "submitAndTransition rejects a submitted key naming a technical field the current step's view does not resolve at all, with unknown-field",
  async () => {
    const PID = pid("proc_technical_unplaced");
    await publishBody(PID, technicalUnplacedBody(), reg, dataSourceReg);
    const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 1 } as unknown as Instance["data"] });

    let raised: unknown;
    try {
      await submitAndTransition(
        created.instanceId,
        "path_ab" as PathId,
        { field_amount: 2, field_secret: "leak" } as unknown as Instance["data"],
        actor,
        dataSourceReg,
      );
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(SubmissionValidationError);
    expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "unknown-field", fieldId: "field_secret" as FieldId }]);
  },
);

// ============================================================
// createProcessInstance: FieldDef.default seeding
// ============================================================

/**
 * step_a: field_alpha (string) carries `alphaDefault`; field_beta (number)
 * carries `betaDefault`. Both sit on step_a's view, so the ordinary
 * (non-exempt) validation path covers them. field_group is a group
 * container whose own child (field_child) carries `childDefault`.
 * step_a --(path_ab, manual, guardless)--> step_b (terminal).
 */
const defaultsBody = (
  betaDefault: unknown,
  alphaDefault: unknown = "seeded",
  childDefault: unknown = undefined,
): ProcessBody =>
  ({
    key: "defaults_body",
    label: { en: "Defaults Body" },
    baseLocale: "en",
    fields: [
      { id: "field_alpha", key: "alpha", label: { en: "Alpha" }, type: "string", default: alphaDefault },
      { id: "field_beta", key: "beta", label: { en: "Beta" }, type: "number", default: betaDefault },
      {
        id: "field_group",
        key: "grp",
        label: { en: "Group" },
        type: "group",
        default: "group-default-never-read",
        fields: [{ id: "field_child", key: "child", label: { en: "Child" }, type: "string", default: childDefault }],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_alpha" }, { ref: "field_beta" }, { ref: "field_group" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a field carrying only a default is visible to the initial step's assignment strategy resolver", async () => {
  const PID = pid("proc_defaults_assignment");
  const body = structuredClone(defaultsBody(5)) as ProcessBody;
  (body.workflow.steps[0] as unknown as { assignment: unknown }).assignment = {
    strategy: { type: "spy", config: {} },
  };

  const calls: { instance: { data: Instance["data"] } }[] = [];
  const assignReg = createAssignmentRegistry();
  assignReg.set("spy", {
    resolve: async (ctx) => {
      calls.push(ctx);
      return ["user_1"];
    },
  });
  await publishBody(PID, body, reg, dataSourceReg, sql, assignReg);

  const created = await createProcessInstance(PID, actor, dataSourceReg, {}, sql, assignReg);
  expect(calls.length).toBe(1);
  expect(calls[0]!.instance.data).toMatchObject({ field_alpha: "seeded", field_beta: 5 });
  expect(created.assignment?.candidates).toEqual(["user_1"]);
});

test.skipIf(!DB)("a Literal default seeds a field opts.data leaves unset", async () => {
  const PID = pid("proc_defaults_literal");
  await publishBody(PID, defaultsBody(5), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_alpha" as FieldId]).toBe("seeded");
  expect(created.data["field_beta" as FieldId]).toBe(5);
});

test.skipIf(!DB)("an explicitly submitted value wins over a default on the same field", async () => {
  const PID = pid("proc_defaults_precedence");
  await publishBody(PID, defaultsBody(5), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_alpha: "explicit" } as unknown as Instance["data"] });
  expect(created.data["field_alpha" as FieldId]).toBe("explicit");
  expect(created.data["field_beta" as FieldId]).toBe(5);
});

test.skipIf(!DB)("a later field's Expression default reads an earlier field's already-resolved value", async () => {
  const PID = pid("proc_defaults_read_earlier");
  // field_beta's default reads data.alpha (re-keyed to field_alpha's own key).
  await publishBody(PID, defaultsBody(cel("data.alpha == 'seeded' ? 1 : 0")), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBe(1);

  const PID2 = pid("proc_defaults_read_earlier_submitted");
  await publishBody(PID2, defaultsBody(cel("data.alpha == 'explicit' ? 1 : 0")), reg, dataSourceReg);
  const created2 = await createProcessInstance(PID2, actor, dataSourceReg, { data: { field_alpha: "explicit" } as unknown as Instance["data"] });
  expect(created2.data["field_beta" as FieldId]).toBe(1);
});

test.skipIf(!DB)("an earlier field's default cannot read a later field's value", async () => {
  const PID = pid("proc_defaults_read_later");
  // field_alpha (earlier) defaults by reading data.beta (later) — raises for the missing key.
  const body = defaultsBody(5, cel("string(data.beta)"));
  await publishBody(PID, body, reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_alpha" as FieldId]).toBeUndefined();
  expect(created.data["field_beta" as FieldId]).toBe(5);
});

test.skipIf(!DB)("a raising Expression default leaves its field unset, and creation still succeeds", async () => {
  const PID = pid("proc_defaults_raising");
  await publishBody(PID, defaultsBody(cel("1 / 0")), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBeUndefined();
  expect(created.data["field_alpha" as FieldId]).toBe("seeded");
});

test.skipIf(!DB)("a group field's own default is never read; its children's defaults still seed", async () => {
  const PID = pid("proc_defaults_group");
  await publishBody(PID, defaultsBody(5, "seeded", "child-default"), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_group" as FieldId]).toBeUndefined();
  expect(created.data["field_child" as FieldId]).toBe("child-default");
});

test.skipIf(!DB)("a default resolving to a value failing type/option/constraint throws, like a bad opts.data value", async () => {
  const PID = pid("proc_defaults_bad_type");
  await publishBody(PID, defaultsBody("not-a-number" as unknown), reg, dataSourceReg);
  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([
    { kind: "type-mismatch", fieldId: "field_beta" as FieldId, expected: "number" },
  ]);
});

test.skipIf(!DB)("a declared default does not satisfy a missing required field at submitAndTransition", async () => {
  const PID = pid("proc_defaults_required_missing");
  // field_beta's default raises (divide by zero), so it never seeds — the
  // required check at submitAndTransition must still catch its absence,
  // proving `default` is never read there, only at creation.
  const body = structuredClone(defaultsBody(cel("1 / 0"))) as ProcessBody;
  (body.workflow.steps[0].view!.fields[1] as unknown as { required: boolean }).required = true;
  await publishBody(PID, body, reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBeUndefined(); // the raising default left it unset

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_alpha: "resubmitted" } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "required-missing", fieldId: "field_beta" as FieldId }]);
});

test.skipIf(!DB)("a default on a step-level readonly-overridden field is judged by the step's own overridden validation", async () => {
  const PID = pid("proc_defaults_readonly_override");
  const body = structuredClone(defaultsBody(500)) as ProcessBody;
  (body.fields[1] as unknown as { validation: unknown }).validation = { max: 10 };
  (body.workflow.steps[0].view!.fields[1] as unknown as { readonly: boolean; validation: unknown }).readonly = true;
  (body.workflow.steps[0].view!.fields[1] as unknown as { readonly: boolean; validation: unknown }).validation = { max: 1000 };
  await publishBody(PID, body, reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBe(500); // exceeds catalog's max:10, allowed by the step's own override of max:1000
});

test.skipIf(!DB)("a technical field's Literal default seeds with no readonly-field rejection", async () => {
  const PID = pid("proc_defaults_technical");
  const body = structuredClone(defaultsBody(5)) as ProcessBody;
  (body.fields[1] as unknown as { technical: boolean }).technical = true;
  await publishBody(PID, body, reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBe(5);
});

test.skipIf(!DB)("an off-view dataSource-bound field's Literal default seeds regardless of its value", async () => {
  const PID = pid("proc_defaults_offview_datasource");
  const body: ProcessBody = {
    key: "defaults_offview_ds", label: { en: "Defaults Offview DS" }, baseLocale: "en",
    dataSources: [{ id: "ds_1", key: "ds1", type: "test.defaults-offview-options", config: {} }],
    fields: [
      { id: "field_visible", key: "visible", label: { en: "Visible" }, type: "string" },
      { id: "field_offview", key: "offview", label: { en: "Offview" }, type: "string", dataSource: "ds_1", default: "not-a-listed-option" },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_visible" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  const dsReg = createDataSourceRegistry();
  dsReg.set("test.defaults-offview-options", { resolve: async () => [{ value: "a", label: { en: "A" } }] });
  await publishBody(PID, body, reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  expect(created.data["field_offview" as FieldId]).toBe("not-a-listed-option");
});

test.skipIf(!DB)("a default expression reading instance.status or instance.currentStepId does not raise", async () => {
  const PID = pid("proc_defaults_instance_state");
  await publishBody(PID, defaultsBody(cel("instance.status == 'running' && instance.currentStepId == 'step_a' ? 1 : 0")), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBe(1);
});

test.skipIf(!DB)("an Expression default evaluating to a CEL int seeds a JSON-safe number, not a bigint", async () => {
  const PID = pid("proc_defaults_int_literal");
  await publishBody(PID, defaultsBody(cel("5")), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data["field_beta" as FieldId]).toBe(5);
  expect(typeof created.data["field_beta" as FieldId]).toBe("number");

  const PID2 = pid("proc_defaults_int_arithmetic");
  const body2: ProcessBody = {
    key: "defaults_arith", label: { en: "Defaults Arith" }, baseLocale: "en",
    fields: [
      { id: "field_qty", key: "qty", label: { en: "Qty" }, type: "number", default: cel("3") },
      { id: "field_price", key: "price", label: { en: "Price" }, type: "number", default: cel("4") },
      { id: "field_total", key: "total", label: { en: "Total" }, type: "number", default: cel("data.qty * data.price") },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_qty" }, { ref: "field_price" }, { ref: "field_total" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
  await publishBody(PID2, body2, reg, dataSourceReg);
  const created2 = await createProcessInstance(PID2, actor, dataSourceReg);
  expect(created2.data["field_total" as FieldId]).toBe(12);
  expect(typeof created2.data["field_total" as FieldId]).toBe("number");
});

test.skipIf(!DB)("a default seeds a field the initial step's view does not reference, using expense-approval.json's booking_status", async () => {
  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  const authored = raw.definition as ProcessBody;
  const expenseReg = createRegistry();
  expenseReg.set("http.request", { handler: async () => ({ body: { status: "pending" } }) });
  expenseReg.set("notification.email", { handler: async () => ({}) });
  const PID = pid("proc_defaults_offview_booking_status");
  await publishBody(PID, authored, expenseReg, dataSourceReg);
  const bookingStatusField = "field_1a2b3c4d-0004-4a1c-8e2f-000000000004" as FieldId;

  const created = await createProcessInstance(PID, actor, dataSourceReg);
  expect(created.data[bookingStatusField]).toBe("pending");
});

test.skipIf(!DB)("an off-view default failing its own validation.rule throws with rule-failed", async () => {
  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  const authored = structuredClone(raw.definition) as ProcessBody;
  const bookingStatusField = "field_1a2b3c4d-0004-4a1c-8e2f-000000000004" as FieldId;
  const bookingStatusDef = authored.fields.find((f) => (f.id as string) === (bookingStatusField as string))!;
  (bookingStatusDef as unknown as { validation: unknown }).validation = { rule: cel("data.booking_status != 'pending'") };
  const expenseReg = createRegistry();
  expenseReg.set("http.request", { handler: async () => ({ body: { status: "pending" } }) });
  expenseReg.set("notification.email", { handler: async () => ({}) });
  const PID = pid("proc_defaults_offview_rule_failed");
  await publishBody(PID, authored, expenseReg, dataSourceReg);

  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "rule-failed", fieldId: bookingStatusField }]);
});

test.skipIf(!DB)(
  "creating a fresh expense-approval.json instance seeds booking_status to pending, and 'book' still parks as a wait-state",
  async () => {
    const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
    const authored = raw.definition as ProcessBody;
    const expenseReg = createRegistry();
    expenseReg.set("http.request", { handler: async () => ({ body: { status: "pending" } }) });
    expenseReg.set("notification.email", { handler: async () => ({}) });
    const PID = pid("proc_defaults_expense_pending");
    await publishBody(PID, authored, expenseReg, dataSourceReg);

    const amountField = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001" as FieldId;
    const reasonField = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002" as FieldId;
    const reviewNoteField = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003" as FieldId;
    const bookingStatusField = "field_1a2b3c4d-0004-4a1c-8e2f-000000000004" as FieldId;
    const submitPath = "path_bbbb2222-0001-4a1c-8e2f-000000000001" as PathId;
    const approvePath = "path_bbbb2222-0002-4a1c-8e2f-000000000002" as PathId;
    const demoActor: Actor = { id: "user_demo", roles: ["employee", "finance-approver"] };

    const created = await createProcessInstance(PID, demoActor, dataSourceReg);
    expect(created.data[bookingStatusField]).toBe("pending");

    await claimStep(created.instanceId, demoActor);
    const afterCapture = await submitAndTransition(
      created.instanceId,
      submitPath,
      { [amountField]: 42, [reasonField]: "Taxi" } as unknown as Instance["data"],
      demoActor, dataSourceReg,
    );

    await claimStep(afterCapture.instanceId, demoActor);
    const afterReview = await submitAndTransition(
      afterCapture.instanceId,
      approvePath,
      { [reviewNoteField]: "Looks fine" } as unknown as Instance["data"],
      demoActor, dataSourceReg,
    );
    // "pending" matches neither the booked nor the failed guard, so book parks.
    expect(afterReview.currentStepId as string).toBe("step_aaaa1111-0003-4a1c-8e2f-000000000003");
    expect(afterReview.status).toBe("running");
  },
);

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
  expect(view.baseLocale).toBe("en");
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

test.skipIf(!DB)("getInstanceView omits redactedAt before redaction and returns it after", async () => {
  const PID = pid("proc_view_redacted");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const result = await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_decision: "approve" } as unknown as Instance["data"],
    actor, dataSourceReg,
  );
  expect(result.status).toBe("completed");

  const before = await getInstanceView(result.instanceId, actor, dataSourceReg);
  expect(before.redactedAt).toBeUndefined();

  await redactInstance(result.instanceId, sql);
  const after = await getInstanceView(result.instanceId, actor, dataSourceReg);
  expect(after.redactedAt).toBeDefined();
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
// getInstanceView — relationship authorization
// ============================================================

test.skipIf(!DB)("getInstanceView succeeds for the starter", async () => {
  const PID = pid("proc_view_auth_starter");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.step.key).toBe("a");
});

test.skipIf(!DB)("getInstanceView succeeds for the current claimant", async () => {
  const PID = pid("proc_view_auth_claimant");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const claimant: Actor = { id: "user_claimant", roles: ["approver"] };
  await claimStep(created.instanceId, claimant);

  const view = await getInstanceView(created.instanceId, claimant, dataSourceReg);
  expect(view.step.key).toBe("a");
});

test.skipIf(!DB)("getInstanceView succeeds for an eligible candidate by id, unclaimed", async () => {
  const PID = pid("proc_view_auth_cand_id");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const candidateById: Actor = { id: "user_id_candidate", roles: [] };

  const view = await getInstanceView(created.instanceId, candidateById, dataSourceReg);
  expect(view.step.key).toBe("a");
});

test.skipIf(!DB)("getInstanceView succeeds for an eligible candidate by role, unclaimed", async () => {
  const PID = pid("proc_view_auth_cand_role");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const candidateByRole: Actor = { id: "user_role_candidate", roles: ["approver"] };

  const view = await getInstanceView(created.instanceId, candidateByRole, dataSourceReg);
  expect(view.step.key).toBe("a");
});

test.skipIf(!DB)("getInstanceView succeeds for an ADMIN_ROLE actor with no other relationship", async () => {
  const PID = pid("proc_view_auth_admin");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const admin: Actor = { id: "user_admin_view", roles: [ADMIN_ROLE] };

  const view = await getInstanceView(created.instanceId, admin, dataSourceReg);
  expect(view.step.key).toBe("a");
});

test.skipIf(!DB)("getInstanceView rejects an unrelated authenticated actor", async () => {
  const PID = pid("proc_view_auth_unrelated");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const outsider: Actor = { id: "user_outsider", roles: [] };

  let raised: unknown;
  try {
    await getInstanceView(created.instanceId, outsider, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("getInstanceView rejects an actor whose candidacy was on a step the instance has since left", async () => {
  const PID = pid("proc_view_auth_past_candidate");
  await publishBody(PID, assignedViewBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const pastCandidate: Actor = { id: "user_id_candidate", roles: [] };
  const claimant: Actor = { id: "user_claimant2", roles: ["approver"] };

  // pastCandidate could read the view while step_a is current...
  await getInstanceView(created.instanceId, pastCandidate, dataSourceReg);

  // ...but not once the instance has moved on to step_b, which declares no
  // assignment, and pastCandidate is neither the starter nor ADMIN_ROLE.
  await claimStep(created.instanceId, claimant);
  await submitAndTransition(created.instanceId, "path_ab" as PathId, {} as Instance["data"], claimant, dataSourceReg);

  let raised: unknown;
  try {
    await getInstanceView(created.instanceId, pastCandidate, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
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

test.skipIf(!DB)("invalid-option: a single-pick value outside options is rejected", async () => {
  await expectIssue({ field_category: "z" }, { kind: "invalid-option", fieldId: "field_category" });
});

test.skipIf(!DB)("invalid-option: a list item outside options is rejected", async () => {
  await expectIssue({ field_tags: ["x", "z"] }, { kind: "invalid-option", fieldId: "field_tags" });
});

// The format half of the type rule (field-model-type-format-control, D19).
// `type: "string"` alone accepted any string; the format narrows it to an
// ISO-8601 calendar date, and the issue names the format rather than the JS
// shape, so `issue-messages.ts` needs no new branch.
test.skipIf(!DB)("type-mismatch: a value the field's format refuses is rejected, naming the format", async () => {
  await expectIssue({ field_due_on: "banane" }, { kind: "type-mismatch", fieldId: "field_due_on", expected: "date" });
});

test.skipIf(!DB)("type-mismatch: a date the calendar does not hold is rejected", async () => {
  await expectIssue({ field_due_on: "2026-02-30" }, { kind: "type-mismatch", fieldId: "field_due_on", expected: "date" });
});

test.skipIf(!DB)("a value inside the format's domain submits", async () => {
  const instanceId = await freshInstance();
  const after = await submitAndTransition(
    instanceId,
    "path_ab" as PathId,
    { field_due_on: "2026-02-28" } as unknown as Instance["data"],
    actor,
    dataSourceReg,
  );
  expect((after.data as Record<string, unknown>).field_due_on).toBe("2026-02-28");
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

// harden-publish-validation: pattern is evaluated only when the value's own
// length constraints raised no violation. field_name declares both
// maxLength: 10 and pattern: "^[A-Za-z]+$" (see line ~66) — a value that is
// simultaneously too long AND would fail the pattern (digits present) must
// report ONLY the maxLength violation, proving the pattern was never run
// against it, not merely that both violations happened to be reported.
test.skipIf(!DB)("constraint: an over-maxLength value is not also pattern-tested", async () => {
  const instanceId = await freshInstance();
  let raised: unknown;
  try {
    await submitAndTransition(instanceId, "path_ab" as PathId, { field_name: "1234567890123" } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  const issues = (raised as SubmissionValidationError).issues as unknown as Record<string, unknown>[];
  expect(issues).toContainEqual(expect.objectContaining({ kind: "constraint", fieldId: "field_name", constraint: "maxLength" }));
  expect(issues).not.toContainEqual(expect.objectContaining({ kind: "constraint", fieldId: "field_name", constraint: "pattern" }));
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
// Step-level validation overrides (ViewField.validation/validationMode)
// ============================================================

/**
 * field_amount: catalog min 0, max 1000. field_note: catalog rule rejecting
 * "forbidden". step_a's view overrides each per the caller's extra object,
 * so the same shape drives every merge/replace/widen/narrow case below.
 */
const overrideBody = (amountExtra: object, noteExtra: object = {}): ProcessBody =>
  ({
    key: "override_body",
    label: { en: "Override Body" },
    baseLocale: "en",
    fields: [
      { id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number", validation: { min: 0, max: 1000 } },
      { id: "field_note", key: "note", label: { en: "Note" }, type: "string", validation: { rule: cel("data.note != 'forbidden'") } },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_amount", ...amountExtra }, { ref: "field_note", ...noteExtra }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("step override: a narrowed max rejects a value the catalog allows", async () => {
  const PID = pid(`proc_override_narrow_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({ validation: { max: 500 } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: 800 } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "constraint", fieldId: "field_amount" as FieldId, constraint: "max" });
});

test.skipIf(!DB)("step override: a widened max accepts a value the catalog rejects", async () => {
  const PID = pid(`proc_override_widen_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({ validation: { max: 2000 } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  const result = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: 1500 } as unknown as Instance["data"], actor, dataSourceReg);
  expect(result.data).toMatchObject({ field_amount: 1500 });
});

test.skipIf(!DB)("step override: merge keeps the catalog keys the step omits", async () => {
  const PID = pid(`proc_override_merge_${crypto.randomUUID()}`);
  // No validationMode: the default is merge, so the catalog's min: 0 still applies.
  await publishBody(PID, overrideBody({ validation: { max: 500 } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: -5 } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "constraint", fieldId: "field_amount" as FieldId, constraint: "min" });
});

test.skipIf(!DB)("step override: replace drops the catalog keys the step omits", async () => {
  const PID = pid(`proc_override_replace_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({ validation: { max: 500 }, validationMode: "replace" }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  // Replace drops the catalog's min: 0, so a negative value now passes.
  const result = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: -5 } as unknown as Instance["data"], actor, dataSourceReg);
  expect(result.data).toMatchObject({ field_amount: -5 });
});

test.skipIf(!DB)("step override: replace drops the catalog rule when the step declares none of its own", async () => {
  const PID = pid(`proc_override_replace_rule_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({}, { validation: { minLength: 1 }, validationMode: "replace" }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  // The catalog rule (rejects "forbidden") does not apply: replace dropped it.
  const result = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_note: "forbidden" } as unknown as Instance["data"], actor, dataSourceReg);
  expect(result.data).toMatchObject({ field_note: "forbidden" });
});

test.skipIf(!DB)("step override: a step rule supersedes the catalog rule, and is itself still enforced", async () => {
  const PID = pid(`proc_override_rule_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({}, { validation: { rule: cel("data.note != 'blocked'") } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  // The catalog rule (rejects "forbidden") no longer applies: only the step's does.
  const result = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_note: "forbidden" } as unknown as Instance["data"], actor, dataSourceReg);
  expect(result.data).toMatchObject({ field_note: "forbidden" });
});

test.skipIf(!DB)("step override: the step's own rule rejects the value it names", async () => {
  const PID = pid(`proc_override_rule2_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({}, { validation: { rule: cel("data.note != 'blocked'") } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_note: "blocked" } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "rule-failed", fieldId: "field_note" as FieldId });
});

test.skipIf(!DB)("step override: createProcessInstance's seed is judged by the initial step's override", async () => {
  const PID = pid(`proc_override_seed_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({ validation: { max: 500 } }), reg, dataSourceReg);

  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 800 } as unknown as Instance["data"] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "constraint", fieldId: "field_amount" as FieldId, constraint: "max" });
});

test.skipIf(!DB)("step override: the resolved view field carries no new key on the wire", async () => {
  const PID = pid(`proc_override_wire_${crypto.randomUUID()}`);
  await publishBody(PID, overrideBody({ validation: { max: 500 } }), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  const amountField = view.fields.filter(isResolvedViewField).find((f) => f.field.key === "amount")!;
  expect(Object.keys(amountField)).not.toContain("validation");
});

/**
 * field_amount: catalog min 0, max 1000. step_a overrides max to 500,
 * step_b overrides it to 2000 — two steps, two independent overrides on the
 * same catalog field, so a value judged by one is not judged by the other.
 */
const twoStepOverrideBody = (): ProcessBody =>
  ({
    key: "two_step_override_body",
    label: { en: "Two Step Override Body" },
    baseLocale: "en",
    fields: [{ id: "field_amount", key: "amount", label: { en: "Amount" }, type: "number", validation: { min: 0, max: 1000 } }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a", key: "a", label: { en: "A" }, type: "task",
          view: { fields: [{ ref: "field_amount", validation: { max: 500 } }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        {
          id: "step_b", key: "b", label: { en: "B" }, type: "task",
          view: { fields: [{ ref: "field_amount", validation: { max: 2000 } }] },
          paths: [{ id: "path_bc", key: "bc", label: "Bc", to: "step_c", trigger: "manual" }],
        },
        { id: "step_c", key: "c", label: { en: "C" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("step override: two steps judge the same value by their own override, neither affecting the other", async () => {
  const PID = pid(`proc_override_two_step_${crypto.randomUUID()}`);
  await publishBody(PID, twoStepOverrideBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg, { data: { field_amount: 100 } as unknown as Instance["data"] });

  // step_a's override (max 500) rejects 800.
  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: 800 } as unknown as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toContainEqual({ kind: "constraint", fieldId: "field_amount" as FieldId, constraint: "max" });

  // Leave step_a with a value both overrides accept.
  const afterA = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_amount: 300 } as unknown as Instance["data"], actor, dataSourceReg);
  expect(afterA.currentStepId as string).toBe("step_b");

  // The same 800 that step_a rejected, step_b's own override (max 2000) accepts.
  const afterB = await submitAndTransition(created.instanceId, "path_bc" as PathId, { field_amount: 800 } as unknown as Instance["data"], actor, dataSourceReg);
  expect(afterB.data).toMatchObject({ field_amount: 800 });
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

test.skipIf(!DB)("two concurrent submitAndTransition calls: the winner fulfils, the loser learns it lost", async () => {
  const PID = pid("proc_two_paths_1");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // The row lock serializes the two calls; the loser's own locked read comes
  // back fresh — by the time it runs, the instance is already `completed` on
  // a terminal step. Previously `commitManualTransition`'s non-running no-op
  // returned it unchanged and the loser was told 200 with its data silently
  // discarded (see correct-api-error-responses's design.md — the sharpest
  // edge of that change). The runtime-API boundary now rejects instead: the
  // loser's submitAndTransition call throws InstanceNotRunningError, thrown
  // right after the loser's own locked read, before the engine's no-op is
  // ever reached. Exactly ONE transition still commits — the write behavior
  // is unchanged, only the loser's answer is.
  const results = await Promise.allSettled([
    submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg),
    submitAndTransition(created.instanceId, "path_y" as PathId, {} as Instance["data"], actor, dataSourceReg),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InstanceNotRunningError);

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

// ============================================================
// InstanceNotRunningError: submit against a non-running instance
// ============================================================

test.skipIf(!DB)("a submission to a cancelled instance throws InstanceNotRunningError and writes nothing", async () => {
  const PID = pid("proc_submit_cancelled_1");
  const published = await publishBody(PID, selfLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const cancelled = await cancelInstance(created, published.definition, actor);
  expect(cancelled.status).toBe("cancelled");

  let raised: unknown;
  try {
    await submitAndTransition(cancelled.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(InstanceNotRunningError);
  expect((raised as InstanceNotRunningError).status).toBe("cancelled");

  // No additional write landed beyond the cancel's own commit: the rejected
  // submission's transitionSeq matches the cancellation's, not one higher.
  const row = (await sql`SELECT transition_seq FROM instances WHERE instance_id = ${cancelled.instanceId}`) as { transition_seq: number }[];
  expect(row[0]!.transition_seq).toBe(cancelled.transitionSeq);
});

test.skipIf(!DB)("a submission to a faulted instance throws InstanceNotRunningError, every time", async () => {
  const PID = pid("proc_submit_faulted_1");
  await publishBody(PID, cascadeLoopBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // Fault the instance via the automatic-cascade loop guard, same setup as
  // "a post-commit cascade loop throws AutomaticCascadeLoop..." above.
  let raised: unknown;
  try {
    await submitAndTransition(
      created.instanceId,
      "path_ag" as PathId,
      { field_marker: "first" } as unknown as Instance["data"],
      actor, dataSourceReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AutomaticCascadeLoop);
  const view = await getInstanceView(created.instanceId, actor, dataSourceReg);
  expect(view.status).toBe("faulted");

  // Retried against the now-faulted instance, twice: each attempt is told,
  // rather than silently discarding the retry and reporting success forever.
  for (let i = 0; i < 2; i++) {
    let retryRaised: unknown;
    try {
      await submitAndTransition(created.instanceId, "path_ag" as PathId, {} as Instance["data"], actor, dataSourceReg);
    } catch (e) {
      retryRaised = e;
    }
    expect(retryRaised).toBeInstanceOf(InstanceNotRunningError);
    expect((retryRaised as InstanceNotRunningError).status).toBe("faulted");
  }
});

test.skipIf(!DB)("an unresolvable processId/version surfaces a typed NotFoundError", async () => {
  // Pinned to the typed error, not just "some Error" — see design.md "Type
  // the not-found throws rather than special-casing them in the fallback":
  // this now asserts the engine's intent, not the absence of a mapping.
  let raised: unknown;
  try {
    await createProcessInstance(pid("proc_does_not_exist"), actor, dataSourceReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(NotFoundError);
  expect(raised).not.toBeInstanceOf(SubmissionValidationError);
});

test.skipIf(!DB)("a pin mismatch throws PinMismatch (via getInstanceView on a resolver mismatch)", async () => {
  const PID = pid("proc_pin_mismatch");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  // Corrupt the persisted pin so it no longer matches the published body's hash.
  await sql`UPDATE instances SET body = jsonb_set(body, '{definitionHash}', '"deadbeef"'::jsonb) WHERE instance_id = ${created.instanceId}`;

  // ADMIN_ROLE: a non-admin caller's load failure (a pin mismatch included)
  // now collapses into AuthorizationError — see the "getInstanceView —
  // relationship authorization" section above. The admin path still loads
  // directly, so it alone still surfaces the real PinMismatch this test pins.
  const adminActor: Actor = { id: "user_admin_pin", roles: [ADMIN_ROLE] };
  let raised: unknown;
  try {
    await getInstanceView(created.instanceId, adminActor, dataSourceReg);
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
  expenseReg.set("http.request", { handler: async () => ({ body: { status: "pending" } }) });
  expenseReg.set("notification.email", { handler: async () => ({}) });

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
  const byId = new Map(reviewView.fields.filter(isResolvedViewField).map((f) => [f.field.id as string, f]));
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
// Escalation pattern round trip against the real expense-approval example
// ============================================================

test.skipIf(!DB)("escalation: an unactioned review escalates to a manager after the SLA timer fires", async () => {
  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"));
  const authored = raw.definition as ProcessBody;
  const body = compileProcessBody(authored);
  const expenseReg = createRegistry();
  expenseReg.set("http.request", { handler: async () => ({ body: { status: "pending" } }) });
  expenseReg.set("notification.email", { handler: async () => ({}) });

  const PID = pid("proc_expense_approval_escalation");
  await publishBody(PID, authored, expenseReg, dataSourceReg);

  const amountField = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001" as FieldId;
  const reasonField = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002" as FieldId;
  const submitPath = "path_bbbb2222-0001-4a1c-8e2f-000000000001" as PathId;
  const escalationTimerId = "timer_dddd4444-0003-4a1c-8e2f-000000000003";
  const escalatedReviewStepId = "step_aaaa1111-0007-4a1c-8e2f-000000000007";
  const escalateActionId = "action_eeee5555-0003-4a1c-8e2f-000000000003";

  const demoActor: Actor = { id: "user_demo", roles: ["employee", "finance-approver"] };
  const managerActor: Actor = { id: "user_manager", roles: ["finance-manager"] };

  const created = await createProcessInstance(PID, demoActor, dataSourceReg);
  await claimStep(created.instanceId, demoActor);
  const afterCapture = await submitAndTransition(
    created.instanceId,
    submitPath,
    { [amountField]: 42, [reasonField]: "Taxi" } as unknown as Instance["data"],
    demoActor, dataSourceReg,
  );
  expect(afterCapture.currentStepId as string).toBe("step_aaaa1111-0002-4a1c-8e2f-000000000002"); // review

  // Simulate the SLA breach by firing the escalation timer directly instead
  // of waiting 14 days, the same pattern the engine's own timer tests use.
  const escalated = await fireTimer(afterCapture, escalationTimerId, body);
  expect(escalated.currentStepId as string).toBe(escalatedReviewStepId);
  expect(escalated.status).toBe("running");

  // The new finance-manager tier can see and claim the escalated instance.
  const escalatedView = await getInstanceView(escalated.instanceId, managerActor, dataSourceReg);
  expect(escalatedView.step.key).toBe("escalated_review");
  expect(escalatedView.availablePaths.map((p) => p.id)).toEqual([
    "path_bbbb2222-0008-4a1c-8e2f-000000000008" as PathId,
    "path_bbbb2222-0009-4a1c-8e2f-000000000009" as PathId,
  ]);
  await claimStep(escalated.instanceId, managerActor); // does not throw: eligible candidate

  // escalated_review's onEntry notify action was enqueued — never delivered
  // here, no outbox worker running, the same resting-state convention the
  // happy-path test above uses for "book"'s onEntry action.
  const outboxRows = (await sql`
    SELECT status FROM outbox WHERE instance_id = ${escalated.instanceId} AND action_id = ${escalateActionId}
  `) as { status: string }[];
  expect(outboxRows).toHaveLength(1);
  expect(outboxRows[0].status).toBe("pending");
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
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
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
  const item = page.items[0]! as InstanceSummary;
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
  const before = beforePage.items[0]! as InstanceSummary;
  expect(before.currentStepEnteredAt).toBeDefined();

  await new Promise((r) => setTimeout(r, 5));
  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);

  const afterPage = await listInstances({ processId: PID });
  const after = afterPage.items[0]! as InstanceSummary;
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

// Deterministic, not a timing race: forces both rows into one millisecond,
// at different microsecond offsets, via a raw UPDATE after creation. Bun's
// Postgres driver truncates a timestamptz to millisecond precision when
// converting it to a JS Date; building the pagination cursor from that
// truncated Date (rather than created_at::text) let a boundary row's true,
// later-within-the-millisecond value stop comparing "less than" its own
// rounded-down cursor, silently dropping it from the walk. See
// fix-instance-list-cursor-precision's design.md.
test.skipIf(!DB)("listInstances pages correctly when two instances share a millisecond", async () => {
  const PID = pid("proc_list_same_ms");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const older = await createProcessInstance(PID, actor, dataSourceReg);
  const newer = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET created_at = '2026-01-01 00:00:00.100001+00' WHERE instance_id = ${older.instanceId}`;
  await sql`UPDATE instances SET created_at = '2026-01-01 00:00:00.100999+00' WHERE instance_id = ${newer.instanceId}`;

  const page1 = await listInstances({ processId: PID }, { limit: 1 });
  expect(page1.items.map((it) => it.instanceId)).toEqual([newer.instanceId]);
  expect(page1.cursor).toBeDefined();

  const page2 = await listInstances({ processId: PID }, { limit: 1, cursor: page1.cursor });
  expect(page2.items.map((it) => it.instanceId)).toEqual([older.instanceId]);
});

test.skipIf(!DB)("listInstances with a malformed cursor raises RequestShapeError, not an uncaught SyntaxError or Postgres cast error", async () => {
  let raised: unknown;
  try {
    await listInstances({}, { cursor: "%%%" });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances with a well-formed but wrong-arity cursor raises RequestShapeError", async () => {
  const wrongArity = Buffer.from(JSON.stringify(["only-one"])).toString("base64url");
  let raised: unknown;
  try {
    await listInstances({}, { cursor: wrongArity });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances with a stale but well-formed cursor is a legitimate empty page, not an error", async () => {
  const PID = pid("proc_list_stale_cursor");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const stale = Buffer.from(JSON.stringify([new Date(0).toISOString(), "inst_00000000-0000-0000-0000-000000000000"])).toString("base64url");
  const page = await listInstances({ processId: PID }, { cursor: stale });
  expect(page.items).toEqual([]);
});

test.skipIf(!DB)("getInstanceRecord with a malformed cursor raises RequestShapeError", async () => {
  let raised: unknown;
  try {
    await getInstanceRecord("inst_does_not_exist" as InstanceId, recordAdmin, { cursor: "%%%" });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
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

// ------------------------------------------------------------
// listInstances: degrade-vs-omit for an unresolvable instance
// ------------------------------------------------------------

test.skipIf(!DB)("listInstances degrades an item with includeDegraded when its pinned version has no published body", async () => {
  const PID = pid("proc_list_degraded_missing_body");
  const v1 = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const orphan = await createProcessInstance(PID, actor, dataSourceReg);
  const ok = await createProcessInstance(PID, actor, dataSourceReg);
  // No version 2 was ever published for PID — simulates the out-of-band data
  // drift proposal.md describes, not a supported engine operation.
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(${v1.version + 1})) WHERE instance_id = ${orphan.instanceId}`;

  const page = await listInstances({ processId: PID, includeDegraded: true });
  expect(page.items).toHaveLength(2);
  const degraded = page.items.find((i) => i.instanceId === orphan.instanceId) as DegradedInstanceSummary;
  expect(degraded.degraded).toBe(true);
  expect(degraded.reason).toBe("missing-definition");
  expect(degraded.processId).toBe(PID);
  const okItem = page.items.find((i) => i.instanceId === ok.instanceId)!;
  expect((okItem as { processLabel?: unknown }).processLabel).toBeDefined();
});

test.skipIf(!DB)("listInstances degrades an item with includeDegraded when its currentStepId is absent from its pinned body", async () => {
  const PID = pid("proc_list_degraded_bad_step");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const bad = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET body = jsonb_set(body, '{currentStepId}', '"step_ghost"') WHERE instance_id = ${bad.instanceId}`;

  const page = await listInstances({ processId: PID, includeDegraded: true });
  const degraded = page.items.find((i) => i.instanceId === bad.instanceId) as DegradedInstanceSummary;
  expect(degraded.degraded).toBe(true);
  expect(degraded.reason).toBe("current-step-not-in-body");
});

test.skipIf(!DB)("listInstances omits, rather than degrades, an unresolvable instance when includeDegraded is unset", async () => {
  const PID = pid("proc_list_omit_missing_body");
  const v1 = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const orphan = await createProcessInstance(PID, actor, dataSourceReg);
  const ok = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(${v1.version + 1})) WHERE instance_id = ${orphan.instanceId}`;

  const page = await listInstances({ processId: PID });
  expect(page.items.map((i) => i.instanceId)).toEqual([ok.instanceId]);
  expect(page.items.some((i) => "degraded" in i)).toBe(false);
});

test.skipIf(!DB)("listInstances still fails the whole request on an exception unrelated to the two known causes", async () => {
  const PID = pid("proc_list_unrelated_exception");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const inst = await createProcessInstance(PID, actor, dataSourceReg); // resolves and caches v1 — untouched
  // A second, distinct version, never resolved by anything above, so its
  // cache entry is empty. Corrupting it (not v1) rules out a cache hit
  // masking the corruption — `resolveBody` must actually read this row.
  const v2 = await publishBody(PID, { ...twoPathsBody(), label: { en: "V2" } }, reg, dataSourceReg);
  await sql`UPDATE definitions SET body = body - 'workflow' WHERE process_id = ${PID} AND version = ${v2.version}`;
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(${v2.version})) WHERE instance_id = ${inst.instanceId}`;

  let raised: unknown;
  try {
    await listInstances({ processId: PID, includeDegraded: true });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeDefined();
  expect(raised).not.toBeInstanceOf(NotFoundError);
});

test.skipIf(!DB)("a degraded summary carries identity fields but no label fields", async () => {
  const PID = pid("proc_list_degraded_shape");
  const v1 = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const orphan = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(${v1.version + 1})) WHERE instance_id = ${orphan.instanceId}`;

  const page = await listInstances({ processId: PID, includeDegraded: true });
  const degraded = page.items.find((i) => i.instanceId === orphan.instanceId) as DegradedInstanceSummary;
  expect(degraded.instanceId).toBe(orphan.instanceId);
  expect(degraded.processId).toBe(PID);
  expect(degraded.version).toBe(v1.version + 1);
  expect(degraded.status).toBe("running");
  expect(degraded.currentStepId).toBe("step_a" as StepId);
  expect(degraded.transitionSeq).toBeDefined();
  expect(degraded.createdAt).toBeDefined();
  expect((degraded as unknown as { processLabel?: unknown }).processLabel).toBeUndefined();
  expect((degraded as unknown as { stepLabel?: unknown }).stepLabel).toBeUndefined();
  expect((degraded as unknown as { processBaseLocale?: unknown }).processBaseLocale).toBeUndefined();
});

// ============================================================
// buildInstanceWhere: version / excludeInstanceId / createdAfter+Before / dataWhere
// (instance-query-core)
// ============================================================

/**
 * Writes one `data` field directly via SQL. `dataWhere`'s semantics read the
 * stored jsonb value, not the process's own field catalog (design.md "A
 * comparison names a scalar-valued field": the check reads values, not
 * declared types), so a bare `twoPathsBody` (fields: []) instance is enough
 * — no field-catalog/view fixture needed, and this can write shapes
 * (an array, an object) no real submission would ever produce.
 */
async function setInstanceData(instanceId: string, fieldId: string, value: unknown): Promise<void> {
  await sql`
    UPDATE instances
    SET body = jsonb_set(body, ${sql.array(["data", fieldId], "TEXT")}, ${JSON.stringify(value)}::text::jsonb)
    WHERE instance_id = ${instanceId}
  `;
}

test.skipIf(!DB)("listInstances' version filter excludes another version of the same process, and needs a processId beside it", async () => {
  const PID = pid("proc_list_version");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const onV1 = await createProcessInstance(PID, actor, dataSourceReg);
  await publishBody(PID, { ...twoPathsBody(), label: { en: "V2" } }, reg, dataSourceReg);
  const onV2 = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ processId: PID, version: 2 });
  expect(page.items.map((i) => i.instanceId)).toEqual([onV2.instanceId]);
  expect(page.items.map((i) => i.instanceId)).not.toContain(onV1.instanceId);

  let raised: unknown;
  try {
    await listInstances({ version: 2 });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

// rebuild-instance-expression-indexes: the filter compares against the
// generated `version integer` column, not `body->>'version'` as text. Two
// classes of value cannot name a stored row, and they fail differently.
//
// A value past int4 raises. `buildInstanceWhere` emits a leading `::int` cast
// on the filter's own null test, and that cast is where Postgres 16.15 raises
// "integer out of range" for 2147483648 and -2147483649. An unmapped
// PostgresError maps to a 500 with no message (src/http/errors.ts), so this
// is the class that regressed a 200 into a 500.
//
// A fractional value raises nothing at all: `1.5::int` rounds to 2, and
// `version = 1.5` promotes to numeric and matches nothing. Rejecting it buys
// a 400 in place of a silently empty page.
//
// So the guard is not asserting what the datastore tolerates — it makes the
// read answer for its own input either way. The bounds below are the edges
// themselves, not round numbers near them.
test.skipIf(!DB)("listInstances rejects an unusable version as a request-shape error, never as an empty page or a 500", async () => {
  const PID = pid("proc_list_version_frac");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  for (const version of [1.5, 2147483648, -2147483649, 3000000000]) {
    let raised: unknown;
    try {
      await listInstances({ processId: PID, version });
    } catch (e) {
      raised = e;
    }
    expect({ version, type: (raised as Error | undefined)?.constructor.name }).toEqual({
      version,
      type: "RequestShapeError",
    });
  }

  // The integer path still works, the guard carries no sign check (a draft
  // snapshot's version is negative — createDraftSnapshot), and both int4 edges
  // pass the guard and reach the datastore without raising.
  const page = await listInstances({ processId: PID, version: 1 });
  expect(page.items).toHaveLength(1);
  for (const version of [-1, 2147483647, -2147483648]) {
    const none = await listInstances({ processId: PID, version });
    expect({ version, items: none.items }).toEqual({ version, items: [] });
  }
});

test.skipIf(!DB)("listInstances' excludeInstanceId omits the named instance, keeps every other matching instance", async () => {
  const PID = pid("proc_list_exclude");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const a = await createProcessInstance(PID, actor, dataSourceReg);
  const b = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ processId: PID, excludeInstanceId: a.instanceId });
  expect(page.items.map((i) => i.instanceId)).toEqual([b.instanceId]);
});

test.skipIf(!DB)("listInstances' createdAfter/createdBefore bound the result by created_at, inclusive on both ends", async () => {
  const PID = pid("proc_list_created_window");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const beforeInst = await createProcessInstance(PID, actor, dataSourceReg);
  const inside = await createProcessInstance(PID, actor, dataSourceReg);
  const afterInst = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET created_at = '2026-01-01 00:00:00+00' WHERE instance_id = ${beforeInst.instanceId}`;
  await sql`UPDATE instances SET created_at = '2026-01-02 00:00:00+00' WHERE instance_id = ${inside.instanceId}`;
  await sql`UPDATE instances SET created_at = '2026-01-03 00:00:00+00' WHERE instance_id = ${afterInst.instanceId}`;

  const page = await listInstances({
    processId: PID,
    createdAfter: "2026-01-01T12:00:00Z",
    createdBefore: "2026-01-02T12:00:00Z",
  });
  expect(page.items.map((i) => i.instanceId)).toEqual([inside.instanceId]);
});

test.skipIf(!DB)("listInstances' creation bound includes the instant it names, read at the column's full precision", async () => {
  const PID = pid("proc_list_created_boundary");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const [{ created_at_text: stamp }] = (await sql`
    SELECT created_at::text AS created_at_text FROM instances WHERE instance_id = ${created.instanceId}
  `) as { created_at_text: string }[];

  const afterPage = await listInstances({ processId: PID, createdAfter: stamp });
  expect(afterPage.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
  const beforePage = await listInstances({ processId: PID, createdBefore: stamp });
  expect(beforePage.items.map((i) => i.instanceId)).toEqual([created.instanceId]);
});

test.skipIf(!DB)("a createdBefore built from a summary's millisecond-truncated createdAt omits a row whose created_at carries sub-millisecond digits", async () => {
  const PID = pid("proc_list_created_submillisecond");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET created_at = '2026-01-01 00:00:00.100999+00' WHERE instance_id = ${created.instanceId}`;

  const page = await listInstances({ processId: PID });
  const summaryCreatedAt = (page.items[0] as InstanceSummary).createdAt;
  expect(summaryCreatedAt).toBe("2026-01-01T00:00:00.100Z");

  const beforePage = await listInstances({ processId: PID, createdBefore: summaryCreatedAt });
  expect(beforePage.items).toEqual([]);
});

// ------------------------------------------------------------
// dataWhere
// ------------------------------------------------------------

test.skipIf(!DB)("listInstances' dataWhere needs a processId beside it, and runs no comparison query without one", async () => {
  let raised: unknown;
  try {
    await listInstances({ dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value: 1 }] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances' dataWhere rejects a non-scalar right side (array or object), and runs no query", async () => {
  const PID = pid("proc_list_data_nonscalar");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  for (const value of [["a", "b"], { x: 1 }]) {
    let raised: unknown;
    try {
      await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value }] });
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(RequestShapeError);
  }
});

test.skipIf(!DB)("listInstances' dataWhere membership rejects an empty list and a list holding a non-scalar", async () => {
  const PID = pid("proc_list_data_membership_invalid");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);

  let raisedEmpty: unknown;
  try {
    await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "in", value: [] }] });
  } catch (e) {
    raisedEmpty = e;
  }
  expect(raisedEmpty).toBeInstanceOf(RequestShapeError);

  let raisedArrayMember: unknown;
  try {
    await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "in", value: [["nested"]] }] });
  } catch (e) {
    raisedArrayMember = e;
  }
  expect(raisedArrayMember).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances' dataWhere equality matches string, number, boolean and null, preserving each value's JSON type", async () => {
  const PID = pid("proc_list_data_eq");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const strInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(strInst.instanceId, "field_x", "1");
  const numInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(numInst.instanceId, "field_x", 1);
  const boolInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(boolInst.instanceId, "field_x", true);
  const nullInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(nullInst.instanceId, "field_x", null);

  const eq = async (value: string | number | boolean | null) => {
    const page = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value }] });
    return page.items.map((i) => i.instanceId);
  };
  expect(await eq("1")).toEqual([strInst.instanceId]); // not numInst — "1" !== 1
  expect(await eq(1)).toEqual([numInst.instanceId]); // not strInst — 1 !== "1"
  expect(await eq(true)).toEqual([boolInst.instanceId]);
  expect(await eq(null)).toEqual([nullInst.instanceId]);
});

test.skipIf(!DB)("listInstances' dataWhere binds the field id as a parameter, safe for one holding SQL metacharacters", async () => {
  const PID = pid("proc_list_data_fieldid_meta");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const weirdFieldId = "field_o'br\"ien";
  const matching = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(matching.instanceId, weirdFieldId, "yes");
  const other = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await listInstances({ processId: PID, dataWhere: [{ fieldId: weirdFieldId as FieldId, operator: "eq", value: "yes" }] });
  expect(page.items.map((i) => i.instanceId)).toEqual([matching.instanceId]);
  expect(page.items.map((i) => i.instanceId)).not.toContain(other.instanceId);
});

test.skipIf(!DB)("listInstances' dataWhere inequality omits instances holding the value, returns an instance holding another value", async () => {
  const PID = pid("proc_list_data_ne");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const excluded = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(excluded.instanceId, "field_x", "match");
  const kept = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(kept.instanceId, "field_x", "other");

  const page = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "ne", value: "match" }] });
  expect(page.items.map((i) => i.instanceId)).toEqual([kept.instanceId]);
});

test.skipIf(!DB)("listInstances' dataWhere membership selects any listed value", async () => {
  const PID = pid("proc_list_data_in");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const a = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(a.instanceId, "field_x", "red");
  const b = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(b.instanceId, "field_x", "blue");
  const c = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(c.instanceId, "field_x", "green");

  const page = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "in", value: ["red", "blue"] }] });
  expect(new Set(page.items.map((i) => i.instanceId))).toEqual(new Set([a.instanceId, b.instanceId]));
  expect(page.items.map((i) => i.instanceId)).not.toContain(c.instanceId);
});

test.skipIf(!DB)("listInstances' dataWhere folds correctly at zero, one and three comparisons, binding values in order", async () => {
  const PID = pid("proc_list_data_fold");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const target = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(target.instanceId, "field_a", 1);
  await setInstanceData(target.instanceId, "field_b", 2);
  await setInstanceData(target.instanceId, "field_c", 3);
  const other = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(other.instanceId, "field_a", 1);
  await setInstanceData(other.instanceId, "field_b", 2);
  await setInstanceData(other.instanceId, "field_c", 99);

  const zero = await listInstances({ processId: PID });
  expect(new Set(zero.items.map((i) => i.instanceId))).toEqual(new Set([target.instanceId, other.instanceId]));

  const one = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_c" as FieldId, operator: "eq", value: 3 }] });
  expect(one.items.map((i) => i.instanceId)).toEqual([target.instanceId]);

  const three = await listInstances({
    processId: PID,
    dataWhere: [
      { fieldId: "field_a" as FieldId, operator: "eq", value: 1 },
      { fieldId: "field_b" as FieldId, operator: "eq", value: 2 },
      { fieldId: "field_c" as FieldId, operator: "eq", value: 3 },
    ],
  });
  expect(three.items.map((i) => i.instanceId)).toEqual([target.instanceId]);
});

test.skipIf(!DB)("listInstances' dataWhere fails as a caller error when a selected instance holds an array under the compared field", async () => {
  const PID = pid("proc_list_data_probe_array");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const arrayInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(arrayInst.instanceId, "field_tags", ["a", "b"]);

  let raised: unknown;
  try {
    await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_tags" as FieldId, operator: "eq", value: "a" }] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances' dataWhere fails as a caller error when a selected instance holds an object under the compared field", async () => {
  const PID = pid("proc_list_data_probe_object");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const objInst = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(objInst.instanceId, "field_group", { a: 1 });

  let raised: unknown;
  try {
    await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_group" as FieldId, operator: "eq", value: "a" }] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("listInstances' dataWhere: an absent field matches neither equality nor inequality, and does not throw", async () => {
  const PID = pid("proc_list_data_absent");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg); // never writes field_x

  const eqPage = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value: "v" }] });
  expect(eqPage.items).toEqual([]);

  const nePage = await listInstances({ processId: PID, dataWhere: [{ fieldId: "field_x" as FieldId, operator: "ne", value: "v" }] });
  expect(nePage.items).toEqual([]);
});

test.skipIf(!DB)("listInstances' dataWhere comparisons join conjunctively with each other and with currentStepId", async () => {
  const PID = pid("proc_list_data_conjunctive");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const onA = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(onA.instanceId, "field_x", "v");
  const movedButMatching = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(movedButMatching.instanceId, "field_x", "v");
  await submitAndTransition(movedButMatching.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);
  const onAWrongValue = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(onAWrongValue.instanceId, "field_x", "other");

  const page = await listInstances({
    processId: PID,
    currentStepId: "step_a" as StepId,
    dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value: "v" }],
  });
  expect(page.items.map((i) => i.instanceId)).toEqual([onA.instanceId]);
});

// ============================================================
// queryInstances
// ============================================================

test.skipIf(!DB)("queryInstances returns instanceId, version, data and redactedAt, and nothing that needs label resolution", async () => {
  const PID = pid("proc_query_shape");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(created.instanceId, "field_x", "v");

  const page = await queryInstances({ processId: PID });
  expect(page.items).toHaveLength(1);
  const item = page.items[0]!;
  expect(item.instanceId).toBe(created.instanceId);
  expect(item.version).toBe(1);
  expect(item.data).toEqual({ field_x: "v" } as unknown as Instance["data"]);
  expect(item.redactedAt).toBeUndefined();
  expect(Object.keys(item)).not.toContain("processLabel");
  expect(Object.keys(item)).not.toContain("stepLabel");
  expect(Object.keys(item)).not.toContain("status");
  expect(Object.keys(item)).not.toContain("transitionSeq");
  expect("cursor" in page).toBe(false);
});

test.skipIf(!DB)("queryInstances rejects a version with no processId", async () => {
  let raised: unknown;
  try {
    await queryInstances({ version: 2 });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("queryInstances rejects a dataWhere with no processId, running no comparison query", async () => {
  let raised: unknown;
  try {
    await queryInstances({ dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq", value: 1 }] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("queryInstances rejects assignedTo, assignedToRoles, scope and includeDegraded, and ignores an unrecognized key", async () => {
  const PID = pid("proc_query_denylist");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const denied: Record<string, unknown>[] = [
    { processId: PID, assignedTo: "user_1" },
    { processId: PID, assignedToRoles: ["approver"] },
    { processId: PID, scope: "mine" }, // no Runtime API Layer filter type declares `scope` at all
    { processId: PID, includeDegraded: true },
  ];
  for (const bad of denied) {
    let raised: unknown;
    try {
      await queryInstances(bad as unknown as InstanceQueryFilter);
    } catch (e) {
      raised = e;
    }
    expect(raised).toBeInstanceOf(RequestShapeError);
  }

  const page = await queryInstances({ processId: PID, somethingElse: true } as unknown as InstanceQueryFilter);
  expect(page.items).toHaveLength(1);
});

test.skipIf(!DB)("queryInstances' redactedAt distinguishes a redacted instance from one that never wrote the field", async () => {
  const PID = pid("proc_query_redacted");
  await publishBody(PID, cascadeBody(), reg, dataSourceReg);
  const toRedact = await createProcessInstance(PID, actor, dataSourceReg);
  const completed = await submitAndTransition(
    toRedact.instanceId, "path_ab" as PathId, { field_decision: "approve" } as unknown as Instance["data"], actor, dataSourceReg,
  );
  expect(completed.status).toBe("completed");
  await redactInstance(completed.instanceId, sql);
  const untouched = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await queryInstances({ processId: PID });
  const redactedItem = page.items.find((i) => i.instanceId === completed.instanceId)!;
  expect(redactedItem.redactedAt).toBeDefined();
  const untouchedItem = page.items.find((i) => i.instanceId === untouched.instanceId)!;
  expect(untouchedItem.redactedAt).toBeUndefined();
});

test.skipIf(!DB)("queryInstances still returns an instance whose pinned version has no resolvable published body", async () => {
  const PID = pid("proc_query_unresolvable");
  const v1 = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const orphan = await createProcessInstance(PID, actor, dataSourceReg);
  await sql`UPDATE instances SET body = jsonb_set(body, '{version}', to_jsonb(${v1.version + 1})) WHERE instance_id = ${orphan.instanceId}`;

  const page = await queryInstances({ processId: PID });
  expect(page.items.map((i) => i.instanceId)).toEqual([orphan.instanceId]);
  expect(page.items[0]!.version).toBe(v1.version + 1);
});

test.skipIf(!DB)("queryInstances bounds by a maximum count and reports truncation below, at and above the bound", async () => {
  const PID = pid("proc_query_bound");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  for (let i = 0; i < 3; i++) await createProcessInstance(PID, actor, dataSourceReg);

  const below = await queryInstances({ processId: PID }, { limit: 10 });
  expect(below.items).toHaveLength(3);
  expect(below.truncated).toBe(false);

  const exact = await queryInstances({ processId: PID }, { limit: 3 });
  expect(exact.items).toHaveLength(3);
  expect(exact.truncated).toBe(false);

  const above = await queryInstances({ processId: PID }, { limit: 2 });
  expect(above.items).toHaveLength(2);
  expect(above.truncated).toBe(true);
});

test.skipIf(!DB)("queryInstances caps a limit above the enforced maximum", async () => {
  const PID = pid("proc_query_cap");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg);

  const page = await queryInstances({ processId: PID }, { limit: 100_000 });
  expect(page.items.length).toBeLessThanOrEqual(200);
});

test.skipIf(!DB)("queryInstances orders newest-first, and a truncated result is the same subset on repeat calls", async () => {
  const PID = pid("proc_query_order");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created: InstanceId[] = [];
  for (let i = 0; i < 5; i++) created.push((await createProcessInstance(PID, actor, dataSourceReg)).instanceId);

  const page1 = await queryInstances({ processId: PID }, { limit: 2 });
  const page2 = await queryInstances({ processId: PID }, { limit: 2 });
  expect(page1.items.map((i) => i.instanceId)).toEqual(page2.items.map((i) => i.instanceId));
  expect(page1.items[0]!.instanceId).toBe(created[created.length - 1]);
});

test.skipIf(!DB)("listInstances and queryInstances select the same instances for one processId, currentStepId and dataWhere comparison together", async () => {
  const PID = pid("proc_query_shared_predicate");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const match = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(match.instanceId, "field_x", "v");
  const wrongStep = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(wrongStep.instanceId, "field_x", "v");
  await submitAndTransition(wrongStep.instanceId, "path_x" as PathId, {} as Instance["data"], actor, dataSourceReg);
  const wrongValue = await createProcessInstance(PID, actor, dataSourceReg);
  await setInstanceData(wrongValue.instanceId, "field_x", "other");

  const filter = {
    processId: PID,
    currentStepId: "step_a" as StepId,
    dataWhere: [{ fieldId: "field_x" as FieldId, operator: "eq" as const, value: "v" }],
  };
  const listPage = await listInstances(filter);
  const queryPage = await queryInstances(filter);
  expect(new Set(listPage.items.map((i) => i.instanceId))).toEqual(new Set([match.instanceId]));
  expect(new Set(queryPage.items.map((i) => i.instanceId))).toEqual(new Set([match.instanceId]));
});

test.skipIf(!DB)("queryInstances rejects an empty currentStepId array", async () => {
  let raised: unknown;
  try {
    await queryInstances({ currentStepId: [] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("queryInstances' currentStepId list selects instances on any of the named steps, disjunctively, joined conjunctively with status", async () => {
  const PID = pid("proc_query_step_list");
  const published = await publishBody(PID, twoStepOverrideBody(), reg, dataSourceReg);
  const onA = await createProcessInstance(PID, actor, dataSourceReg);
  const onB = await createProcessInstance(PID, actor, dataSourceReg);
  await submitAndTransition(onB.instanceId, "path_ab" as PathId, { field_amount: 100 } as unknown as Instance["data"], actor, dataSourceReg);
  const cancelledOnA = await createProcessInstance(PID, actor, dataSourceReg);
  await cancelInstance(cancelledOnA, published.definition, actor);
  const onStepC = await createProcessInstance(PID, actor, dataSourceReg);
  await submitAndTransition(onStepC.instanceId, "path_ab" as PathId, { field_amount: 100 } as unknown as Instance["data"], actor, dataSourceReg);
  await submitAndTransition(onStepC.instanceId, "path_bc" as PathId, {} as unknown as Instance["data"], actor, dataSourceReg);

  const page = await queryInstances({ processId: PID, currentStepId: ["step_a" as StepId, "step_b" as StepId], status: ["running"] });
  expect(new Set(page.items.map((i) => i.instanceId))).toEqual(new Set([onA.instanceId, onB.instanceId]));
});

test.skipIf(!DB)("queryInstances' instanceIds selects the named instances, ignoring an unknown id, and rejects an empty list", async () => {
  const PID = pid("proc_query_instance_ids");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const a = await createProcessInstance(PID, actor, dataSourceReg);
  const b = await createProcessInstance(PID, actor, dataSourceReg);
  await createProcessInstance(PID, actor, dataSourceReg); // not named, must not appear

  const page = await queryInstances({ instanceIds: [a.instanceId, b.instanceId, "inst_00000000-0000-0000-0000-000000000000" as InstanceId] });
  expect(new Set(page.items.map((i) => i.instanceId))).toEqual(new Set([a.instanceId, b.instanceId]));

  let raised: unknown;
  try {
    await queryInstances({ instanceIds: [] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(RequestShapeError);
});

test.skipIf(!DB)("queryInstances' instanceIds still joins conjunctively with status, excluding a named-but-cancelled instance", async () => {
  const PID = pid("proc_query_instance_ids_status");
  const published = await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const cancelled = await createProcessInstance(PID, actor, dataSourceReg);
  await cancelInstance(cancelled, published.definition, actor);
  const running = await createProcessInstance(PID, actor, dataSourceReg);

  const page = await queryInstances({ instanceIds: [cancelled.instanceId, running.instanceId], status: ["running"] });
  expect(page.items.map((i) => i.instanceId)).toEqual([running.instanceId]);
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

  const page = await getInstanceRecord(created.instanceId, recordAdmin);
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

  const page = await getInstanceRecord(created.instanceId, recordAdmin);
  const events = page.items.filter((i): i is Extract<InstanceRecordElement, { kind: "event" }> => i.kind === "event");
  expect(events.length).toBe(2);
  expect((events[0]!.event.payload as { reason: string }).reason).toBe("pending-actions");
  expect((events[1]!.event.payload as { reason: string }).reason).toBe("step-unmappable");
});

test.skipIf(!DB)("getInstanceRecord of an unknown instance is an empty sequence, not an error", async () => {
  const page = await getInstanceRecord("inst_does_not_exist" as InstanceId, recordAdmin);
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

  const full = await getInstanceRecord(created.instanceId, recordAdmin, { limit: 100 });
  expect(full.items.length).toBe(3);

  const page1 = await getInstanceRecord(created.instanceId, recordAdmin, { limit: 2 });
  expect(page1.items.length).toBe(2);
  expect(page1.cursor).toBeDefined();
  const page2 = await getInstanceRecord(created.instanceId, recordAdmin, { limit: 2, cursor: page1.cursor });
  expect(page2.items.length).toBe(1);
  expect(page2.cursor).toBeUndefined();
  const combined = [...page1.items, ...page2.items];
  const fullKeys = full.items.map((it) => (it.kind === "transition" ? it.entry.id : it.event.id));
  const combinedKeys = combined.map((it) => (it.kind === "transition" ? it.entry.id : it.event.id));
  expect(combinedKeys).toEqual(fullKeys);
});

test.skipIf(!DB)("getInstanceRecord succeeds for a developer who started the instance, without ADMIN_ROLE", async () => {
  const PID = pid("proc_record_developer_starter");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const developer: Actor = { id: "user_dev_record", roles: [DEVELOPER_ROLE] };
  const created = await createProcessInstance(PID, developer, dataSourceReg);
  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], developer, dataSourceReg);

  const page = await getInstanceRecord(created.instanceId, developer);
  expect(page.items.length).toBeGreaterThan(0);
});

test.skipIf(!DB)("getInstanceRecord is refused for a developer who did not start the instance", async () => {
  const PID = pid("proc_record_developer_not_starter");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const developer: Actor = { id: "user_dev_not_starter", roles: [DEVELOPER_ROLE] };

  let raised: unknown;
  try {
    await getInstanceRecord(created.instanceId, developer);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("getInstanceRecord succeeds for an author who started the instance, without ADMIN_ROLE", async () => {
  // The studio Player renders this record beside the form, and `system:author`
  // reaches the Player. The starter condition is what still bounds the read.
  const PID = pid("proc_record_author_starter");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const author: Actor = { id: "user_author_record", roles: [AUTHOR_ROLE] };
  const created = await createProcessInstance(PID, author, dataSourceReg);
  await submitAndTransition(created.instanceId, "path_x" as PathId, {} as Instance["data"], author, dataSourceReg);

  const page = await getInstanceRecord(created.instanceId, author);
  expect(page.items.length).toBeGreaterThan(0);
});

test.skipIf(!DB)("getInstanceRecord is refused for an author who did not start the instance", async () => {
  const PID = pid("proc_record_author_not_starter");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);
  const author: Actor = { id: "user_author_not_starter", roles: [AUTHOR_ROLE] };

  let raised: unknown;
  try {
    await getInstanceRecord(created.instanceId, author);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("getInstanceRecord is refused for a plain participant, even for an instance they started", async () => {
  const PID = pid("proc_record_plain_starter");
  await publishBody(PID, twoPathsBody(), reg, dataSourceReg);
  const created = await createProcessInstance(PID, actor, dataSourceReg);

  let raised: unknown;
  try {
    await getInstanceRecord(created.instanceId, actor);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

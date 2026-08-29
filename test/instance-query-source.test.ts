/**
 * The `"instance.query"` data source handler: reads another process's
 * instances through `queryInstances`, substituting `valueFromField`
 * comparisons from the reading instance before it calls the read. DB-backed;
 * skips when DATABASE_URL is unset. Calls `handler.resolve(ctx)` directly,
 * mirroring `data-lists.test.ts`'s style — no full submitAndTransition
 * round-trip is needed to exercise the handler itself.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema, createInstance } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { INSTANCE_QUERY_DATA_SOURCE_TYPE, createInstanceQueryDataSourceHandlerDef } from "../src/engine/instance-query-source.js";
import { createProcessInstance, submitAndTransition } from "../src/runtime/api.js";
import { redactInstance } from "../src/engine/retention.js";
import type { ProcessBody, ProcessId, PathId, InstanceId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const reg = createRegistry();
const emptyDsReg = createDataSourceRegistry();
const handler = () => createDefaultDataSourceRegistry().get(INSTANCE_QUERY_DATA_SOURCE_TYPE)!;
const pid = (n: string) => n as ProcessId;

/**
 * step_shelf: field_t_label (string), field_t_dept (string), field_t_price
 * (number), field_t_tags (multiselect — a non-scalar source for the
 * label/attributes fallback tests) --(path_issue, manual, guardless)-->
 * step_issued (terminal).
 */
const targetBody = (): ProcessBody =>
  ({
    key: "target_body",
    label: { en: "Target" },
    baseLocale: "en",
    fields: [
      { id: "field_t_label", key: "label", label: { en: "Label" }, type: "string" },
      { id: "field_t_dept", key: "dept", label: { en: "Dept" }, type: "string" },
      { id: "field_t_price", key: "price", label: { en: "Price" }, type: "number" },
      {
        id: "field_t_tags",
        key: "tags",
        label: { en: "Tags" },
        type: "multiselect",
        options: [{ value: "x", label: { en: "X" } }, { value: "y", label: { en: "Y" } }],
      },
    ],
    workflow: {
      initialStep: "step_shelf",
      steps: [
        {
          id: "step_shelf",
          key: "shelf",
          label: { en: "Shelf" },
          type: "task",
          view: { fields: [{ ref: "field_t_label" }, { ref: "field_t_dept" }, { ref: "field_t_price" }, { ref: "field_t_tags" }] },
          paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual" }],
        },
        { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** A reading-instance context stub. Never a real DB row — the handler compares its id/processId/data by value, and never looks it up. */
const stubReader = (overrides: { id?: string; processId?: string; data?: Record<string, unknown> } = {}) => ({
  id: (overrides.id ?? "inst_reader_stub") as InstanceId,
  processId: (overrides.processId ?? "proc_reader_stub") as ProcessId,
  data: (overrides.data ?? {}) as Instance["data"],
  baseLocale: "en" as const,
});

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

test.skipIf(!DB)("an instance on a configured step becomes an option, one on another step stays out", async () => {
  const PID = pid("proc_iq_step_filter");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const onShelf = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Widget" } as unknown as Instance["data"] });
  const issued = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Other" } as unknown as Instance["data"] });
  await submitAndTransition(issued.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);

  const options = await handler().resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([onShelf.instanceId]);
});

// draft-test-instances (5.7): buildInstanceWhere's default kind exclusion
// (queryInstances's InstanceQueryFilter carries no includeTestInstances
// opt-in) already covers this — no code change here beyond that default.
test.skipIf(!DB)("a test-kind instance never resolves as an option, even though its status and step would otherwise match", async () => {
  const PID = pid("proc_iq_test_kind_excluded");
  const v = await publishBody(PID, targetBody(), reg, emptyDsReg);
  const ordinary = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Widget" } as unknown as Instance["data"] });
  const testInst = await createInstance(v.definition, {
    processId: PID,
    version: v.version,
    kind: "test",
    data: { field_t_label: "TestWidget" } as unknown as Instance["data"],
  });

  const options = await handler().resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([ordinary.instanceId]);
  expect(options.map((o) => o.value)).not.toContain(testInst.instanceId);
});

test.skipIf(!DB)("a configuration with no statuses selects running instances, omitting a completed one, with no stepIds filter needed", async () => {
  const PID = pid("proc_iq_status_default");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const running = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Running" } as unknown as Instance["data"] });
  const completing = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Completing" } as unknown as Instance["data"] });
  await submitAndTransition(completing.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);

  // statuses and stepIds both omitted — "no filter", not a caller-error.
  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([running.instanceId]);
});

test.skipIf(!DB)("a literal where value selects matching instances", async () => {
  const PID = pid("proc_iq_where_literal");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const berlin = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "A", field_t_dept: "berlin" } as unknown as Instance["data"] });
  await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "B", field_t_dept: "munich" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", where: [{ fieldId: "field_t_dept", operator: "eq", value: "berlin" }] },
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([berlin.instanceId]);
});

test.skipIf(!DB)("an 'in' where value selects instances matching any listed value", async () => {
  const PID = pid("proc_iq_where_in");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const berlin = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "A", field_t_dept: "berlin" } as unknown as Instance["data"] });
  const munich = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "B", field_t_dept: "munich" } as unknown as Instance["data"] });
  await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "C", field_t_dept: "paris" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", where: [{ fieldId: "field_t_dept", operator: "in", value: ["berlin", "munich"] }] },
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value).sort()).toEqual([berlin.instanceId, munich.instanceId].sort());
});

test.skipIf(!DB)("a valueFromField comparison substitutes the reading instance's held value", async () => {
  const PID = pid("proc_iq_where_from_field");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const berlin = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "A", field_t_dept: "berlin" } as unknown as Instance["data"] });
  await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "B", field_t_dept: "munich" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", where: [{ fieldId: "field_t_dept", operator: "eq", valueFromField: "field_r_city" }] },
    instance: stubReader({ data: { field_r_city: "berlin" } }),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([berlin.instanceId]);
});

test.skipIf(!DB)("an unwritten valueFromField source resolves to an empty list without raising", async () => {
  const PID = pid("proc_iq_where_unwritten");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "A", field_t_dept: "berlin" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", where: [{ fieldId: "field_t_dept", operator: "eq", valueFromField: "field_r_city" }] },
    instance: stubReader(), // no field_r_city in data
    db: sql,
  });
  expect(options).toEqual([]);
});

test.skipIf(!DB)("a query over the reading instance's own process excludes it, and a sibling stays offered", async () => {
  const PID = pid("proc_iq_self_exclude");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const reader = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Reader" } as unknown as Instance["data"] });
  const sibling = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Sibling" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    instance: stubReader({ id: reader.instanceId, processId: PID }),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([sibling.instanceId]);
});

test.skipIf(!DB)("a query over another process excludes nothing", async () => {
  const PID = pid("proc_iq_cross_process");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const target = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Target" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    instance: stubReader({ processId: "proc_other" }),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([target.instanceId]);
});

test.skipIf(!DB)("an option carries the id as value and the label field wrapped as LocalizedText under the reading process's base locale", async () => {
  const PID = pid("proc_iq_label");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const item = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "MBP-0041" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: item.instanceId, label: { en: "MBP-0041" } }]);
});

test.skipIf(!DB)("a configured attribute reaches the option, and an unfilled one produces no entry", async () => {
  const PID = pid("proc_iq_attributes");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const filled = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Widget", field_t_price: 12.5 } as unknown as Instance["data"] });
  const unfilled = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Gadget" } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", attributes: { price: "field_t_price" } },
    instance: stubReader(),
    db: sql,
  });
  const filledOpt = options.find((o) => o.value === filled.instanceId)!;
  const unfilledOpt = options.find((o) => o.value === unfilled.instanceId)!;
  expect(filledOpt.attributes).toEqual({ price: 12.5 });
  expect(unfilledOpt.attributes).toBeUndefined();
});

test.skipIf(!DB)("a non-scalar attribute value produces no entry, and resolution raises nothing", async () => {
  const PID = pid("proc_iq_attr_nonscalar");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const item = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Widget", field_t_tags: ["x", "y"] } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", attributes: { tags: "field_t_tags" } },
    instance: stubReader(),
    db: sql,
  });
  const opt = options.find((o) => o.value === item.instanceId)!;
  expect(opt.attributes).toBeUndefined();
});

test.skipIf(!DB)("an unset label field falls back to the instance id", async () => {
  const PID = pid("proc_iq_label_unset");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const item = await createProcessInstance(PID, actor, emptyDsReg);

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: item.instanceId, label: { en: item.instanceId } }]);
});

test.skipIf(!DB)("a non-scalar label field falls back to the instance id", async () => {
  const PID = pid("proc_iq_label_nonscalar");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const item = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_tags: ["x"] } as unknown as Instance["data"] });

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_tags" },
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: item.instanceId, label: { en: item.instanceId } }]);
});

test.skipIf(!DB)("a held instance off the filtered step still resolves, with its label", async () => {
  const PID = pid("proc_iq_held_offstep");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const issued = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Issued Device" } as unknown as Instance["data"] });
  await submitAndTransition(issued.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);

  const options = await handler().resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label" },
    heldValues: [issued.instanceId],
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: issued.instanceId, label: { en: "Issued Device" } }]);
});

test.skipIf(!DB)("a held id naming no instance of the target process resolves to no option", async () => {
  const PID = pid("proc_iq_held_missing");
  await publishBody(PID, targetBody(), reg, emptyDsReg);

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    heldValues: ["inst_00000000-0000-0000-0000-000000000000"],
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([]);
});

test.skipIf(!DB)("a held reference keeps its attributes", async () => {
  const PID = pid("proc_iq_held_attrs");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const issued = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Issued", field_t_price: 9 } as unknown as Instance["data"] });
  await submitAndTransition(issued.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);

  const options = await handler().resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label", attributes: { price: "field_t_price" } },
    heldValues: [issued.instanceId],
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: issued.instanceId, label: { en: "Issued" }, attributes: { price: 9 } }]);
});

test.skipIf(!DB)("the handler runs no second read when heldValues is empty", async () => {
  const PID = pid("proc_iq_no_held_read");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const item = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Solo" } as unknown as Instance["data"] });

  // An empty heldValues driving an empty `instanceIds` filter into
  // queryInstances would throw (instance-data-query's own caller-error
  // rule). Resolving cleanly here proves the second read never ran.
  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label" },
    heldValues: [],
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: item.instanceId, label: { en: "Solo" } }]);
});

test.skipIf(!DB)("a redacted instance is dropped from the offered list", async () => {
  const PID = pid("proc_iq_redacted_offered");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const toRedact = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Redact Me" } as unknown as Instance["data"] });
  await submitAndTransition(toRedact.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg); // redaction refuses a running instance
  await redactInstance(toRedact.instanceId, sql);

  const options = await handler().resolve({
    config: { processId: PID, statuses: ["completed"], labelFieldId: "field_t_label" },
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([]);
});

test.skipIf(!DB)("a held redacted instance still resolves, with the id as its label and no attributes", async () => {
  const PID = pid("proc_iq_redacted_held");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const toRedact = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Redact Me", field_t_price: 5 } as unknown as Instance["data"] });
  await submitAndTransition(toRedact.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);
  await redactInstance(toRedact.instanceId, sql);

  const options = await handler().resolve({
    config: { processId: PID, labelFieldId: "field_t_label", attributes: { price: "field_t_price" } }, // default statuses ["running"] already filters it out of the offered half
    heldValues: [toRedact.instanceId],
    instance: stubReader(),
    db: sql,
  });
  expect(options).toEqual([{ value: toRedact.instanceId, label: { en: toRedact.instanceId } }]);
});

test.skipIf(!DB)("a result within the bound resolves; a result over the bound raises rather than truncating", async () => {
  const PID = pid("proc_iq_bound");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  for (let i = 0; i < 3; i++) await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: `item-${i}` } as unknown as Instance["data"] });

  const withinBound = createInstanceQueryDataSourceHandlerDef(5);
  const options = await withinBound.resolve({ config: { processId: PID, labelFieldId: "field_t_label" }, instance: stubReader(), db: sql });
  expect(options).toHaveLength(3);

  // Same read, a smaller bound — the read's own truncation and "the match
  // count exceeds MAX_INSTANCE_QUERY_OPTIONS" are one event under this
  // implementation (see instance-query-source.ts), so one raise path covers
  // both spec scenarios.
  const overBound = createInstanceQueryDataSourceHandlerDef(2);
  let raised: unknown;
  try {
    await overBound.resolve({ config: { processId: PID, labelFieldId: "field_t_label" }, instance: stubReader(), db: sql });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect((raised as Error).message).toContain(PID);
});

test.skipIf(!DB)("a held id does not count against the bound", async () => {
  const PID = pid("proc_iq_bound_held");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const a = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "a" } as unknown as Instance["data"] });
  const b = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "b" } as unknown as Instance["data"] });
  const held = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "held" } as unknown as Instance["data"] });
  await submitAndTransition(held.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg); // off the offered step

  const boundedHandler = createInstanceQueryDataSourceHandlerDef(2); // exactly the offered count
  const options = await boundedHandler.resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label" },
    heldValues: [held.instanceId],
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value).sort()).toEqual([a.instanceId, b.instanceId, held.instanceId].sort());
});

test.skipIf(!DB)("two resolutions of one unchanged configuration agree", async () => {
  const PID = pid("proc_iq_order");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  for (let i = 0; i < 4; i++) await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: `item-${i}` } as unknown as Instance["data"] });

  const config = { processId: PID, labelFieldId: "field_t_label" };
  const first = await handler().resolve({ config, instance: stubReader(), db: sql });
  const second = await handler().resolve({ config, instance: stubReader(), db: sql });
  expect(first.map((o) => o.value)).toEqual(second.map((o) => o.value));
});

test.skipIf(!DB)("held-only options follow the filtered options, ordered by instance id", async () => {
  const PID = pid("proc_iq_held_order");
  await publishBody(PID, targetBody(), reg, emptyDsReg);
  const offered = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "Offered" } as unknown as Instance["data"] });
  const heldA = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "HeldA" } as unknown as Instance["data"] });
  await submitAndTransition(heldA.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);
  const heldB = await createProcessInstance(PID, actor, emptyDsReg, { data: { field_t_label: "HeldB" } as unknown as Instance["data"] });
  await submitAndTransition(heldB.instanceId, "path_issue" as PathId, {} as Instance["data"], actor, emptyDsReg);

  const heldIdsSorted = [heldA.instanceId, heldB.instanceId].sort();

  const options = await handler().resolve({
    config: { processId: PID, stepIds: ["step_shelf"], labelFieldId: "field_t_label" },
    heldValues: [heldA.instanceId, heldB.instanceId],
    instance: stubReader(),
    db: sql,
  });
  expect(options.map((o) => o.value)).toEqual([offered.instanceId, ...heldIdsSorted]);
});

/**
 * Publish-time cross-process validation over an `"instance.query"` data
 * source: `cross-process-validation`'s requirements — processId
 * resolvability, the step/field reference union (reports), the compared
 * field's declared type (rejects), the publishing actor's read grant on the
 * target, the in-process `valueFromField` check, and the type of each
 * compared literal (rejects). DB-backed; skips when DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, CrossProcessValidationError, DataSourceRegistryValidationError } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { createProcessInstance } from "../src/runtime/api.js";
import { writeGrant } from "../src/auth/grants.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import { publishedProcessBody, type ProcessBody, type ProcessId } from "../src/schema/definition.js";
import { compileProcessBody } from "../src/schema/compile.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createRegistry();
const emptyDsReg = createDataSourceRegistry();
const defaultDsReg = createDefaultDataSourceRegistry(); // instance.query registered, for publishBody's own registry check
const actor: Actor = { id: "user_1", roles: [] };
const pid = (n: string) => n as ProcessId;

const TARGET_ID = pid("proc_iqcp_target");
const READER_ID = pid("proc_iqcp_reader");

/** step_a (initial) --(path_ab, manual)--> step_b (terminal). Fields: a scalar comparison target and two non-scalar ones (list, group). */
const targetV1Body = (): ProcessBody =>
  ({
    key: "target",
    label: { en: "Target" },
    baseLocale: "en",
    fields: [
      { id: "field_t_common", key: "common", label: { en: "Common" }, type: "string" },
      { id: "field_t_multi", key: "multi", label: { en: "Multi" }, type: "list", options: [{ value: "x", label: { en: "X" } }] },
      { id: "field_t_group", key: "group", label: { en: "Group" }, type: "group", fields: [] },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** Same process, a new version: adds field_t_v2 and step_only_in_v2 (step_a --manual--> step_only_in_v2 --manual--> step_b). */
const targetV2Body = (): ProcessBody =>
  ({
    key: "target",
    label: { en: "Target" },
    baseLocale: "en",
    fields: [
      { id: "field_t_common", key: "common", label: { en: "Common" }, type: "string" },
      { id: "field_t_multi", key: "multi", label: { en: "Multi" }, type: "list", options: [{ value: "x", label: { en: "X" } }] },
      { id: "field_t_v2", key: "v2field", label: { en: "V2" }, type: "string" },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_a_v2", key: "a_v2", label: "AV2", to: "step_only_in_v2", trigger: "manual" }] },
        { id: "step_only_in_v2", key: "onlyv2", label: { en: "OnlyV2" }, type: "task", paths: [{ id: "path_v2_b", key: "v2_b", label: "V2B", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** field_r_dummy (scalar), field_r_multi and field_r_group (non-scalar) live in every reader body, for the valueFromField checks. `config` is the instance.query source's own config. */
const readerBody = (config: Record<string, unknown>): ProcessBody =>
  ({
    key: "reader",
    label: { en: "Reader" },
    baseLocale: "en",
    fields: [
      { id: "field_r_dummy", key: "dummy", label: { en: "Dummy" }, type: "string" },
      { id: "field_r_multi", key: "multi", label: { en: "Multi" }, type: "list", options: [{ value: "x", label: { en: "X" } }] },
      { id: "field_r_group", key: "group", label: { en: "Group" }, type: "group", fields: [] },
    ],
    dataSources: [{ id: "ds_iq", key: "iq", type: "instance.query", config }],
    workflow: {
      initialStep: "step_r",
      steps: [{ id: "step_r", key: "r", label: { en: "R" }, type: "task", terminal: true }],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, permission_grants`;
  if (DB) await clearInstanceAudit();
});

// ---- 5.1: processId resolvability ----

test.skipIf(!DB)("publishing rejects an instance.query processId resolving to no published process", async () => {
  let raised: unknown;
  try {
    await publishBody(READER_ID, readerBody({ processId: "proc_never_published", labelFieldId: "field_t_common" }), reg, defaultDsReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a source naming a published process publishes", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common" }), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a source naming the publishing process itself publishes, even on its own first publish", async () => {
  const SELF = pid("proc_iqcp_self");
  const result = await publishBody(SELF, readerBody({ processId: SELF, labelFieldId: "field_r_dummy" }), reg, defaultDsReg);
  expect(result.version).toBe(1);
});

// ---- 5.2: the step/field reference union (reports, does not reject) ----

test.skipIf(!DB)("a reference every live version carries reports nothing", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  await publishBody(TARGET_ID, targetV2Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg, { version: 2 });

  const result = await publishBody(
    READER_ID,
    readerBody({
      processId: TARGET_ID,
      stepIds: ["step_a"],
      where: [{ fieldId: "field_t_common", operator: "eq", value: "x" }],
      labelFieldId: "field_t_common",
    }),
    reg,
    defaultDsReg,
  );
  expect(result.findings).toEqual([]);
});

test.skipIf(!DB)("a reference outside the union reports a finding naming the data source and the field id", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_ghost" }), reg, defaultDsReg);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({ dataSourceId: "ds_iq", reference: "field_ghost", referenceKind: "field", carriedByVersions: [] });
});

test.skipIf(!DB)("a partially carried step reference names the version carrying it and the live count outside it", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg); // two running v1 instances
  await publishBody(TARGET_ID, targetV2Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg, { version: 2 });

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, stepIds: ["step_only_in_v2"], labelFieldId: "field_t_common" }), reg, defaultDsReg);
  const finding = result.findings.find((f) => f.reference === "step_only_in_v2")!;
  expect(finding.carriedByVersions).toEqual([2]);
  expect(finding.liveInstanceCountOutsideCarryingVersions).toBe(2);
});

test.skipIf(!DB)("a target with no live instances reports every reference", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg); // no instances created

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, stepIds: ["step_a"], labelFieldId: "field_t_common" }), reg, defaultDsReg);
  expect(result.findings).toHaveLength(2);
  for (const f of result.findings) {
    expect(f.carriedByVersions).toEqual([]);
    expect(f.liveInstanceCountOutsideCarryingVersions).toBe(0);
  }
});

// ---- 5.3: the compared field's declared type (rejects) ----

test.skipIf(!DB)("a comparison naming a list field is rejected", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);

  let raised: unknown;
  try {
    await publishBody(
      READER_ID,
      readerBody({ processId: TARGET_ID, where: [{ fieldId: "field_t_multi", operator: "eq", value: "x" }], labelFieldId: "field_t_common" }),
      reg,
      defaultDsReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a comparison naming a group field is rejected", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);

  let raised: unknown;
  try {
    await publishBody(
      READER_ID,
      readerBody({ processId: TARGET_ID, where: [{ fieldId: "field_t_group", operator: "eq", value: "x" }], labelFieldId: "field_t_common" }),
      reg,
      defaultDsReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a comparison naming a scalar field publishes", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  const result = await publishBody(
    READER_ID,
    readerBody({ processId: TARGET_ID, where: [{ fieldId: "field_t_common", operator: "eq", value: "x" }], labelFieldId: "field_t_common" }),
    reg,
    defaultDsReg,
  );
  expect(result.findings).toEqual([]);
});

test.skipIf(!DB)("an unresolvable compared field reports rather than rejects", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  const result = await publishBody(
    READER_ID,
    readerBody({ processId: TARGET_ID, where: [{ fieldId: "field_ghost", operator: "eq", value: "x" }], labelFieldId: "field_t_common" }),
    reg,
    defaultDsReg,
  );
  expect(result.findings.some((f) => f.reference === "field_ghost")).toBe(true);
});

// ---- 5.4: the publishing actor's read grant on the target ----

test.skipIf(!DB)("an author without the read grant is rejected", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  const noGrant: Actor = { id: "user_nogrant", roles: [] };

  let raised: unknown;
  try {
    await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common" }), reg, defaultDsReg, sql, undefined, noGrant);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("an author holding the grant publishes", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  await writeGrant({ role: "iqcp-reader", permission: "read", scope: { type: "process", config: { processId: TARGET_ID } } }, sql);
  const granted: Actor = { id: "user_granted", roles: ["iqcp-reader"] };

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common" }), reg, defaultDsReg, sql, undefined, granted);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("the operator role short-circuits the grant, with no grant row present", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  const operatorActor: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common" }), reg, defaultDsReg, sql, undefined, operatorActor);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a publish with no actor supplied skips the check", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);

  const result = await publishBody(READER_ID, readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common" }), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);
});

// ---- 5.5: valueFromField resolves to a scalar field of the reading process (in-process) ----

test.skipIf(!DB)("an unresolvable valueFromField fails the publish", async () => {
  let raised: unknown;
  try {
    await publishBody(
      READER_ID,
      readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common", where: [{ fieldId: "field_t_common", operator: "eq", valueFromField: "field_ghost_reader" }] }),
      reg,
      defaultDsReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(DataSourceRegistryValidationError);
});

test.skipIf(!DB)("a list-typed valueFromField fails the publish", async () => {
  let raised: unknown;
  try {
    await publishBody(
      READER_ID,
      readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common", where: [{ fieldId: "field_t_common", operator: "eq", valueFromField: "field_r_multi" }] }),
      reg,
      defaultDsReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(DataSourceRegistryValidationError);
});

test.skipIf(!DB)("a group-typed valueFromField fails the publish", async () => {
  let raised: unknown;
  try {
    await publishBody(
      READER_ID,
      readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common", where: [{ fieldId: "field_t_common", operator: "eq", valueFromField: "field_r_group" }] }),
      reg,
      defaultDsReg,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(DataSourceRegistryValidationError);
});

test.skipIf(!DB)("a scalar valueFromField publishes, subject to the other checks", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
  const result = await publishBody(
    READER_ID,
    readerBody({ processId: TARGET_ID, labelFieldId: "field_t_common", where: [{ fieldId: "field_t_common", operator: "eq", valueFromField: "field_r_dummy" }] }),
    reg,
    defaultDsReg,
  );
  expect(result.version).toBeGreaterThan(0);
});

// ---- 5.6: a compared literal matches the declared type of its field (rejects) ----

const WHERE_LOC = "dataSources[0].config.where";

/** One field per declared type the literal check tells apart. `shiftType`, when given, adds field_t_shift with that declared type, so two versions can retype one field id. */
const typedTargetBody = (shiftType?: unknown): ProcessBody => {
  const fields: Record<string, unknown>[] = [
    { id: "field_t_num", key: "num", label: { en: "Num" }, type: "number" },
    { id: "field_t_flag", key: "flag", label: { en: "Flag" }, type: "boolean" },
    { id: "field_t_text", key: "text", label: { en: "Text" }, type: "string" },
    { id: "field_t_mail", key: "mail", label: { en: "Mail" }, type: "string", format: "email" },
    { id: "field_t_plug", key: "plug", label: { en: "Plug" }, type: { type: "org.signature", config: {} } },
  ];
  if (shiftType !== undefined) fields.push({ id: "field_t_shift", key: "shift", label: { en: "Shift" }, type: shiftType });
  return {
    key: "typed",
    label: { en: "Typed" },
    baseLocale: "en",
    fields,
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  } as unknown as ProcessBody;
};

/** A reader whose one data source compares the typed target with `where`. */
const typedReaderBody = (where: Record<string, unknown>[]): ProcessBody => readerBody({ processId: TARGET_ID, where, labelFieldId: "field_t_text" });

/** Publishes the typed target and starts one live instance of it. */
async function publishTypedTargetWithInstance(shiftType?: unknown): Promise<void> {
  await publishBody(TARGET_ID, typedTargetBody(shiftType), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg);
}

async function raisedBy(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (e) {
    return e;
  }
  return undefined;
}

test.skipIf(!DB)("a string literal on a number field fails the publish, naming the source, location, field, literal and declared type", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "eq", value: "5" }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  const message = (raised as Error).message;
  expect(message).toContain("'ds_iq'");
  expect(message).toContain(`${WHERE_LOC}[0].value`);
  expect(message).toContain("'field_t_num'");
  expect(message).toContain('"5"');
  expect(message).toContain("number");
});

test.skipIf(!DB)("a rejected literal persists no version of the reader", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "eq", value: "5" }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  const rows = (await sql`SELECT COUNT(*)::int AS n FROM definitions WHERE process_id = ${READER_ID}`) as { n: number }[];
  expect(rows[0].n).toBe(0);
});

test.skipIf(!DB)("a string literal on a boolean field fails the publish", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_flag", operator: "eq", value: "true" }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  expect((raised as Error).message).toContain("boolean");
});

test.skipIf(!DB)("a number literal on a string field fails the publish", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_text", operator: "ne", value: 5 }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a string that fails the field's format fails the publish, and the message names the format", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_mail", operator: "eq", value: "foo" }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  expect((raised as Error).message).toContain("email");
});

test.skipIf(!DB)("a literal of the declared type publishes, for each scalar type and a format", async () => {
  await publishTypedTargetWithInstance();

  const result = await publishBody(
    READER_ID,
    typedReaderBody([
      { fieldId: "field_t_num", operator: "eq", value: 5 },
      { fieldId: "field_t_flag", operator: "ne", value: true },
      { fieldId: "field_t_text", operator: "eq", value: "x" },
      { fieldId: "field_t_mail", operator: "eq", value: "a@example.com" },
    ]),
    reg,
    defaultDsReg,
  );
  expect(result.version).toBeGreaterThan(0);
  expect(result.findings).toEqual([]);
});

test.skipIf(!DB)("the check covers each member of an in list, naming the failing member", async () => {
  await publishTypedTargetWithInstance();

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "in", value: [1, "two"] }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  const message = (raised as Error).message;
  expect(message).toContain(`${WHERE_LOC}[0].value[1]`);
  expect(message).toContain('"two"');
});

test.skipIf(!DB)("an in list of the declared type publishes", async () => {
  await publishTypedTargetWithInstance();

  const result = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "in", value: [1, 2, 3] }]), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a null literal publishes on a number field, alone or inside an in list", async () => {
  await publishTypedTargetWithInstance();

  const result = await publishBody(
    READER_ID,
    typedReaderBody([
      { fieldId: "field_t_num", operator: "eq", value: null },
      { fieldId: "field_t_num", operator: "in", value: [1, null] },
    ]),
    reg,
    defaultDsReg,
  );
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a plugin-typed field admits any literal", async () => {
  await publishTypedTargetWithInstance();

  const result = await publishBody(
    READER_ID,
    typedReaderBody([
      { fieldId: "field_t_plug", operator: "eq", value: "anything" },
      { fieldId: "field_t_plug", operator: "eq", value: 7 },
    ]),
    reg,
    defaultDsReg,
  );
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a comparison reading valueFromField carries no literal, so this check raises nothing for it", async () => {
  await publishTypedTargetWithInstance();

  // field_r_dummy is a string of the reading process; field_t_num is a number of the target.
  const result = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "eq", valueFromField: "field_r_dummy" }]), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("one live version admitting the literal is enough, and a literal no live version admits fails naming every declared type", async () => {
  await publishTypedTargetWithInstance("string");
  await publishBody(TARGET_ID, typedTargetBody("number"), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, emptyDsReg, { version: 2 });

  const result = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_shift", operator: "eq", value: 5 }]), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_shift", operator: "eq", value: true }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
  expect((raised as Error).message).toContain("string");
  expect((raised as Error).message).toContain("number");
});

test.skipIf(!DB)("only a live version that declares the field can admit the literal", async () => {
  await publishTypedTargetWithInstance("string");
  await publishBody(TARGET_ID, typedTargetBody(), reg, defaultDsReg); // v2 drops field_t_shift
  await createProcessInstance(TARGET_ID, actor, emptyDsReg, { version: 2 });

  const admitted = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_shift", operator: "eq", value: "x" }]), reg, defaultDsReg);
  expect(admitted.findings.map((f) => f.reference)).toContain("field_t_shift"); // v2 does not carry it

  const raised = await raisedBy(() => publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_shift", operator: "eq", value: 5 }]), reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a compared field no live version carries reports the finding alone, whatever the literal", async () => {
  await publishTypedTargetWithInstance();

  const result = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_ghost", operator: "eq", value: 5 }]), reg, defaultDsReg);
  expect(result.findings.map((f) => f.reference)).toEqual(["field_ghost"]);
});

test.skipIf(!DB)("a target with no live instance leaves the literal unchecked", async () => {
  await publishBody(TARGET_ID, typedTargetBody(), reg, defaultDsReg); // no instance created

  const result = await publishBody(READER_ID, typedReaderBody([{ fieldId: "field_t_num", operator: "eq", value: "5" }]), reg, defaultDsReg);
  expect(result.version).toBeGreaterThan(0);
  expect(result.findings.map((f) => f.reference)).toContain("field_t_num");
});

test.skipIf(!DB)("a hand-written body that satisfies the published schema cannot skip the check", async () => {
  await publishTypedTargetWithInstance();

  // Already compiled, so the compile pass takes its published-schema early return.
  const handWritten = compileProcessBody(typedReaderBody([{ fieldId: "field_t_num", operator: "eq", value: "5" }]));
  expect(publishedProcessBody.safeParse(handWritten).success).toBe(true);

  const raised = await raisedBy(() => publishBody(READER_ID, handWritten, reg, defaultDsReg));
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

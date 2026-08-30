/**
 * Publish-time cross-process validation over an `"instance.query"` data
 * source: `cross-process-validation`'s five requirements — processId
 * resolvability, the step/field reference union (reports), the compared
 * field's declared type (rejects), the publishing actor's read grant on the
 * target, and the in-process `valueFromField` check. DB-backed; skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, CrossProcessValidationError, DataSourceRegistryValidationError } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { createProcessInstance } from "../src/runtime/api.js";
import { writeGrant } from "../src/auth/grants.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
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

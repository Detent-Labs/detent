/**
 * Publish-time cross-process validation over an `instance.transition` action:
 * `cross-process-validation`'s two ADDED requirements (processId
 * resolvability, the pathId reference union) plus the MODIFIED read-grant
 * requirement's `instance.transition` scenarios. DB-backed; skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, CrossProcessValidationError } from "../src/engine/definitions.js";
import { createDataSourceRegistry } from "../src/engine/registry.js";
import { createDefaultRegistry, createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { createProcessInstance } from "../src/runtime/api.js";
import { writeGrant } from "../src/auth/grants.js";
import { AuthorizationError, ADMIN_ROLE } from "../src/auth/authorize.js";
import type { ProcessBody, ProcessId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const reg = createDefaultRegistry(); // instance.transition registered, for publishBody's own registry check
const dsReg = createDataSourceRegistry();
// instance.query registered too, only for the combined-site-kinds test below —
// every other test's body carries no data source, so the empty dsReg above stays their default.
const defaultDsReg = createDefaultDataSourceRegistry();
const actor: Actor = { id: "user_1", roles: [] };
const pid = (n: string) => n as ProcessId;

const TARGET_ID = pid("proc_itcp_target");
const ACTOR_ID = pid("proc_itcp_actor");

/** step_a (initial) --(path_ab, manual)--> step_b (terminal). */
const targetV1Body = (): ProcessBody =>
  ({
    key: "target",
    label: { en: "Target" },
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

/**
 * Same process, a new version: adds step_only_in_v2, reached from step_a by a
 * path (`path_a_v2`) that exists in no other version, and re-declares
 * `path_ab` on step_only_in_v2 — so `path_ab` is carried by BOTH versions
 * while `path_a_v2` is carried by v2 alone.
 */
const targetV2Body = (): ProcessBody =>
  ({
    key: "target",
    label: { en: "Target" },
    baseLocale: "en",
    fields: [],
    workflow: {
      initialStep: "step_a",
      steps: [
        { id: "step_a", key: "a", label: { en: "A" }, type: "task", paths: [{ id: "path_a_v2", key: "a_v2", label: "AV2", to: "step_only_in_v2", trigger: "manual" }] },
        { id: "step_only_in_v2", key: "onlyv2", label: { en: "OnlyV2" }, type: "task", paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }] },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

/** One field (`field_target_id`) and one terminal step carrying the `instance.transition` action under test. */
const actorBody = (config: Record<string, unknown>): ProcessBody =>
  ({
    key: "actor",
    label: { en: "Actor" },
    baseLocale: "en",
    fields: [{ id: "field_target_id", key: "target_id", label: { en: "Target Id" }, type: "string" }],
    workflow: {
      initialStep: "step_r",
      steps: [{ id: "step_r", key: "r", label: { en: "R" }, type: "task", terminal: true, onEntry: [{ id: "action_it", type: "instance.transition", config }] }],
    },
  }) as unknown as ProcessBody;

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions, permission_grants`;
  if (DB) await clearInstanceAudit();
});

// ---- processId resolvability ----

test.skipIf(!DB)("publishing rejects an instance.transition processId resolving to no published process", async () => {
  let raised: unknown;
  try {
    await publishBody(ACTOR_ID, actorBody({ processId: "proc_never_published", instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("an action naming a published target process publishes", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("an action targeting the publishing process itself publishes, even on its own first publish", async () => {
  const SELF = pid("proc_itcp_self");
  const result = await publishBody(SELF, actorBody({ processId: SELF, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.version).toBe(1);
});

// ---- instanceIdField resolvability (rejects) ----

test.skipIf(!DB)("an instanceIdField the publishing body's catalog does not declare is rejected", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  let raised: unknown;
  try {
    await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_ghost", pathId: "path_ab" }), reg, dsReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(CrossProcessValidationError);
});

test.skipIf(!DB)("a declared instanceIdField publishes, subject to the other checks", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg); // a live instance on the version carrying path_ab, so the path finding stays empty
  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.findings).toEqual([]);
});

// ---- pathId reported against the versions holding live instances ----

test.skipIf(!DB)("a path every live version carries reports nothing", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);
  await publishBody(TARGET_ID, targetV2Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg, { version: 2 });

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.findings).toEqual([]);
});

test.skipIf(!DB)("a path outside the union reports a finding naming no data source", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ghost" }), reg, dsReg);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({ referenceKind: "path", reference: "path_ghost", carriedByVersions: [] });
  expect(result.findings[0].dataSourceId).toBeUndefined();
  expect(result.findings[0].loc).toContain("onEntry");
});

test.skipIf(!DB)("a partially carried path names the version carrying it and the live count outside it", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg); // two running v1 instances; v1 declares no path_a_v2

  await publishBody(TARGET_ID, targetV2Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg, { version: 2 }); // one running v2 instance; v2's step_a declares path_a_v2

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_a_v2" }), reg, dsReg);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].carriedByVersions).toEqual([2]);
  expect(result.findings[0].liveInstanceCountOutsideCarryingVersions).toBe(2);
});

test.skipIf(!DB)("a target with no live instances reports the path", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg); // no instances created

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0]).toMatchObject({ referenceKind: "path", reference: "path_ab", carriedByVersions: [], liveInstanceCountOutsideCarryingVersions: 0 });
});

// ---- the publishing actor's read grant on the target ----

test.skipIf(!DB)("an author without the read grant on an instance.transition target is rejected", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);
  const noGrant: Actor = { id: "user_nogrant", roles: [] };

  let raised: unknown;
  try {
    await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg, sql, undefined, noGrant);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("an author holding the read grant publishes", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);
  await writeGrant({ role: "itcp-reader", permission: "read", scope: { type: "process", config: { processId: TARGET_ID } } }, sql);
  const granted: Actor = { id: "user_granted", roles: ["itcp-reader"] };

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg, sql, undefined, granted);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("the operator role short-circuits the grant, with no grant row present", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);
  const operatorActor: Actor = { id: "user_admin", roles: [ADMIN_ROLE] };

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg, sql, undefined, operatorActor);
  expect(result.version).toBeGreaterThan(0);
});

test.skipIf(!DB)("a publish with no actor supplied skips the check", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, dsReg);
  await createProcessInstance(TARGET_ID, actor, dsReg);

  const result = await publishBody(ACTOR_ID, actorBody({ processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" }), reg, dsReg);
  expect(result.version).toBeGreaterThan(0);
});

/**
 * `validateCrossProcessReadGrant` collects target `processId`s from two
 * loops — every `"instance.query"` data source, then every
 * `instance.transition` action — into one `Set` before checking. A body
 * naming the same target from BOTH loops exercises that merge: this is the
 * one shape the single-site-kind tests above cannot reach, since each of
 * them carries only one kind of site.
 */
const combinedSiteBody = (): ProcessBody =>
  ({
    key: "combined",
    label: { en: "Combined" },
    baseLocale: "en",
    fields: [{ id: "field_target_id", key: "target_id", label: { en: "Target Id" }, type: "string" }],
    dataSources: [{ id: "ds_iq", key: "iq", type: "instance.query", config: { processId: TARGET_ID, labelFieldId: "field_target_id" } }],
    workflow: {
      initialStep: "step_r",
      steps: [
        {
          id: "step_r",
          key: "r",
          label: { en: "R" },
          type: "task",
          terminal: true,
          onEntry: [{ id: "action_it", type: "instance.transition", config: { processId: TARGET_ID, instanceIdField: "field_target_id", pathId: "path_ab" } }],
        },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("publishing rejects a body naming one ungranted target from both an instance.query source and an instance.transition action", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, defaultDsReg);
  const noGrant: Actor = { id: "user_nogrant_combined", roles: [] };

  let raised: unknown;
  try {
    await publishBody(ACTOR_ID, combinedSiteBody(), reg, defaultDsReg, sql, undefined, noGrant);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(AuthorizationError);
});

test.skipIf(!DB)("an author holding the read grant publishes a body naming one target from both site kinds", async () => {
  await publishBody(TARGET_ID, targetV1Body(), reg, defaultDsReg);
  await createProcessInstance(TARGET_ID, actor, defaultDsReg);
  await writeGrant({ role: "itcp-reader-combined", permission: "read", scope: { type: "process", config: { processId: TARGET_ID } } }, sql);
  const granted: Actor = { id: "user_granted_combined", roles: ["itcp-reader-combined"] };

  const result = await publishBody(ACTOR_ID, combinedSiteBody(), reg, defaultDsReg, sql, undefined, granted);
  expect(result.version).toBeGreaterThan(0);
});

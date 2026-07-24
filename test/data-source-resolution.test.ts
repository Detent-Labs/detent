/**
 * Runtime resolution of `field.dataSource` into ResolvedViewField.options,
 * consumed by getInstanceView (display) and submitAndTransition/
 * createProcessInstance (membership validation). DB-backed; skips when
 * DATABASE_URL is unset. Mirrors runtime-api.test.ts's style.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry } from "../src/engine/registry.js";
import { createDataSourceRegistry, registerDataSource, type DataSourceHandlerDef } from "../src/engine/registry.js";
import { createProcessInstance, getInstanceView, submitAndTransition, SubmissionValidationError } from "../src/runtime/api.js";
import type { ProcessBody, ProcessId, PathId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const reg = createRegistry();
const PID = "proc_ds_resolution" as ProcessId;

const COUNTRY_OPTIONS = [
  { value: "us", label: { en: "United States" } },
  { value: "ca", label: { en: "Canada" } },
];

// step_a: field_country (select, dataSource-bound to ds_countries) and
// field_tags (multiselect, sharing the same data source — for the
// resolve-once memoization check) --(path_ab, manual, guardless)--> step_b.
const dsBody = (): ProcessBody =>
  ({
    key: "ds_body",
    label: { en: "DS Body" },
    baseLocale: "en",
    fields: [
      { id: "field_country", key: "country", label: { en: "Country" }, type: "select", dataSource: "ds_countries" },
      { id: "field_tags", key: "tags", label: { en: "Tags" }, type: "multiselect", dataSource: "ds_countries" },
    ],
    dataSources: [{ id: "ds_countries", key: "countries", type: "static", config: { options: COUNTRY_OPTIONS } }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_country" }, { ref: "field_tags" }] },
          paths: [{ id: "path_ab", key: "ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

function countingStaticHandler(): { handler: DataSourceHandlerDef; calls: () => number } {
  let calls = 0;
  return {
    handler: {
      resolve: async (ctx) => {
        calls++;
        return (ctx.config as { options: typeof COUNTRY_OPTIONS }).options;
      },
    },
    calls: () => calls,
  };
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
});

test.skipIf(!DB)("getInstanceView resolves a dataSource-bound field's options", async () => {
  const { handler } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  const view = await getInstanceView(created.instanceId, actor, dsReg);
  const country = view.fields.find((f) => f.field.key === "country")!;
  expect(country.options).toEqual(COUNTRY_OPTIONS);
});

test.skipIf(!DB)("two fields sharing one data source resolve it exactly once per resolveFields call", async () => {
  const { handler, calls } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg); // one resolveFields call, for seed-data validation
  const beforeView = calls();
  await getInstanceView(created.instanceId, actor, dsReg); // a second, independent resolveFields call
  // Both step_a fields (field_country, field_tags) share ds_countries — this call
  // resolves it once, not twice, regardless of how many prior calls already ran.
  expect(calls() - beforeView).toBe(1);
});

test.skipIf(!DB)("submitAndTransition accepts a value within the resolved options", async () => {
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  const updated = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_country: "us" } as unknown as Instance["data"], actor, dsReg);
  expect(updated.currentStepId as string).toBe("step_b");
});

test.skipIf(!DB)("submitAndTransition rejects a value outside the resolved options", async () => {
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  let raised: unknown;
  try {
    await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_country: "not-a-country" } as unknown as Instance["data"], actor, dsReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues.some((i) => i.kind === "invalid-option" && i.fieldId === "field_country")).toBe(true);
});

test.skipIf(!DB)("createProcessInstance's seed data is validated against resolved dataSource options", async () => {
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dsReg, { data: { field_country: "not-a-country" } as unknown as Instance["data"] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
});

test.skipIf(!DB)("a runtime registry mismatch for a published data source type throws a plain canary Error", async () => {
  const dsReg = createDataSourceRegistry();
  registerDataSource(dsReg, "static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);

  const mismatchedReg = createDataSourceRegistry(); // "static" not registered here
  let raised: unknown;
  try {
    await getInstanceView(created.instanceId, actor, mismatchedReg);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(Error);
  expect(raised).not.toBeInstanceOf(SubmissionValidationError);
  expect((raised as Error).message).toContain("static");
});

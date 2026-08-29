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
import { createDataSourceRegistry, type DataSourceHandlerDef } from "../src/engine/registry.js";
import { createDefaultDataSourceRegistry } from "../src/engine/host.js";
import { createProcessInstance, getInstanceView, submitAndTransition, SubmissionValidationError } from "../src/runtime/api.js";
import type { ProcessBody, ProcessId, PathId, Instance } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const reg = createRegistry();
const PID = "proc_ds_resolution" as ProcessId;

const COUNTRY_OPTIONS = [
  { value: "us", label: { en: "United States" } },
  { value: "ca", label: { en: "Canada" } },
];

// step_a: field_country (select, dataSource-bound to ds_countries) and
// field_tags (multiselect, sharing the same data source — each field
// resolves it through its own independent call) --(path_ab, manual,
// guardless)--> step_b.
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
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

// step_a: field_marker (plain string, not dataSource-bound) and
// field_country (select, dataSource-bound to ds_countries), both editable on
// the same step --(path_ab, manual, guardless)--> step_b.
const dsMarkerBody = (): ProcessBody =>
  ({
    key: "ds_marker_body",
    label: { en: "DS Marker Body" },
    baseLocale: "en",
    fields: [
      { id: "field_marker", key: "marker", label: { en: "Marker" }, type: "string" },
      { id: "field_country", key: "country", label: { en: "Country" }, type: "select", dataSource: "ds_countries" },
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
          view: { fields: [{ ref: "field_marker" }, { ref: "field_country" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

function countingStaticHandler(): { handler: DataSourceHandlerDef; calls: () => number; heldValueSets: () => string[][] } {
  let calls = 0;
  const heldValueSets: string[][] = [];
  return {
    handler: {
      resolve: async (ctx) => {
        calls++;
        heldValueSets.push(ctx.heldValues ?? []);
        return (ctx.config as { options: typeof COUNTRY_OPTIONS }).options;
      },
    },
    calls: () => calls,
    heldValueSets: () => heldValueSets,
  };
}

/**
 * A handler that models retirement: it offers `active` plus any value the
 * caller says the instance already holds. `active` is mutable so a test can
 * retire a value between two calls, the way an operator does.
 */
function retiringHandler(active: string[]): { handler: DataSourceHandlerDef; retire: (v: string) => void } {
  const ALL = [
    { value: "cc1", label: { en: "One" } },
    { value: "cc_old", label: { en: "Old" } },
  ];
  let offered = new Set(active);
  return {
    handler: {
      resolve: async (ctx) => ALL.filter((o) => offered.has(o.value) || (ctx.heldValues ?? []).includes(o.value)),
    },
    retire: (v) => {
      offered = new Set([...offered].filter((x) => x !== v));
    },
  };
}

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

test.skipIf(!DB)("getInstanceView resolves a dataSource-bound field's options", async () => {
  const { handler } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  const view = await getInstanceView(created.instanceId, actor, dsReg);
  const country = view.fields.find((f) => f.field.key === "country")!;
  expect(country.options).toEqual(COUNTRY_OPTIONS);
});

test.skipIf(!DB)("two fields sharing one data source each resolve it independently", async () => {
  const { handler, calls } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg); // one resolveFields call, for seed-data validation
  const beforeView = calls();
  await getInstanceView(created.instanceId, actor, dsReg); // a second, independent resolveFields call
  // Both step_a fields (field_country, field_tags) share ds_countries. Each
  // field triggers its own handler.resolve call — resolveDataSourceOptions
  // carries no cache, so sharing a data source does not reduce the call count.
  expect(calls() - beforeView).toBe(2);
});

test.skipIf(!DB)("submitAndTransition accepts a value within the resolved options", async () => {
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  const updated = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_country: "us" } as unknown as Instance["data"], actor, dsReg);
  expect(updated.currentStepId as string).toBe("step_b");
});

test.skipIf(!DB)("submitAndTransition rejects a value outside the resolved options", async () => {
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
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
  dsReg.set("static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
  await publishBody(PID, dsBody(), reg, dsReg);
  let raised: unknown;
  try {
    await createProcessInstance(PID, actor, dsReg, { data: { field_country: "not-a-country" } as unknown as Instance["data"] });
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
});

test.skipIf(!DB)("a select contributes one held value and a multiselect contributes its whole array", async () => {
  const { handler, heldValueSets } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg, {
    data: { field_country: "us", field_tags: ["us", "ca"] } as unknown as Instance["data"],
  });
  const before = heldValueSets().length;
  await getInstanceView(created.instanceId, actor, dsReg);
  // Sorted, so the multiselect's array order does not leak into the memo key.
  expect(heldValueSets().slice(before)).toEqual([["us"], ["ca", "us"]]);
});

test.skipIf(!DB)("two fields sharing one data source resolve twice when their held values differ", async () => {
  const { handler, calls } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg, {
    data: { field_country: "us", field_tags: ["ca"] } as unknown as Instance["data"],
  });
  const before = calls();
  await getInstanceView(created.instanceId, actor, dsReg);
  expect(calls() - before).toBe(2);
});

test.skipIf(!DB)("two fields sharing one data source each resolve it independently when their held values match", async () => {
  const { handler, calls } = countingStaticHandler();
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg, {
    data: { field_country: "us", field_tags: ["us"] } as unknown as Instance["data"],
  });
  const before = calls();
  await getInstanceView(created.instanceId, actor, dsReg);
  // Matching held values used to share one memoized call; with no cache each
  // field resolves independently regardless of whether their held values agree.
  expect(calls() - before).toBe(2);
});

test.skipIf(!DB)("a retired value the instance holds stays visible and stays submittable", async () => {
  const { handler, retire } = retiringHandler(["cc1", "cc_old"]);
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", handler);
  await publishBody(PID, dsBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg, { data: { field_country: "cc_old" } as unknown as Instance["data"] });

  retire("cc_old");

  // The holder still sees it, with its label — not a bare key.
  const view = await getInstanceView(created.instanceId, actor, dsReg);
  const country = view.fields.find((f) => f.field.key === "country")!;
  expect(country.options).toContainEqual({ value: "cc_old", label: { en: "Old" } });
  // And a field nobody holds it for no longer offers it.
  const tags = view.fields.find((f) => f.field.key === "tags")!;
  expect(tags.options).toEqual([{ value: "cc1", label: { en: "One" } }]);

  // Resubmitting the unchanged value passes membership validation, which reads
  // the resolved options — optionValuesValid needs no change of its own.
  const updated = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_country: "cc_old" } as unknown as Instance["data"], actor, dsReg);
  expect(updated.currentStepId as string).toBe("step_b");
});

test.skipIf(!DB)("a handler sees the pre-submit value of a field filled in the same submission", async () => {
  const dsReg = createDataSourceRegistry();
  const seenMarkers: (string | undefined)[] = [];
  dsReg.set("static", {
    resolve: async (ctx) => {
      seenMarkers.push((ctx.instance.data as Record<string, unknown>).field_marker as string | undefined);
      return COUNTRY_OPTIONS;
    },
  });
  await publishBody(PID, dsMarkerBody(), reg, dsReg);
  const created = await createProcessInstance(PID, actor, dsReg);
  seenMarkers.length = 0;
  await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_marker: "filled-in-this-submission", field_country: "us" } as unknown as Instance["data"],
    actor,
    dsReg,
  );
  // resolveFields runs against the instance's committed data, before the
  // submitted payload merges over it — see design.md "instance.data is the
  // instance's committed data". field_marker was unset at step entry, so the
  // handler must see it unset even though this same submission fills it.
  expect(seenMarkers).toEqual([undefined]);
});

test.skipIf(!DB)("an instance.query-bound field resolves through resolveFields/getInstanceView end-to-end", async () => {
  // The real default registry, not a stub resolve() — proves resolveFields'
  // dsInstance construction (api.ts:561-566) for the instance.query handler
  // specifically, which every other test in this file exercises only via
  // "static". See instance-query-data-source's design.md.
  const dsReg = createDefaultDataSourceRegistry();
  const TARGET = "proc_ds_resolution_iq_target" as ProcessId;
  const READER = "proc_ds_resolution_iq_reader" as ProcessId;

  const iqTargetBody = (): ProcessBody =>
    ({
      key: "iq_target",
      label: { en: "Target" },
      baseLocale: "en",
      fields: [{ id: "field_t_label", key: "label", label: { en: "Label" }, type: "string" }],
      workflow: {
        initialStep: "step_shelf",
        steps: [
          {
            id: "step_shelf",
            key: "shelf",
            label: { en: "Shelf" },
            type: "task",
            view: { fields: [{ ref: "field_t_label" }] },
            paths: [{ id: "path_issue", key: "issue", label: "Issue", to: "step_issued", trigger: "manual" }],
          },
          { id: "step_issued", key: "issued", label: { en: "Issued" }, type: "task", terminal: true },
        ],
      },
    }) as unknown as ProcessBody;

  const iqReaderBody = (): ProcessBody =>
    ({
      key: "iq_reader",
      label: { en: "Reader" },
      baseLocale: "en",
      fields: [{ id: "field_device", key: "device", label: { en: "Device" }, type: "select", dataSource: "ds_devices" }],
      dataSources: [
        { id: "ds_devices", key: "devices", type: "instance.query", config: { processId: TARGET, stepIds: ["step_shelf"], labelFieldId: "field_t_label" } },
      ],
      workflow: {
        initialStep: "step_r",
        steps: [
          {
            id: "step_r",
            key: "r",
            label: { en: "R" },
            type: "task",
            view: { fields: [{ ref: "field_device" }] },
            paths: [{ id: "path_r_done", key: "done", label: "Done", to: "step_done", trigger: "manual" }],
          },
          { id: "step_done", key: "done", label: { en: "Done" }, type: "task", terminal: true },
        ],
      },
    }) as unknown as ProcessBody;

  await publishBody(TARGET, iqTargetBody(), reg, dsReg);
  const device = await createProcessInstance(TARGET, actor, dsReg, { data: { field_t_label: "Widget" } as unknown as Instance["data"] });
  await publishBody(READER, iqReaderBody(), reg, dsReg);
  const created = await createProcessInstance(READER, actor, dsReg);

  const view = await getInstanceView(created.instanceId, actor, dsReg);
  const deviceField = view.fields.find((f) => f.field.key === "device")!;
  expect(deviceField.options).toEqual([{ value: device.instanceId, label: { en: "Widget" } }]);

  const updated = await submitAndTransition(created.instanceId, "path_r_done" as PathId, { field_device: device.instanceId } as unknown as Instance["data"], actor, dsReg);
  expect(updated.currentStepId as string).toBe("step_done");
});

test.skipIf(!DB)("a runtime registry mismatch for a published data source type throws a plain canary Error", async () => {
  const dsReg = createDataSourceRegistry();
  dsReg.set("static", { resolve: async (ctx) => (ctx.config as { options: typeof COUNTRY_OPTIONS }).options });
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

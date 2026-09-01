/**
 * `openspec/changes/table-shaped-data-sources`: the write-back. A field's
 * `columnMapping` sends a picked option's attribute into another catalog
 * field, before the transition commits, so a guard on the same hop reads it.
 * A mismatching attribute is dropped and recorded. DB-backed; skips when
 * DATABASE_URL is unset.
 */
import { test, expect, beforeAll, beforeEach } from "bun:test";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody } from "../src/engine/definitions.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { createProcessInstance, submitAndTransition, getInstanceView, SubmissionValidationError, isResolvedViewField } from "../src/runtime/api.js";
import type { ProcessBody, ProcessId, PathId, StepId, Instance, InstanceEvent, FieldOption, FieldId } from "../src/schema/definition.js";
import type { Actor } from "../src/cel/eval.js";
import { clearInstanceAudit } from "./audit-cleanup.js";

const DB = !!process.env.DATABASE_URL;
const actor: Actor = { id: "user_1", roles: [] };
const reg = createRegistry();

/**
 * Options the test controls directly, through a registered handler rather than
 * a data list. The mapping reads `FieldOption.attributes`, and where those came
 * from is `db.list`'s business, not this one's.
 */
function optionRegistry(options: FieldOption[]) {
  const r = createDataSourceRegistry();
  r.set("test.options", { resolve: async () => options });
  return r;
}

const PRODUCTS: FieldOption[] = [
  { value: "widget", label: { en: "Widget" }, attributes: { sku: "A-1140", price: 12.5 } },
  { value: "bolt", label: { en: "Bolt" }, attributes: { sku: "B-0002", price: 3 } },
  { value: "bare", label: { en: "Bare" } },
];

/**
 * step_a carries the picker and maps `price` onto field_price and `sku` onto
 * field_sku. Two paths out, both automatic is not what we want here — the one
 * manual path carries a guard reading the mapped field, which is the case the
 * whole change exists for.
 */
const mappingBody = (over: { guard?: string; mapping?: Record<string, string>; priceType?: string } = {}): ProcessBody =>
  ({
    key: "mapping_body",
    label: { en: "Mapping" },
    baseLocale: "en",
    fields: [
      {
        id: "field_product",
        key: "product",
        label: { en: "Product" },
        type: "string",
        dataSource: "ds_products",
        columnMapping: over.mapping ?? { price: "field_price", sku: "field_sku" },
      },
      { id: "field_price", key: "price", label: { en: "Price" }, type: over.priceType ?? "number" },
      { id: "field_sku", key: "sku", label: { en: "SKU" }, type: "string" },
    ],
    dataSources: [{ id: "ds_products", key: "products", type: "test.options", config: {} }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_product" }, { ref: "field_price", readonly: true }, { ref: "field_sku" }] },
          paths: [
            {
              id: "path_ab",
              key: "ab", label: "Ab",
              to: "step_b",
              trigger: "manual",
              ...(over.guard ? { guard: { lang: "cel", src: over.guard } } : {}),
            },
          ],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

let seq = 0;
async function publish(body: ProcessBody, dsReg = optionRegistry(PRODUCTS)): Promise<ProcessId> {
  const pid = `proc_mapping_${seq++}` as ProcessId;
  await publishBody(pid, body, reg, dsReg, sql);
  return pid;
}

const eventsOf = async (instanceId: string): Promise<InstanceEvent[]> =>
  ((await sql`SELECT event FROM instance_events WHERE instance_id = ${instanceId} ORDER BY id`) as { event: unknown }[]).map(
    (r) => (typeof r.event === "string" ? JSON.parse(r.event) : r.event) as InstanceEvent,
  );

beforeAll(async () => {
  if (DB) await initSchema();
});
beforeEach(async () => {
  if (DB) await sql`TRUNCATE outbox, instances, history_entries, instance_events, definitions`;
  if (DB) await clearInstanceAudit();
});

test.skipIf(!DB)("picking a row writes the mapped fields", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  expect((after.data as Record<string, unknown>).field_price).toBe(12.5);
  expect((after.data as Record<string, unknown>).field_sku).toBe("A-1140");
});

test.skipIf(!DB)("a guard on the same hop reads the written value", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  // The guard reads the MAPPED field, which nothing has written before this
  // submission. It matches only because the write-back lands before the commit.
  const pid = await publish(mappingBody({ guard: "data.price > 10.0" }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  expect(after.currentStepId).toBe("step_b" as StepId);

  // The cheap row fails the same guard, which proves the guard read the
  // mapped value rather than passing on something else.
  const second = await createProcessInstance(pid, actor, dsReg, {}, sql);
  await expect(
    submitAndTransition(second.instanceId, "path_ab" as PathId, { field_product: "bolt" } as unknown as Instance["data"], actor, dsReg, sql),
  ).rejects.toThrow();
});

test.skipIf(!DB)("the mapped value beats a value the same request submits", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(
    created.instanceId,
    "path_ab" as PathId,
    { field_product: "widget", field_sku: "typed-by-hand" } as unknown as Instance["data"],
    actor,
    dsReg,
    sql,
  );
  expect((after.data as Record<string, unknown>).field_sku).toBe("A-1140");
});

test.skipIf(!DB)("a readonly target still takes the mapped value, and raises no readonly-field issue", async () => {
  // field_price is readonly in step_a's view. The participant never submits
  // it; the engine writes it anyway, because the mapping is authored.
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  expect((after.data as Record<string, unknown>).field_price).toBe(12.5);
});

test.skipIf(!DB)("a key naming no declared column writes nothing and the submission succeeds", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody({ mapping: { nothing_declares_this: "field_sku" } }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  expect(after.currentStepId).toBe("step_b" as StepId);
  expect((after.data as Record<string, unknown>).field_sku).toBeUndefined();
});

test.skipIf(!DB)("an option carrying no attributes writes nothing", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "bare" } as unknown as Instance["data"], actor, dsReg, sql);
  expect((after.data as Record<string, unknown>).field_price).toBeUndefined();
  expect((after.data as Record<string, unknown>).field_sku).toBeUndefined();
});

test.skipIf(!DB)("a request that writes no mapping field leaves its targets alone", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, { data: { field_sku: "kept" } as unknown as Instance["data"] }, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, {} as unknown as Instance["data"], actor, dsReg, sql);
  expect((after.data as Record<string, unknown>).field_sku).toBe("kept");
});

test.skipIf(!DB)("creation applies the mapping too", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, { data: { field_product: "widget" } as unknown as Instance["data"] }, sql);
  expect((created.data as Record<string, unknown>).field_price).toBe(12.5);
  expect((created.data as Record<string, unknown>).field_sku).toBe("A-1140");
  // And the view reads back what was written, not a value resolved on the fly.
  const view = await getInstanceView(created.instanceId, actor, dsReg, sql);
  expect(view.fields.filter(isResolvedViewField).find((f) => f.field.id === "field_price")!.value).toBe(12.5);
});

test.skipIf(!DB)("a field that is both a columnMapping target and carries its own default has that default overwritten by the mapping's write", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const body = structuredClone(mappingBody()) as ProcessBody;
  (body.fields[1] as unknown as { default: unknown }).default = 999; // field_price's own default
  const pid = await publish(body, dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, { data: { field_product: "widget" } as unknown as Instance["data"] }, sql);
  // applyColumnMapping runs after the defaulting loop and overwrites unconditionally.
  expect((created.data as Record<string, unknown>).field_price).toBe(12.5);
});

// ---- The drop ----

test.skipIf(!DB)("a mistyped attribute is dropped, the submission succeeds, and the drop is recorded", async () => {
  // field_price declares `string` here, so the option's numeric 12.5 does not
  // match it. `sku` matches and still lands.
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody({ priceType: "string" }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);

  expect(after.currentStepId).toBe("step_b" as StepId);
  expect((after.data as Record<string, unknown>).field_price).toBeUndefined();
  // One drop does not stop the others.
  expect((after.data as Record<string, unknown>).field_sku).toBe("A-1140");

  const events = await eventsOf(created.instanceId);
  const drop = events.find((e) => e.kind === "datasource.attribute-dropped") as
    | Extract<InstanceEvent, { kind: "datasource.attribute-dropped" }>
    | undefined;
  expect(drop).toBeDefined();
  expect(drop!.payload as Record<string, unknown>).toEqual({
    fieldId: "field_product",
    column: "price",
    targetFieldId: "field_price",
    reason: "type-mismatch",
  });
  // The event enqueues no actions, the way every non-transition kind but
  // timer.fired and subprocess.spawn-enqueued does.
  expect((drop as unknown as { outcomes?: unknown }).outcomes).toBeUndefined();
});

test.skipIf(!DB)("the drop carries the sequence the entry lands on, and does not advance it", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody({ priceType: "string" }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  expect(created.transitionSeq).toBe(0);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  const drop = (await eventsOf(created.instanceId)).find((e) => e.kind === "datasource.attribute-dropped")!;
  expect(drop.transitionSeq).toBe(after.transitionSeq);
  expect(drop.version).toBe(after.version);
});

test.skipIf(!DB)("a drop at creation is recorded on the created instance", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody({ priceType: "string" }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, { data: { field_product: "widget" } as unknown as Instance["data"] }, sql);
  const drop = (await eventsOf(created.instanceId)).find((e) => e.kind === "datasource.attribute-dropped")!;
  expect(drop.transitionSeq).toBe(0);
  expect(drop.payload).toMatchObject({ column: "price", reason: "type-mismatch" });
});

test.skipIf(!DB)("neither the transition nor its drop survives a rolled-back commit", async () => {
  // A guard that refuses rolls the whole transaction back. The drop was
  // computed before the commit, so this is the case that proves it rides in.
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody({ priceType: "string", guard: "false" }), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  await expect(
    submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql),
  ).rejects.toThrow();
  expect((await eventsOf(created.instanceId)).filter((e) => e.kind === "datasource.attribute-dropped")).toHaveLength(0);
});

// ---- data-source-resolution: the view carries what the handler produced ----

test.skipIf(!DB)("the view carries an option's attributes, unchanged from the handler", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const view = await getInstanceView(created.instanceId, actor, dsReg, sql);
  const picker = view.fields.filter(isResolvedViewField).find((f) => f.field.id === "field_product")!;
  expect(picker.options).toEqual(PRODUCTS);
  // The resolution layer neither adds an entry nor drops one.
  expect(picker.options!.find((o) => o.value === "bare")!.attributes).toBeUndefined();
});

test.skipIf(!DB)("an attribute does not widen option membership", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(mappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  // "A-1140" is an ATTRIBUTE value, never an option value. Membership reads
  // `value` alone, whatever the attributes hold.
  await expect(
    submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "A-1140" } as unknown as Instance["data"], actor, dsReg, sql),
  ).rejects.toThrow();
});

// ---- technical-field-marker: a technical field can still be a columnMapping
// target. The engine writes it (the author wired the mapping; a participant
// never edits it), but a submission naming the target directly is rejected
// before the mapping runs. field_price sits on step_a's view with no
// required/readonly key (the definition contract forbids declaring either on
// a technical field's entry, task 1.2) so it stays visible, and a
// directly-submitted value resolves to the readonly-field issue rather than
// unknown-field (runtime-api spec: "A technical field the current step's
// view does not resolve at all falls under the unknown-field rule above,
// unchanged"). ----

const technicalMappingBody = (): ProcessBody =>
  ({
    key: "technical_mapping_body",
    label: { en: "Technical Mapping" },
    baseLocale: "en",
    fields: [
      {
        id: "field_product",
        key: "product",
        label: { en: "Product" },
        type: "string",
        dataSource: "ds_products",
        columnMapping: { price: "field_price" },
      },
      { id: "field_price", key: "price", label: { en: "Price" }, type: "number", technical: true },
    ],
    dataSources: [{ id: "ds_products", key: "products", type: "test.options", config: {} }],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          label: { en: "A" },
          type: "task",
          view: { fields: [{ ref: "field_product" }, { ref: "field_price" }] },
          paths: [{ id: "path_ab", key: "ab", label: "Ab", to: "step_b", trigger: "manual" }],
        },
        { id: "step_b", key: "b", label: { en: "B" }, type: "task", terminal: true },
      ],
    },
  }) as unknown as ProcessBody;

test.skipIf(!DB)("a technical mapped target still takes the mapped value", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(technicalMappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);
  const after = await submitAndTransition(created.instanceId, "path_ab" as PathId, { field_product: "widget" } as unknown as Instance["data"], actor, dsReg, sql);
  expect((after.data as Record<string, unknown>).field_price).toBe(12.5);
});

test.skipIf(!DB)("a request writing a technical mapped target directly is rejected, and the mapping does not run", async () => {
  const dsReg = optionRegistry(PRODUCTS);
  const pid = await publish(technicalMappingBody(), dsReg);
  const created = await createProcessInstance(pid, actor, dsReg, {}, sql);

  let raised: unknown;
  try {
    await submitAndTransition(
      created.instanceId,
      "path_ab" as PathId,
      { field_product: "widget", field_price: 999 } as unknown as Instance["data"],
      actor,
      dsReg,
      sql,
    );
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeInstanceOf(SubmissionValidationError);
  expect((raised as SubmissionValidationError).issues).toEqual([{ kind: "readonly-field", fieldId: "field_price" as FieldId }]);

  const view = await getInstanceView(created.instanceId, actor, dsReg, sql);
  expect(view.fields.filter(isResolvedViewField).find((f) => f.field.id === "field_price")?.value).toBeUndefined();
});

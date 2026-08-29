/**
 * `instance.query` data source: a leaf handler whose option list is another
 * process's instances, selected by their current step and their `data`. It
 * issues no statement of its own against `instances` — every read goes
 * through the Runtime API Layer's `queryInstances`, the predicate builder
 * `listInstances` already shares. See
 * `openspec/changes/instance-query-data-source/design.md`.
 */

import { z } from "zod";
import { fieldId, stepId, processId, instanceStatus, type FieldOption, type Literal, type InstanceId } from "../schema/definition.js";
import { MAX_KEY_LENGTH } from "../schema/compile.js";
import type { DataSourceContext, DataSourceHandlerDef } from "./registry.js";
import { queryInstances, type InstanceQueryFilter, type DataComparison, type InstanceDataItem } from "../runtime/api.js";

export const INSTANCE_QUERY_DATA_SOURCE_TYPE = "instance.query";

/** A column key names a `FieldDef.columnMapping` entry — the same slug grammar `db.list`'s own column keys use. */
const COLUMN_KEY_FORMAT = /^[a-z_][a-z0-9_]*$/;

const instanceQueryScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const instanceQueryComparison = z
  .object({
    fieldId,
    operator: z.enum(["eq", "ne", "in"]),
    value: z.union([instanceQueryScalar, z.array(instanceQueryScalar)]).optional(),
    valueFromField: fieldId.optional(),
  })
  .refine((c) => (c.value !== undefined) !== (c.valueFromField !== undefined), {
    message: "a where entry must carry exactly one of value or valueFromField",
  })
  .refine(
    (c) => {
      // "in" needs a non-empty list right side. `valueFromField` always
      // resolves to a scalar field (publish-time validation forces this), so
      // it can never satisfy "in" — the config layer rejects the pairing
      // outright rather than let it reach the read's own runtime rejection.
      // "eq"/"ne" need a scalar right side, from either source.
      if (c.operator === "in") return c.valueFromField === undefined && Array.isArray(c.value) && c.value.length > 0;
      return c.value === undefined || !Array.isArray(c.value);
    },
    { message: "an 'in' comparison needs a non-empty list value (never valueFromField); 'eq'/'ne' need a scalar value" },
  );

export const instanceQueryDataSourceConfigSchema = z
  .object({
    processId,
    stepIds: z.array(stepId).optional(),
    // Absent means the default (["running"]); an explicit empty list is a
    // caller error rather than "match every status", the same convention
    // `stepIds`/`instanceIds` use for their own empty-vs-absent case.
    statuses: z.array(instanceStatus).min(1).optional(),
    where: z.array(instanceQueryComparison).optional(),
    labelFieldId: fieldId,
    attributes: z.record(z.string().regex(COLUMN_KEY_FORMAT).max(MAX_KEY_LENGTH), fieldId).optional(),
  })
  .strict();

export type InstanceQueryDataSourceConfig = z.infer<typeof instanceQueryDataSourceConfigSchema>;

function scalarOrUndefined(v: unknown): string | number | boolean | undefined {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

/** `FieldOption.label` is `LocalizedText`, never a plain string. See design.md "A resolved label is a single-locale `LocalizedText`". */
function labelFor(text: string, baseLocale: string): FieldOption["label"] {
  return { [baseLocale]: text };
}

/** Absent, not empty, when no configured column resolves — the same "Absent, not empty" rule `db.list` already follows. */
function buildAttributes(config: InstanceQueryDataSourceConfig, data: Record<string, unknown>): Record<string, string | number | boolean> | undefined {
  if (!config.attributes) return undefined;
  const attributes: Record<string, string | number | boolean> = {};
  for (const [columnKey, targetFieldId] of Object.entries(config.attributes)) {
    const raw = scalarOrUndefined(data[targetFieldId]);
    if (raw !== undefined) attributes[columnKey] = raw;
  }
  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function buildOption(item: InstanceDataItem, config: InstanceQueryDataSourceConfig, baseLocale: string): FieldOption {
  const data = item.data as Record<string, unknown>;
  const labelValue = scalarOrUndefined(data[config.labelFieldId]);
  const label = labelFor(labelValue !== undefined ? String(labelValue) : item.instanceId, baseLocale);
  const attributes = buildAttributes(config, data);
  return attributes ? { value: item.instanceId, label, attributes } : { value: item.instanceId, label };
}

/**
 * `maxOptions` is a parameter, not a module import, so this module never
 * imports `host.ts` — `host.ts` imports THIS module to register the handler,
 * and `MAX_INSTANCE_QUERY_OPTIONS` lives there beside `MAX_DATA_LIST_VALUES`.
 * A module-level import the other way would close a cycle.
 */
export function createInstanceQueryDataSourceHandlerDef(maxOptions: number): DataSourceHandlerDef {
  async function resolve(ctx: DataSourceContext): Promise<FieldOption[]> {
    const config = ctx.config as InstanceQueryDataSourceConfig;
    const baseLocale = ctx.instance.baseLocale;

    const dataWhere: DataComparison[] = [];
    for (const c of config.where ?? []) {
      let value: Literal | Literal[];
      if (c.valueFromField !== undefined) {
        const raw = (ctx.instance.data as Record<string, unknown>)[c.valueFromField];
        // An unwritten source field resolves the WHOLE source to an empty
        // list, not a raise. See instance-query-data-source's "A comparison's
        // right side is a literal or a field of the reading instance".
        if (raw === undefined) return [];
        value = raw as Literal;
      } else {
        value = c.value as Literal | Literal[];
      }
      dataWhere.push({ fieldId: c.fieldId, operator: c.operator, value });
    }

    const filter: InstanceQueryFilter = {
      processId: config.processId,
      status: config.statuses ?? ["running"],
    };
    // "No step filter" means omitting `currentStepId` entirely — passing an
    // empty array would hit the read's own caller-error rejection. See
    // design.md "An empty stepIds omits the filter rather than passing an
    // empty array".
    if (config.stepIds && config.stepIds.length > 0) filter.currentStepId = config.stepIds;
    if (dataWhere.length > 0) filter.dataWhere = dataWhere;
    // A query over the reading instance's own process excludes that instance.
    if (config.processId === ctx.instance.processId) filter.excludeInstanceId = ctx.instance.id;

    const page = await queryInstances(filter, { limit: maxOptions }, ctx.db);
    // `maxOptions` IS the read's own limit, so `truncated` already covers both
    // "the read's own bound truncated the result" and "the match count
    // exceeds MAX_INSTANCE_QUERY_OPTIONS" — under this choice of limit they
    // are the same event. See design.md's Open Questions.
    if (page.truncated) throw new Error(`instance.query data source over its option bound: process '${config.processId}'`);

    const offeredIds = new Set<string>();
    const offered: FieldOption[] = [];
    for (const item of page.items) {
      if (item.redactedAt) continue; // dropped from the offered list; still resolvable below as a held reference
      offeredIds.add(item.instanceId);
      offered.push(buildOption(item, config, baseLocale));
    }

    const heldValues = ctx.heldValues ?? [];
    if (heldValues.length === 0) return offered;

    // The held ids have to survive whatever the filters above no longer
    // select — no step, status or comparison filter on this second read. See
    // "A held reference resolves even when the filters exclude it".
    const heldPage = await queryInstances(
      { processId: config.processId, instanceIds: heldValues as unknown as InstanceId[] },
      { limit: heldValues.length },
      ctx.db,
    );
    const heldOnly = heldPage.items
      .filter((item) => !offeredIds.has(item.instanceId))
      .sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0))
      .map((item) => buildOption(item, config, baseLocale));

    return [...offered, ...heldOnly];
  }

  return { configSchema: instanceQueryDataSourceConfigSchema, resolve };
}

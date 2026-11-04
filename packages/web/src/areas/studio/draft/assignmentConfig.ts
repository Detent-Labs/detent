import type { ConfigFieldDescriptor } from "../api/types.js";
import type { Draft } from "./types";
import { flattenDraftFields } from "./fields";
import { isDraftViewField } from "./view-layout";
import { structuralWriterIds } from "./view-flags";

/**
 * Whether some source can write `fieldId` for the assignment on `stepId`. The
 * strategy reads the field at step entry, before an entry or an action on that
 * step lands, so neither counts.
 *
 * ponytail: a later step on a loop still counts, so this reports no writer at
 * all and proves no order. `writtenFieldCounts` is the upgrade for a stricter
 * reading.
 */
export function fieldHasWriter(draft: Draft, fieldId: string, stepId: string): boolean {
  const steps = draft.workflow?.steps ?? [];
  const others = steps.filter((s) => s.id !== stepId);
  if (structuralWriterIds({ ...draft, workflow: { ...draft.workflow, steps: others } }).has(fieldId)) return true;
  if (flattenDraftFields(draft.fields).some((f) => f.id === fieldId && f.default !== undefined)) return true;
  return others.some((s) =>
    (s.view?.fields ?? [])
      .filter(isDraftViewField)
      .some((entry) => entry.ref === fieldId && entry.visible !== false && entry.readonly !== true),
  );
}

/** What the two config readers take of a strategy. A draft holds any JSON here. */
export interface HeldStrategy {
  type?: unknown;
  config?: unknown;
}

type StrategySchemas = Readonly<Record<string, readonly ConfigFieldDescriptor[]>>;

function describedFields(strategy: HeldStrategy | undefined, schemas: StrategySchemas | undefined): readonly ConfigFieldDescriptor[] | undefined {
  const type = strategy?.type;
  return typeof type === "string" && schemas !== undefined && Object.hasOwn(schemas, type) ? schemas[type] : undefined;
}

function plainObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function hasKind(value: unknown, field: ConfigFieldDescriptor): boolean {
  const allowed = (entry: unknown) => field.enumValues === undefined || field.enumValues.includes(entry as string);
  switch (field.kind) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && allowed(value);
    case "string-array":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string" && allowed(entry));
  }
}

/**
 * What a publish would refuse in a who-acts config, one sentence per absent
 * required key, value of the wrong kind, or unknown key on a closed type. The
 * sentences stand in a check's Developer view. A strategy with no description
 * raises nothing. An empty list and an empty string raise nothing here: the
 * server accepts the first and the compile check reports the second.
 */
export function assignmentConfigGaps(
  strategy: HeldStrategy | undefined,
  schemas: StrategySchemas | undefined,
  closed: readonly string[] | undefined,
): string[] {
  const fields = describedFields(strategy, schemas);
  if (fields === undefined) return [];
  const config = plainObject(strategy?.config);
  if (config === undefined) return ["config is not an object"];

  const gaps: string[] = [];
  for (const field of fields) {
    const value = Object.hasOwn(config, field.key) ? config[field.key] : undefined;
    if (value === undefined) {
      if (field.required) gaps.push(`config has no value for required key '${field.key}'`);
    } else if (!hasKind(value, field)) {
      gaps.push(`config key '${field.key}' holds a value of the wrong kind, expected ${field.kind}`);
    }
  }
  if (closed?.includes(strategy?.type as string)) {
    for (const key of Object.keys(config)) {
      if (!fields.some((field) => field.key === key)) gaps.push(`config key '${key}' is not one this strategy declares`);
    }
  }
  return gaps;
}

/**
 * Whether a held strategy's config is complete, the Who acts header's Done. With
 * no description it passes, whatever the config holds. With one, it adds an empty
 * required value to the gaps, so an emptied list fails with no issue raised.
 */
export function assignmentConfigHolds(
  strategy: HeldStrategy | undefined,
  schemas: StrategySchemas | undefined,
  closed: readonly string[] | undefined,
): boolean {
  const fields = describedFields(strategy, schemas);
  if (fields === undefined) return true;
  if (assignmentConfigGaps(strategy, schemas, closed).length > 0) return false;
  const config = plainObject(strategy?.config)!;
  return fields.every((field) => {
    if (!field.required) return true;
    const value = config[field.key];
    return value !== "" && !(Array.isArray(value) && value.length === 0);
  });
}

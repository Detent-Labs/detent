/**
 * The migration-plan screen's two surfaces over one `MigrationSpec`: the
 * field-mapping form and the raw JSON textarea. Both sides read and write the
 * same plan object, so neither can become a second source of truth
 * (studio-migration-plan-form spec).
 *
 * The server still owns validation at `PUT /migration-plans/...`. `checkPlan`
 * below covers only the three rules the browser can evaluate from the two
 * version bodies it already holds.
 */
import { celType } from "workflow-engine/cel/check";
import { CANCEL_SINK_STEP_ID, type BaseFieldType, type FieldFormat } from "workflow-engine/schema";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";

const CANCEL_SINK: string = CANCEL_SINK_STEP_ID;

export type ParsedSpec = { spec: unknown } | { error: string };

/** Never throws. Empty input is an empty plan, not an error — a plan with no rules is valid (every field is optional). */
export function parseSpecText(text: string): ParsedSpec {
  if (text.trim() === "") return { spec: {} };
  try {
    return { spec: JSON.parse(text) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "invalid JSON" };
  }
}

export function formatSpecText(spec: unknown): string {
  return JSON.stringify(spec ?? {}, null, 2);
}

export interface StepEntry {
  id: string;
  key: string;
  label: string;
}

export interface FieldEntry extends StepEntry {
  /** The CEL type `validatePlan` compares, not the declared field type. */
  celType: string;
}

export interface VersionCatalog {
  steps: StepEntry[];
  fields: FieldEntry[];
}

export const EMPTY_CATALOG: VersionCatalog = { steps: [], fields: [] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function entryLabel(raw: Record<string, unknown>, baseLocale: string): string {
  const key = typeof raw.key === "string" ? raw.key : "";
  const label = isRecord(raw.label)
    ? resolveDraftLocalizedText(raw.label as Record<string, string>, baseLocale, baseLocale)
    : undefined;
  return label ?? key;
}

/**
 * Read an opaque published body into pickable entries. Nothing here trusts the
 * body's shape: `getVersionBody` returns `unknown`, and a malformed answer must
 * degrade to an empty catalog rather than throw on a screen that still has a
 * usable JSON textarea.
 *
 * The field walk mirrors `fieldTypeById` (`src/engine/migration.ts`): a `group`
 * field contributes its leaves and never itself, because an instance's `data` is
 * flat and keyed by a leaf field.
 */
export function readCatalog(body: unknown): VersionCatalog {
  if (!isRecord(body)) return EMPTY_CATALOG;
  const baseLocale = typeof body.baseLocale === "string" ? body.baseLocale : "en";

  const steps: StepEntry[] = [];
  const workflow = body.workflow;
  if (isRecord(workflow) && Array.isArray(workflow.steps))
    for (const step of workflow.steps) {
      if (!isRecord(step) || typeof step.id !== "string") continue;
      steps.push({ id: step.id, key: typeof step.key === "string" ? step.key : "", label: entryLabel(step, baseLocale) });
    }

  const fields: FieldEntry[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const field of list) {
      if (!isRecord(field) || typeof field.id !== "string") continue;
      if (field.type === "group") {
        walk(field.fields);
        continue;
      }
      fields.push({
        id: field.id,
        key: typeof field.key === "string" ? field.key : "",
        label: entryLabel(field, baseLocale),
        // `celType` reads the format too: an `integer` number reports `int`,
        // so the form can report a `double` source mapped onto an `int`
        // target rather than passing the pair as a match.
        celType: celType({ type: (field.type ?? {}) as BaseFieldType, format: field.format as FieldFormat | undefined }),
      });
    }
  };
  walk(body.fields);

  return { steps, fields };
}

export interface Catalogs {
  source: VersionCatalog;
  target: VersionCatalog;
}

/** A render key. Never reaches the plan — two rows may hold the same id mid-edit. */
export type RowId = string;

export interface MapRow {
  rowId: RowId;
  from: string;
  to: string;
}

export interface TransformRow {
  rowId: RowId;
  target: string;
  /** The `Expression.src` alone; `rowsToPlan` re-adds the `{ lang: "cel" }` wrapper. */
  src: string;
}

export type UnmappablePolicy = "" | "reject-and-pin" | "route-to-step";

export interface PlanRows {
  stepMap: MapRow[];
  fieldMap: MapRow[];
  transforms: TransformRow[];
  onUnmappable: UnmappablePolicy;
  unmappableStep: string;
}

export const EMPTY_ROWS: PlanRows = {
  stepMap: [],
  fieldMap: [],
  transforms: [],
  onUnmappable: "",
  unmappableStep: "",
};

/**
 * A React list key, never part of the plan the server stores (see `toSpec`).
 * `crypto.randomUUID()` rather than a module-level counter, matching
 * `draft/ids.ts::mintId`: the counter was one number shared across every
 * screen in the process.
 */
export function nextRowId(): RowId {
  return `row_${crypto.randomUUID()}`;
}

function readStringMap(value: unknown): MapRow[] {
  if (!isRecord(value)) return [];
  const rows: MapRow[] = [];
  for (const [from, to] of Object.entries(value)) if (typeof to === "string") rows.push({ rowId: nextRowId(), from, to });
  return rows;
}

export function planToRows(spec: unknown): PlanRows {
  if (!isRecord(spec)) return { ...EMPTY_ROWS };
  const transforms: TransformRow[] = [];
  if (isRecord(spec.transforms))
    for (const [target, expr] of Object.entries(spec.transforms))
      if (isRecord(expr) && typeof expr.src === "string") transforms.push({ rowId: nextRowId(), target, src: expr.src });

  const policy = spec.onUnmappable;
  return {
    stepMap: readStringMap(spec.stepMap),
    fieldMap: readStringMap(spec.fieldMap),
    transforms,
    onUnmappable: policy === "reject-and-pin" || policy === "route-to-step" ? policy : "",
    unmappableStep: typeof spec.unmappableStep === "string" ? spec.unmappableStep : "",
  };
}

function writeStringMap(rows: MapRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const row of rows) if (row.from !== "" && row.to !== "") out[row.from] = row.to;
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * The plan the screen sends. An empty map is omitted rather than sent as `{}`,
 * so an untouched form saves the same `{}` the empty textarea saves today.
 */
export function rowsToPlan(rows: PlanRows): Record<string, unknown> {
  const plan: Record<string, unknown> = {};
  const stepMap = writeStringMap(rows.stepMap);
  if (stepMap) plan.stepMap = stepMap;
  const fieldMap = writeStringMap(rows.fieldMap);
  if (fieldMap) plan.fieldMap = fieldMap;

  const transforms: Record<string, { lang: "cel"; src: string }> = {};
  for (const row of rows.transforms) if (row.target !== "") transforms[row.target] = { lang: "cel", src: row.src };
  if (Object.keys(transforms).length > 0) plan.transforms = transforms;

  // The schema pairs these two as an iff, so neither is written without the other.
  if (rows.onUnmappable === "route-to-step") {
    if (rows.unmappableStep !== "") {
      plan.onUnmappable = rows.onUnmappable;
      plan.unmappableStep = rows.unmappableStep;
    }
  } else if (rows.onUnmappable === "reject-and-pin") {
    plan.onUnmappable = rows.onUnmappable;
  }
  return plan;
}

/** Keys the unmappable-policy issues, which belong to no row. */
export const UNMAPPABLE_ROW_ID = "unmappable";

export interface RowIssue {
  rowId: RowId;
  message: string;
}

/**
 * The three rules the browser can evaluate. Everything else stays on the server:
 * `transforms` needs CEL type inference, and the identity-carried type check is a
 * whole-catalog rule with no row to attach to.
 */
export function checkPlan(rows: PlanRows, catalogs: Catalogs): RowIssue[] {
  const issues: RowIssue[] = [];

  const targetCount = new Map<string, number>();
  for (const row of rows.fieldMap) if (row.to !== "") targetCount.set(row.to, (targetCount.get(row.to) ?? 0) + 1);

  for (const row of rows.fieldMap) {
    if (row.to !== "" && (targetCount.get(row.to) ?? 0) > 1)
      issues.push({ rowId: row.rowId, message: "two sources target this field; fieldMap must be injective" });
    const from = catalogs.source.fields.find((f) => f.id === row.from);
    const to = catalogs.target.fields.find((f) => f.id === row.to);
    if (from && to && from.celType !== to.celType)
      issues.push({ rowId: row.rowId, message: `type ${from.celType} does not match target type ${to.celType}` });
  }

  for (const row of rows.stepMap)
    if (row.to === CANCEL_SINK)
      issues.push({ rowId: row.rowId, message: "the reserved cancel-sink step is not a valid target" });

  if (rows.unmappableStep === CANCEL_SINK)
    issues.push({ rowId: UNMAPPABLE_ROW_ID, message: "the reserved cancel-sink step is not a valid target" });

  return issues;
}

/** An id absent from its catalog. The row keeps it and the plan keeps it; only the picker marks it. */
export function isUnresolved(id: string, entries: readonly StepEntry[]): boolean {
  return id !== "" && !entries.some((e) => e.id === id);
}

/** A picker never offers the reserved cancel-sink, on either side of a step map. */
export function selectableSteps(catalog: VersionCatalog): StepEntry[] {
  return catalog.steps.filter((s) => s.id !== CANCEL_SINK);
}

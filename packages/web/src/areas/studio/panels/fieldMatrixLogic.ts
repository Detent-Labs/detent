/**
 * The field matrix's row, column and cell derivation, kept out of React so it
 * can be tested (`studio-app`'s field-matrix requirements).
 *
 * Nothing here mutates except `applyBulkToggle`, which mutates the `steps`
 * array a caller passes it — always inside one `mutate()` recipe, never on
 * its own (design.md decision 3, `field-matrix-toolbar-and-inline-editing`).
 * Every write goes through `setFlag` (`draft/view-flags.ts`), the same
 * writer the form editor's strip already uses.
 */
import type { FieldId, Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { flattenDraftFields } from "../draft/fields";
import { flattenRailFields } from "../draft/panel-rail";
import { isDraftViewField, type DraftViewField } from "../draft/view-layout";
import { effectiveFlag, FLAG_DEFAULT, gatedKeys, setFlag, type FlagKey, type WrittenAccessor } from "../draft/view-flags";
import type { BoolOrExpr } from "./shared/overrideMode";
import { isExpression } from "./shared/overrideMode";

type DraftStep = DraftOf<Step>;

/** A field's `type` is either a literal type name or a `{ type, config }`
 * plugin envelope. The row header shows the envelope's own `type`, and an
 * empty string for a field whose type the author has not chosen yet. */
function rowTypeLabel(type: DraftField["type"]): string {
  return (typeof type === "string" ? type : type?.type) ?? "";
}

/** One row of the grid. `depth` caps at 1, matching `flattenRailFields`. A
 * group row draws no differently in state from any other row (design.md
 * decision 2); `isGroup` exists for its distinct header style alone. */
export interface FieldMatrixRow {
  id: string;
  key: string;
  depth: 0 | 1;
  isGroup: boolean;
  type: string;
}

/**
 * Rows in catalog order, `flattenRailFields`' own depth-first walk and depth
 * cap, with `isGroup` and `type` joined in from `flattenDraftFields`. No new
 * traversal: both walks already visit the catalog in the same order.
 */
export function matrixRows(fields: DraftField[] | undefined): FieldMatrixRow[] {
  const byId = new Map(flattenDraftFields(fields).map((f) => [f.id, f]));
  return flattenRailFields(fields).map((row) => {
    const field = byId.get(row.id as FieldId);
    return { ...row, isGroup: field?.type === "group", type: rowTypeLabel(field?.type) };
  });
}

export type CellState = "hatched" | "blank" | "live";

/** Hatched: the column's step declares no `view` at all — the whole column
 * hatches, regardless of the row. Blank: the step has a view, but no entry
 * names this row's field. Live: such an entry exists. */
export function cellState(step: DraftStep, fieldId: string): CellState {
  if (step.view === undefined) return "hatched";
  const entry = (step.view.fields ?? []).filter(isDraftViewField).find((f) => f.ref === fieldId);
  return entry === undefined ? "blank" : "live";
}

/** A live cell's entry and its array index, the index a write needs. A note
 * matches no field id, since it carries no `ref`. */
export function cellEntry(step: DraftStep, fieldId: string): { entry: DraftViewField; index: number } | undefined {
  const fields = step.view?.fields ?? [];
  const index = fields.findIndex((f) => isDraftViewField(f) && f.ref === fieldId);
  return index === -1 ? undefined : { entry: fields[index] as DraftViewField, index };
}

/** A step with no `view` at all hides its whole column when `hideInert` is
 * on; every other step draws. Rows are never filtered — the toolbar's toggle
 * touches only columns (`studio-app`'s toolbar requirement). */
export function filterInertSteps(steps: DraftStep[], hideInert: boolean): DrawnStep[] {
  return steps.map((step, index) => ({ step, index })).filter(({ step }) => !hideInert || step.view !== undefined);
}

/** One drawn column: the step, and its index in the FULL, unfiltered
 * `workflow.steps` array — the index a write needs, independent of which
 * columns `hideInert` currently hides. */
export interface DrawnStep {
  step: DraftStep;
  index: number;
}

/** The toolbar's count line: declared field entries, the field count, the
 * count of steps the grid currently draws, and the number of cells among
 * those steps that carry no entry (`studio-app`'s toolbar requirement). A
 * note occupies no cell, so it raises neither the first nor the fourth
 * number. `drawnSteps` is already `hideInert`-filtered; `declaredEntries`
 * over it equals the total over every step, since a filtered-out step
 * declares no view and so contributes no entries either way. */
export interface MatrixCounts {
  declaredEntries: number;
  fieldCount: number;
  stepCount: number;
  undeclaredCells: number;
}

export function matrixCounts(rows: FieldMatrixRow[], drawnSteps: DraftStep[]): MatrixCounts {
  const declaredEntries = drawnSteps.reduce((sum, step) => sum + (step.view?.fields?.filter(isDraftViewField).length ?? 0), 0);
  const fieldCount = rows.length;
  const stepCount = drawnSteps.length;
  return { declaredEntries, fieldCount, stepCount, undeclaredCells: fieldCount * stepCount - declaredEntries };
}

/** Whether a bulk badge may touch this cell's flag: live (the caller already
 * filters to live cells), not carrying a CEL expression for this flag, and
 * not gated off by its own `visible: false` or the `required`/`readonly`
 * mutual gate (`studio-app`'s bulk-toggle requirement — "Eligible means
 * live, non-CEL, not gated"). */
function cellEligible(
  entry: DraftViewField,
  key: FlagKey,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
  ownStepIndex: number,
): boolean {
  return !isExpression(entry[key]) && !gatedKeys(entry, written, technicalFieldIds, ownStepIndex).includes(key);
}

/** One (step, field) pair a bulk badge would touch, identified by the
 * step's TRUE index in `workflow.steps` — independent of `hideInert`, so a
 * write lands on the right step whether or not its column is currently
 * drawn. */
export interface BulkTarget {
  stepIndex: number;
  fieldId: string;
}

/** The targets a column's bulk badge touches: every row live in this one
 * step. */
export function columnLiveTargets(rows: FieldMatrixRow[], step: DraftStep, stepIndex: number): BulkTarget[] {
  return rows.filter((r) => cellState(step, r.id) === "live").map((r) => ({ stepIndex, fieldId: r.id }));
}

/** The targets a row's bulk badge touches: every step live for this one
 * field, across the FULL step list — a row is never filtered by
 * `hideInert`, and an inert step can hold no live cell regardless. */
export function rowLiveTargets(steps: DraftStep[], fieldId: string): BulkTarget[] {
  return steps.reduce<BulkTarget[]>((out, step, stepIndex) => {
    if (cellState(step, fieldId) === "live") out.push({ stepIndex, fieldId });
    return out;
  }, []);
}

export function eligibleTargetEntries(
  steps: DraftStep[],
  targets: BulkTarget[],
  key: FlagKey,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
): { target: BulkTarget; entry: DraftViewField }[] {
  const out: { target: BulkTarget; entry: DraftViewField }[] = [];
  for (const target of targets) {
    const step = steps[target.stepIndex];
    if (!step) continue;
    const cell = cellEntry(step, target.fieldId);
    if (cell && cellEligible(cell.entry, key, written, technicalFieldIds, target.stepIndex)) out.push({ target, entry: cell.entry });
  }
  return out;
}

/** Whether a column's or row's bulk badge reads as pressed: every eligible
 * cell it would touch already carries the flag's non-default value
 * (`studio-app`'s bulk-toggle requirement). An empty eligible set reads as
 * not pressed — there is nothing to reflect. */
export function bulkBadgeOn(
  steps: DraftStep[],
  targets: BulkTarget[],
  key: FlagKey,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
): boolean {
  const eligible = eligibleTargetEntries(steps, targets, key, written, technicalFieldIds);
  return eligible.length > 0 && eligible.every(({ entry }) => effectiveFlag(entry[key], key) !== FLAG_DEFAULT[key]);
}

/**
 * A bulk badge's click: flips every eligible target's flag to the opposite
 * of the current "all agree" state, in place on `steps` — the caller's own
 * `mutate()` recipe, per design.md decision 3. One pass over the eligible
 * cells, not one `mutate()` per cell.
 */
export function applyBulkToggle(
  steps: DraftStep[],
  targets: BulkTarget[],
  key: FlagKey,
  written: WrittenAccessor,
  technicalFieldIds: Set<string>,
): void {
  const eligible = eligibleTargetEntries(steps, targets, key, written, technicalFieldIds);
  if (eligible.length === 0) return;
  const on = eligible.every(({ entry }) => effectiveFlag(entry[key], key) !== FLAG_DEFAULT[key]);
  const next: BoolOrExpr = on ? FLAG_DEFAULT[key] : !FLAG_DEFAULT[key];
  for (const { target } of eligible) {
    const fields = steps[target.stepIndex]?.view?.fields;
    if (!fields) continue;
    const idx = fields.findIndex((f) => isDraftViewField(f) && f.ref === target.fieldId);
    if (idx === -1) continue;
    fields[idx] = setFlag(fields[idx] as DraftViewField, key, next);
  }
}

/**
 * The flagged-cell marker: `checkViewFlags`'s exact three-part test
 * (`draft/view-flags.ts`), applied to one live cell, at that cell's own
 * step (design.md decision 5). Shares `writtenFieldCounts`'s one expensive,
 * dominance-scoped computation with that check instead of reimplementing
 * it, so the two can never disagree about what "already written" means. A
 * CEL-carrying flag skips the marker outright: it resolves only against an
 * instance, so no literal comparison applies.
 */
export function isCellFlagged(
  entry: DraftViewField,
  fieldId: string,
  isGroupRow: boolean,
  written: WrittenAccessor,
  ownStepIndex: number,
): boolean {
  if (isGroupRow) return false;
  if (isExpression(entry.visible) || isExpression(entry.required) || isExpression(entry.readonly)) return false;
  const visible = effectiveFlag(entry.visible, "visible") as boolean;
  const required = effectiveFlag(entry.required, "required") as boolean;
  const readonly = effectiveFlag(entry.readonly, "readonly") as boolean;
  if (required && !visible) return true;
  return required && readonly && written(fieldId, ownStepIndex) === 0;
}

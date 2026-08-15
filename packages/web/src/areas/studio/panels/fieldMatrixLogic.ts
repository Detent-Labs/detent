/**
 * The field matrix's row, column and cell derivation, kept out of React so it
 * can be tested (`studio-app`'s field-matrix requirements).
 *
 * Nothing here mutates. Every write the cell editor makes goes through
 * `setFlag` (`draft/view-flags.ts`), the same writer the form editor's strip
 * already uses.
 */
import type { FieldId, Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { flattenDraftFields } from "../draft/fields";
import { flattenRailFields } from "../draft/panel-rail";
import type { DraftViewField } from "../draft/view-layout";
import { effectiveFlag, FLAG_DEFAULT, type FlagKey } from "../draft/view-flags";
import { isExpression } from "./shared/overrideMode";

type DraftStep = DraftOf<Step>;

/** One row of the grid. `depth` caps at 1, matching `flattenRailFields`. A
 * group row draws no differently in state from any other row (design.md
 * decision 2); `isGroup` exists for its distinct header style alone. */
export interface FieldMatrixRow {
  id: string;
  key: string;
  depth: 0 | 1;
  isGroup: boolean;
}

/**
 * Rows in catalog order, `flattenRailFields`' own depth-first walk and depth
 * cap, with `isGroup` joined in from `flattenDraftFields`. No new traversal:
 * both walks already visit the catalog in the same order.
 */
export function matrixRows(fields: DraftField[] | undefined): FieldMatrixRow[] {
  const byId = new Map(flattenDraftFields(fields).map((f) => [f.id, f]));
  return flattenRailFields(fields).map((row) => ({
    ...row,
    isGroup: byId.get(row.id as FieldId)?.type === "group",
  }));
}

export type CellState = "hatched" | "blank" | "live";

/** Hatched: the column's step declares no `view` at all — the whole column
 * hatches, regardless of the row. Blank: the step has a view, but no entry
 * names this row's field. Live: such an entry exists. */
export function cellState(step: DraftStep, fieldId: string): CellState {
  if (step.view === undefined) return "hatched";
  const entry = (step.view.fields ?? []).find((f) => f.ref === fieldId);
  return entry === undefined ? "blank" : "live";
}

/** A live cell's entry and its array index, the index a write needs. */
export function cellEntry(step: DraftStep, fieldId: string): { entry: DraftViewField; index: number } | undefined {
  const fields = step.view?.fields ?? [];
  const index = fields.findIndex((f) => f.ref === fieldId);
  return index === -1 ? undefined : { entry: fields[index]!, index };
}

/** One flag's compact summary: whether its resolved value departs from
 * `FLAG_DEFAULT`, and whether it carries a CEL expression. A departure and an
 * expression are mutually exclusive — an expression's resolved value is the
 * expression itself, not a boolean, so it never compares against the
 * default. */
export interface FlagSummary {
  departsFromDefault: boolean;
  isExpression: boolean;
}

export interface LiveCellSummary {
  visible: FlagSummary;
  required: FlagSummary;
  readonly: FlagSummary;
}

function summarizeFlag(entry: DraftViewField, key: FlagKey): FlagSummary {
  const value = entry[key];
  const expr = isExpression(value);
  return { departsFromDefault: !expr && effectiveFlag(value, key) !== FLAG_DEFAULT[key], isExpression: expr };
}

/** A live cell's summary, read straight from `effectiveFlag`/`isExpression`
 * (`draft/view-flags.ts`, `panels/shared/overrideMode.ts`). No independent
 * resolution logic: the cell editor and this summary must never disagree
 * about what a flag resolves to. */
export function liveCellSummary(entry: DraftViewField): LiveCellSummary {
  return {
    visible: summarizeFlag(entry, "visible"),
    required: summarizeFlag(entry, "required"),
    readonly: summarizeFlag(entry, "readonly"),
  };
}

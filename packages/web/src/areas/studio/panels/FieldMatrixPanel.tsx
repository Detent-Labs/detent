import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { setFlag, gatedKeys, type FlagKey } from "../draft/view-flags";
import type { BoolOrExpr } from "./shared/overrideMode";
import { BooleanOrExpressionInput } from "./shared/BooleanOrExpressionInput";
import { matrixRows, cellState, cellEntry, liveCellSummary, type CellState } from "./fieldMatrixLogic";
import type { DraftViewField } from "../draft/view-layout";

const FLAG_KEYS: FlagKey[] = ["visible", "required", "readonly"];
const FLAG_LETTER: Record<FlagKey, string> = { visible: "V", required: "R", readonly: "O" };
const FLAG_LABEL_KEY = {
  visible: "formEditor.visible",
  required: "formEditor.required",
  readonly: "formEditor.readonly",
} as const;

interface Focus {
  row: number;
  col: number;
}

interface Selected {
  stepIndex: number;
  fieldId: string;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** A live cell's compact mark cluster: one mono letter per flag, inked only
 * where the resolved value departs from `FLAG_DEFAULT`, boxed like a small
 * stamp where the flag carries a CEL expression instead. */
function CellSummary({ entry }: { entry: DraftViewField }) {
  const summary = liveCellSummary(entry);
  return (
    <span className="studio-matrix-summary" aria-hidden="true">
      {FLAG_KEYS.map((key) => (
        <span
          key={key}
          className="studio-matrix-mark"
          data-active={summary[key].departsFromDefault || undefined}
          data-cel={summary[key].isExpression || undefined}
        >
          {FLAG_LETTER[key]}
        </span>
      ))}
    </span>
  );
}

/** The screen-reader summary for a live cell: which flags depart from
 * default, and which carry an expression. Empty for a cell at every
 * default — the row/column headers alone are enough there. */
function summaryLabel(entry: DraftViewField): string | undefined {
  const summary = liveCellSummary(entry);
  const parts = FLAG_KEYS.filter((key) => summary[key].departsFromDefault || summary[key].isExpression).map((key) => {
    const label = t(FLAG_LABEL_KEY[key]);
    return summary[key].isExpression ? `${label} (${t("formEditor.markCel")})` : label;
  });
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * The field matrix: every catalog field against every workflow step
 * (`studio-app`'s field-matrix requirements). A `role="grid"` table with a
 * roving tabindex — the whole grid is one tab stop, arrow keys move inside
 * it (`spa-accessibility`'s two-dimensional-grid requirement).
 *
 * Selecting a live cell opens one editor below the grid, targeting exactly
 * that (step, field) pair. Every write goes through `setFlag`
 * (`draft/view-flags.ts`), the same writer the form editor's strip uses.
 */
export function FieldMatrixPanel() {
  const { draft, mutate, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const rows = matrixRows(draft.fields);
  const steps = draft.workflow?.steps ?? [];

  const [focus, setFocus] = useState<Focus>({ row: 0, col: 0 });
  const [selected, setSelected] = useState<Selected | undefined>(undefined);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());
  const containerRef = useRef<HTMLDivElement>(null);

  // A click outside the grid and the editor closes the editor
  // (`studio-app`'s field-matrix cell-editor requirement).
  useEffect(() => {
    if (!selected) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setSelected(undefined);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selected]);

  const rowCount = rows.length;
  const colCount = steps.length;
  const clamp = (n: number, count: number) => Math.max(0, Math.min(n, count - 1));

  const moveFocus = (next: Focus) => {
    if (rowCount === 0 || colCount === 0) return;
    const clamped = { row: clamp(next.row, rowCount), col: clamp(next.col, colCount) };
    setFocus(clamped);
    cellRefs.current.get(cellKey(clamped.row, clamped.col))?.focus();
  };

  const selectCell = (rowIndex: number, colIndex: number) => {
    const row = rows[rowIndex];
    const step = steps[colIndex];
    if (row && step && cellState(step, row.id) === "live") {
      setSelected({ stepIndex: colIndex, fieldId: row.id });
    } else {
      setSelected(undefined);
    }
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        moveFocus({ row: focus.row - 1, col: focus.col });
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus({ row: focus.row + 1, col: focus.col });
        break;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus({ row: focus.row, col: focus.col - 1 });
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus({ row: focus.row, col: focus.col + 1 });
        break;
      case "Home":
        e.preventDefault();
        moveFocus(e.ctrlKey ? { row: 0, col: 0 } : { row: focus.row, col: 0 });
        break;
      case "End":
        e.preventDefault();
        moveFocus(e.ctrlKey ? { row: rowCount - 1, col: colCount - 1 } : { row: focus.row, col: colCount - 1 });
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectCell(focus.row, focus.col);
        break;
      case "Escape":
        if (selected) {
          e.preventDefault();
          setSelected(undefined);
        }
        break;
    }
  };

  const writeFlag = (stepIndex: number, fieldId: string, key: FlagKey, next: BoolOrExpr) => {
    mutate((d) => {
      const fields = d.workflow?.steps?.[stepIndex]?.view?.fields;
      if (!fields) return;
      const idx = fields.findIndex((f) => f.ref === fieldId);
      if (idx === -1) return;
      fields[idx] = setFlag(fields[idx]!, key, next);
    });
  };

  const selectedRow = selected ? rows.find((r) => r.id === selected.fieldId) : undefined;
  const selectedStep = selected ? steps[selected.stepIndex] : undefined;
  const selectedCell = selected && selectedStep ? cellEntry(selectedStep, selected.fieldId) : undefined;
  const selectedStepLabel =
    selectedStep &&
    (resolveDraftLocalizedText(selectedStep.label, contentLocale, baseLocale) ||
      selectedStep.key ||
      t("steps.unnamedStep"));

  return (
    <div className="studio-matrix" ref={containerRef}>
      <div className="studio-matrix-scroll" tabIndex={0} aria-label={t("fieldMatrix.scrollRegionLabel")}>
        <table
          className="studio-matrix-table"
          role="grid"
          aria-label={t("fieldMatrix.heading")}
          onKeyDown={onGridKeyDown}
        >
          <thead>
            <tr>
              <th scope="col" className="studio-matrix-corner" />
              {steps.map((step, colIndex) => (
                <th key={step.id ?? colIndex} scope="col" className="studio-matrix-col-header">
                  {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id} data-group={row.isGroup || undefined}>
                <th scope="row" className="studio-matrix-row-header" data-depth={row.depth}>
                  {row.key === "" ? t("panelsScreen.unnamedField") : row.key}
                </th>
                {steps.map((step, colIndex) => {
                  const state: CellState = cellState(step, row.id);
                  const entry = state === "live" ? cellEntry(step, row.id)?.entry : undefined;
                  const isFocus = focus.row === rowIndex && focus.col === colIndex;
                  const isSelected = selected?.stepIndex === colIndex && selected.fieldId === row.id;
                  return (
                    <td
                      key={step.id ?? colIndex}
                      ref={(el) => {
                        if (el) cellRefs.current.set(cellKey(rowIndex, colIndex), el);
                        else cellRefs.current.delete(cellKey(rowIndex, colIndex));
                      }}
                      role="gridcell"
                      tabIndex={isFocus ? 0 : -1}
                      className="studio-matrix-cell"
                      data-state={state}
                      data-selected={isSelected || undefined}
                      aria-label={state === "hatched" ? t("fieldMatrix.hatchedCell") : entry && summaryLabel(entry)}
                      onFocus={() => setFocus({ row: rowIndex, col: colIndex })}
                      onClick={() => {
                        setFocus({ row: rowIndex, col: colIndex });
                        selectCell(rowIndex, colIndex);
                      }}
                    >
                      {entry && <CellSummary entry={entry} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && selectedRow && selectedStep && selectedCell ? (
        <section className="studio-matrix-editor" aria-label={t("fieldMatrix.editorHeading")}>
          <h3 className="studio-matrix-editor-heading">
            {selectedRow.key === "" ? t("panelsScreen.unnamedField") : selectedRow.key}
            <span className="studio-matrix-editor-step">{selectedStepLabel}</span>
          </h3>
          {FLAG_KEYS.map((key) => (
            <fieldset key={key} className="studio-matrix-flag-fieldset" disabled={gatedKeys(selectedCell.entry).includes(key)}>
              <BooleanOrExpressionInput
                label={t(FLAG_LABEL_KEY[key])}
                flagKey={key}
                stepId={selectedStep.id}
                value={selectedCell.entry[key]}
                onChange={(next) => writeFlag(selected.stepIndex, selected.fieldId, key, next)}
              />
            </fieldset>
          ))}
        </section>
      ) : (
        <p className="studio-matrix-editor-empty">{t("fieldMatrix.noCellSelected")}</p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { effectiveFlag, gatedKeys, setFlag, writtenFieldCounts, type FlagKey } from "../draft/view-flags";
import type { BoolOrExpr } from "./shared/overrideMode";
import { isExpression } from "./shared/overrideMode";
import {
  matrixRows,
  cellState,
  cellEntry,
  filterInertSteps,
  columnLiveTargets,
  rowLiveTargets,
  bulkBadgeOn,
  applyBulkToggle,
  isCellFlagged,
  type CellState,
  type BulkTarget,
} from "./fieldMatrixLogic";

const FLAG_KEYS: FlagKey[] = ["visible", "required", "readonly"];
const FLAG_LETTER: Record<FlagKey, string> = { visible: "VIS", required: "REQ", readonly: "RO" };
const FLAG_LABEL_KEY = {
  visible: "formEditor.visible",
  required: "formEditor.required",
  readonly: "formEditor.readonly",
} as const;

interface Focus {
  row: number;
  col: number;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

/** A CEL-carrying flag gives way to this stamp instead of its control — an
 * expression resolves only against an instance, which the studio holds none
 * of, so there is no boolean to show (`studio-app`'s live-cell requirement). */
function CelStamp({ label, src }: { label: string; src: string }) {
  return (
    <span className="studio-matrix-cel" title={`${label}: ${src}`}>
      <span className="studio-matrix-cel-stamp">{t("formEditor.markCel")}</span>
      <span className="studio-matrix-cel-src">{src}</span>
    </span>
  );
}

/** The three visible/required/readonly bulk badges a column or row header
 * shows, wherever it carries at least one live cell (`studio-app`'s
 * bulk-toggle requirement). Reads `bulkBadgeOn` for `aria-pressed`, and
 * writes through `applyBulkToggle` inside one `mutate()` call. */
function BulkBadges({
  targets,
  allSteps,
  written,
  onToggle,
}: {
  targets: BulkTarget[];
  allSteps: Parameters<typeof bulkBadgeOn>[0];
  written: Map<string, number>;
  onToggle: (key: FlagKey) => void;
}) {
  return (
    <span className="studio-matrix-flags">
      {FLAG_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="studio-matrix-flag-badge"
          aria-pressed={bulkBadgeOn(allSteps, targets, key, written)}
          aria-label={t(FLAG_LABEL_KEY[key])}
          title={t(FLAG_LABEL_KEY[key])}
          onClick={() => onToggle(key)}
        >
          {FLAG_LETTER[key]}
        </button>
      ))}
    </span>
  );
}

interface Props {
  /** Drops a step with no `view` from the grid's columns, per the panels
   * screen's "Hide inert columns" toggle. Always `false` for the canvas
   * dock's mount, which offers no filter (`studio-canvas`). */
  hideInert?: boolean;
  /** Shows the column and row bulk toggle badges. Only the panels-screen
   * wrapper (`FieldMatrixPanel`) sets this; the dock mount leaves it unset,
   * per design.md decision 6. */
  showBulkBadges?: boolean;
}

/**
 * The bare field matrix grid: every catalog field against every workflow
 * step (`studio-app`'s field-matrix requirements). A `role="grid"` table
 * with a roving tabindex — the whole grid is one tab stop, arrow keys move
 * inside it (`spa-accessibility`'s two-dimensional-grid requirement).
 *
 * Enter or Space activates the focused live cell, making its three
 * `visible`/`required`/`readonly` controls the grid's only reachable tab
 * stops. Escape, or moving focus away by any other means, hands the one
 * stop back to the grid (design.md decision 4). Every write goes through
 * `setFlag` (`draft/view-flags.ts`), the same writer the form editor's strip
 * uses.
 *
 * This component carries no toolbar, legend or count line — those belong to
 * `FieldMatrixPanel`, the panels-screen wrapper that renders this grid
 * inside itself (design.md decision 6). The canvas dock's Field matrix tab
 * mounts this component directly.
 */
export function FieldMatrixGrid({ hideInert = false, showBulkBadges = false }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const rows = useMemo(() => matrixRows(draft.fields), [draft.fields]);
  const allSteps = draft.workflow?.steps ?? [];
  const drawnSteps = filterInertSteps(allSteps, hideInert);
  const written = useMemo(() => writtenFieldCounts(draft), [draft]);
  const writtenIds = useMemo(() => new Set([...written].filter(([, count]) => count > 0).map(([id]) => id)), [written]);

  const [focus, setFocus] = useState<Focus>({ row: 0, col: 0 });
  const [activated, setActivated] = useState(false);
  const cellRefs = useRef(new Map<string, HTMLTableCellElement>());

  const rowCount = rows.length;
  const colCount = drawnSteps.length;
  const clamp = (n: number, count: number) => Math.max(0, Math.min(n, count - 1));

  const moveFocus = (next: Focus) => {
    if (rowCount === 0 || colCount === 0) return;
    const clamped = { row: clamp(next.row, rowCount), col: clamp(next.col, colCount) };
    setFocus(clamped);
    cellRefs.current.get(cellKey(clamped.row, clamped.col))?.focus();
  };

  const activate = () => {
    const row = rows[focus.row];
    const col = drawnSteps[focus.col];
    if (row && col && cellState(col.step, row.id) === "live") setActivated(true);
  };

  // Enter/Space activates the focused cell; Escape hands the stop back to
  // the grid and refocuses it, since nothing else claimed focus on Escape.
  // Arrow-key roving navigation is suspended while a cell is active: the
  // grid must not steal the arrow keys its own checkboxes need for Tab order.
  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (activated) {
      if (e.key === "Escape") {
        e.preventDefault();
        setActivated(false);
        cellRefs.current.get(cellKey(focus.row, focus.col))?.focus();
      }
      return;
    }
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
        activate();
        break;
    }
  };

  // Moving focus away from the active cell by any means other than Escape
  // (Tab past its last control, a click elsewhere) also deactivates it —
  // but does not steal focus back, unlike the explicit-Escape case above.
  const onCellBlur = (e: FocusEvent<HTMLTableCellElement>) => {
    if (activated && !e.currentTarget.contains(e.relatedTarget as Node)) setActivated(false);
  };

  // Activating a cell moves real focus into its first control — Enter/Space
  // alone only flips `activated`; nothing else places the browser's focus.
  useEffect(() => {
    if (!activated) return;
    const td = cellRefs.current.get(cellKey(focus.row, focus.col));
    td?.querySelector<HTMLElement>("input")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated]);

  const writeFlag = (stepIndex: number, fieldId: string, key: FlagKey, next: BoolOrExpr) => {
    mutate((d) => {
      const fields = d.workflow?.steps?.[stepIndex]?.view?.fields;
      if (!fields) return;
      const idx = fields.findIndex((f) => f.ref === fieldId);
      if (idx === -1) return;
      fields[idx] = setFlag(fields[idx]!, key, next);
    });
  };

  const applyBulk = (targets: BulkTarget[], key: FlagKey) => {
    mutate((d) => {
      const steps = d.workflow?.steps;
      if (steps) applyBulkToggle(steps, targets, key, written);
    });
  };

  return (
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
            {drawnSteps.map(({ step, index: stepIndex }, colIndex) => {
              const inert = step.view === undefined;
              const colTargets = showBulkBadges ? columnLiveTargets(rows, step, stepIndex) : [];
              return (
                <th key={step.id ?? colIndex} scope="col" className="studio-matrix-col-header" data-inert={inert || undefined}>
                  <span className="studio-matrix-col-label">
                    {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                  </span>
                  <span className="studio-matrix-col-key">{step.key}</span>
                  {inert && <span className="studio-matrix-col-note">{t("fieldMatrix.columnInertNote")}</span>}
                  {showBulkBadges && colTargets.length > 0 && (
                    <BulkBadges
                      targets={colTargets}
                      allSteps={allSteps}
                      written={written}
                      onToggle={(key) => applyBulk(colTargets, key)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowTargets = showBulkBadges ? rowLiveTargets(allSteps, row.id) : [];
            return (
              <tr key={row.id} data-group={row.isGroup || undefined}>
                <th scope="row" className="studio-matrix-row-header" data-depth={row.depth}>
                  <span className="studio-matrix-field-key">{row.key === "" ? t("panelsScreen.unnamedField") : row.key}</span>
                  <span
                    className="studio-matrix-field-type"
                    aria-label={`${t("fieldMatrix.rowTypeLabel")}: ${row.type}`}
                  >
                    {row.type}
                  </span>
                  {showBulkBadges && rowTargets.length > 0 && (
                    <BulkBadges
                      targets={rowTargets}
                      allSteps={allSteps}
                      written={written}
                      onToggle={(key) => applyBulk(rowTargets, key)}
                    />
                  )}
                </th>
                {drawnSteps.map(({ step, index: stepIndex }, colIndex) => {
                  const state: CellState = cellState(step, row.id);
                  const entry = state === "live" ? cellEntry(step, row.id)?.entry : undefined;
                  const isFocusCell = focus.row === rowIndex && focus.col === colIndex;
                  const isActiveCell = activated && isFocusCell;
                  const flagged = entry ? isCellFlagged(entry, row.id, row.isGroup, writtenIds) : false;
                  return (
                    <td
                      key={step.id ?? colIndex}
                      ref={(el) => {
                        if (el) cellRefs.current.set(cellKey(rowIndex, colIndex), el);
                        else cellRefs.current.delete(cellKey(rowIndex, colIndex));
                      }}
                      role="gridcell"
                      tabIndex={isFocusCell ? (activated ? -1 : 0) : -1}
                      className="studio-matrix-cell"
                      data-state={state}
                      data-flagged={flagged || undefined}
                      title={flagged ? t("fieldMatrix.flaggedCellMark") : undefined}
                      aria-label={state === "hatched" ? t("fieldMatrix.hatchedCell") : flagged ? t("fieldMatrix.flaggedCellMark") : undefined}
                      onFocus={() => setFocus({ row: rowIndex, col: colIndex })}
                      onBlur={isActiveCell ? onCellBlur : undefined}
                      onClick={() => {
                        setFocus({ row: rowIndex, col: colIndex });
                        if (state === "live") setActivated(true);
                        else setActivated(false);
                      }}
                    >
                      {entry && (
                        <span className="studio-matrix-cell-flags">
                          {FLAG_KEYS.map((key) => {
                            const raw = entry[key];
                            if (isExpression(raw)) {
                              return <CelStamp key={key} label={t(FLAG_LABEL_KEY[key])} src={raw.src ?? ""} />;
                            }
                            const disabled = key !== "visible" && gatedKeys(entry, written).includes(key);
                            return (
                              <input
                                key={key}
                                type="checkbox"
                                aria-label={t(FLAG_LABEL_KEY[key])}
                                tabIndex={isActiveCell ? undefined : -1}
                                checked={effectiveFlag(raw, key) === true}
                                disabled={disabled}
                                onChange={(e) => writeFlag(stepIndex, row.id, key, e.target.checked)}
                              />
                            );
                          })}
                        </span>
                      )}
                      {!entry && state === "blank" && (
                        <span className="studio-matrix-dash" aria-hidden="true">
                          –
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

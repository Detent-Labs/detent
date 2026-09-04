import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { effectiveFlag, isFlagGated, setFlag, writtenFieldCounts, type FlagKey, type WrittenAccessor } from "../draft/view-flags";
import { technicalFieldIds } from "../draft/fields";
import { isDraftViewField, type DraftViewField } from "../draft/view-layout";
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
  eligibleTargetEntries,
  isCellFlagged,
  type CellState,
  type BulkTarget,
} from "./fieldMatrixLogic";

const styles = stylex.create({
  matrixScroll: {
    overflow: "auto",
    overscrollBehavior: "contain",
    border: `1px solid ${colors.border}`,
    maxHeight: "32rem",
  },
  // The dock mount's own cap (D10): 15rem sits just under the dock body's
  // 16rem, leaving the grid nearly the whole budget.
  matrixScrollCompact: {
    maxHeight: "15rem",
  },
  matrixTable: {
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: "0.9rem",
  },
  // `.studio-matrix-corner`/`.studio-matrix-col-header`/`.studio-matrix-row-header`
  // share position/background/text-align/vertical-align in app.css's own
  // combined selector; each entry below folds that declaration in.
  matrixColHeader: {
    position: "sticky",
    background: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    top: 0,
    width: "11rem",
    padding: space.s2,
    borderBottom: `2px solid ${colors.divider}`,
    zIndex: 2,
  },
  matrixCorner: {
    position: "sticky",
    background: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    top: 0,
    width: "11rem",
    padding: space.s2,
    borderBottom: `2px solid ${colors.divider}`,
    left: 0,
    zIndex: 3,
  },
  matrixColLabel: {
    display: "block",
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  matrixColKey: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    color: colors.text,
    overflowWrap: "anywhere",
  },
  matrixColNote: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    marginTop: space.s1,
  },
  matrixRowHeader: {
    position: "sticky",
    background: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    left: 0,
    width: "11rem",
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderRight: `2px solid ${colors.divider}`,
    borderBottom: `1px solid ${colors.border}`,
  },
  // A group field's children indent once, matching the rail's own cap.
  matrixRowHeaderIndented: {
    paddingLeft: space.s6,
  },
  matrixRowHeaderGroup: {
    color: colors.text,
    fontWeight: 600,
  },
  matrixFieldKey: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    overflowWrap: "anywhere",
  },
  matrixFieldType: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  matrixCell: {
    borderBottom: `1px solid ${colors.border}`,
    borderRight: `1px solid ${colors.border}`,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    verticalAlign: "top",
    minWidth: "6rem",
    cursor: "default",
    ":focus-visible": {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "-2px",
    },
  },
  matrixCellFlagged: {
    boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${colors.refusal} 55%, transparent)`,
  },
  matrixCellHatched: {
    backgroundImage: `repeating-linear-gradient(-45deg, ${colors.surfaceMuted}, ${colors.surfaceMuted} 3px, ${colors.surface} 3px, ${colors.surface} 8px)`,
    cursor: "not-allowed",
  },
  matrixCellLive: {
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  matrixCellFlags: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1.75rem)",
    columnGap: 0,
    justifyItems: "center",
    alignItems: "center",
  },
  matrixDash: {
    display: "block",
    fontFamily: fonts.mono,
    color: colors.neutral500,
  },
  // `.studio-matrix-cell input[aria-disabled="true"]`: the gated checkbox's
  // own computed style already knows `gated`.
  matrixFlagCheckboxDisabled: {
    opacity: 0.45,
  },
  matrixFlagVisible: {
    accentColor: colors.flagVisible,
  },
  matrixFlagRequired: {
    accentColor: colors.flagRequired,
  },
  matrixFlagReadonly: {
    accentColor: colors.flagReadonly,
  },
  matrixCel: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s1,
    minWidth: 0,
    paddingBlock: space.s1,
    paddingInline: 0,
  },
  matrixCelStamp: {
    fontFamily: fonts.mono,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.accent,
    border: "2px solid currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
    flex: "none",
  },
  matrixCelSrc: {
    fontFamily: fonts.mono,
    fontSize: "10px",
    color: colors.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  matrixFlags: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1.75rem)",
    columnGap: 0,
    justifyItems: "center",
    marginTop: space.s2,
  },
  matrixFlagBadge: {
    fontFamily: fonts.mono,
    fontSize: "11px",
    lineHeight: 1.6,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    width: "1.75rem",
    textAlign: "center",
    color: colors.textMuted,
    background: "none",
    border: `1px solid ${colors.border}`,
    paddingBlock: 0,
    paddingInline: space.s1,
    cursor: "pointer",
    ":hover": {
      background: colors.surfaceMuted,
      color: colors.text,
    },
  },
  // `[aria-pressed="true"]`: a JS-computed choice reading the same
  // `aria-pressed` the button already carries.
  matrixFlagBadgePressed: {
    color: colors.accentContrast,
    background: colors.accent,
    borderColor: colors.accent,
  },
  matrixFlagEmpty: {
    height: "1.125rem",
    visibility: "hidden",
  },
});

// `CellState`'s three values, exhaustive: `blank` earns no extra style,
// matching today's stylesheet (task 6.1's re-audit). Untyped, since
// `matrixCellLive` carries only a `:hover` key and so infers a narrower
// shape than the general `StyleXStyles` type accepts.
const MATRIX_CELL_STATE_STYLE = {
  hatched: styles.matrixCellHatched,
  live: styles.matrixCellLive,
  blank: undefined,
} satisfies Record<CellState, unknown>;

const MATRIX_FLAG_ACCENT_STYLE: Record<FlagKey, stylex.StyleXStyles> = {
  visible: styles.matrixFlagVisible,
  required: styles.matrixFlagRequired,
  readonly: styles.matrixFlagReadonly,
};

export const FLAG_KEYS: FlagKey[] = ["visible", "required", "readonly"];
const FLAG_LETTER: Record<FlagKey, string> = { visible: "VIS", required: "REQ", readonly: "RO" };
export const FLAG_LABEL_KEY = {
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
    <span {...stylex.props(styles.matrixCel)} title={`${label}: ${src}`}>
      <span {...stylex.props(styles.matrixCelStamp)}>{t("formEditor.markCel")}</span>
      <span {...stylex.props(styles.matrixCelSrc)}>{src}</span>
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
  technicalFieldIds,
  onToggle,
}: {
  targets: BulkTarget[];
  allSteps: Parameters<typeof bulkBadgeOn>[0];
  written: WrittenAccessor;
  technicalFieldIds: Set<string>;
  onToggle: (key: FlagKey) => void;
}) {
  // A key whose eligible target set is empty (e.g. required/readonly on a
  // technical field's row) gets no badge at all — a button that answers no
  // click reads as broken, per studio-app's bulk-toggle requirement. Its
  // grid slot stays, as an empty placeholder, so the remaining badges never
  // shift out of alignment with the checkbox columns below them
  // (studio-app's bulk-toggle column-alignment requirement).
  const eligible = FLAG_KEYS.filter(
    (key) => eligibleTargetEntries(allSteps, targets, key, written, technicalFieldIds).length > 0,
  );
  return (
    <span {...stylex.props(styles.matrixFlags)}>
      {FLAG_KEYS.map((key) => {
        if (!eligible.includes(key)) return <span key={key} aria-hidden="true" {...stylex.props(styles.matrixFlagEmpty)} />;
        const pressed = bulkBadgeOn(allSteps, targets, key, written, technicalFieldIds);
        return (
          <button
            key={key}
            type="button"
            {...stylex.props(styles.matrixFlagBadge, pressed && styles.matrixFlagBadgePressed)}
            aria-pressed={pressed}
            aria-label={t(FLAG_LABEL_KEY[key])}
            title={t(FLAG_LABEL_KEY[key])}
            onClick={() => onToggle(key)}
          >
            {FLAG_LETTER[key]}
          </button>
        );
      })}
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
  /** Caps the scroll box at 15rem instead of its own 32rem default, to fit
   * the dock body's 16rem budget (D10). Only `EditorDock.tsx`'s mount sets
   * this. */
  compact?: boolean;
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
export function FieldMatrixGrid({ hideInert = false, showBulkBadges = false, compact = false }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const rows = useMemo(() => matrixRows(draft.fields), [draft.fields]);
  const allSteps = draft.workflow?.steps ?? [];
  const drawnSteps = filterInertSteps(allSteps, hideInert);
  const written = useMemo(() => writtenFieldCounts(draft), [draft]);
  const technicalIds = useMemo(() => technicalFieldIds(draft.fields), [draft.fields]);

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
      const idx = fields.findIndex((f) => isDraftViewField(f) && f.ref === fieldId);
      if (idx === -1) return;
      fields[idx] = setFlag(fields[idx] as DraftViewField, key, next);
    });
  };

  const applyBulk = (targets: BulkTarget[], key: FlagKey) => {
    mutate((d) => {
      const steps = d.workflow?.steps;
      if (steps) applyBulkToggle(steps, targets, key, written, technicalIds);
    });
  };

  return (
    <div
      {...stylex.props(styles.matrixScroll, compact && styles.matrixScrollCompact)}
      tabIndex={0}
      aria-label={t("fieldMatrix.scrollRegionLabel")}
    >
      <table {...stylex.props(styles.matrixTable)} role="grid" aria-label={t("fieldMatrix.heading")} onKeyDown={onGridKeyDown}>
        <thead>
          <tr>
            <th scope="col" {...stylex.props(styles.matrixCorner)} />
            {drawnSteps.map(({ step, index: stepIndex }, colIndex) => {
              const inert = step.view === undefined;
              const colTargets = showBulkBadges ? columnLiveTargets(rows, step, stepIndex) : [];
              return (
                <th key={step.id ?? colIndex} scope="col" {...stylex.props(styles.matrixColHeader)} data-inert={inert || undefined}>
                  <span {...stylex.props(styles.matrixColLabel)}>
                    {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                  </span>
                  <span {...stylex.props(styles.matrixColKey)}>{step.key}</span>
                  {inert && <span {...stylex.props(styles.matrixColNote)}>{t("fieldMatrix.columnInertNote")}</span>}
                  {showBulkBadges && colTargets.length > 0 && (
                    <BulkBadges
                      targets={colTargets}
                      allSteps={allSteps}
                      written={written}
                      technicalFieldIds={technicalIds}
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
                <th
                  scope="row"
                  {...stylex.props(
                    styles.matrixRowHeader,
                    row.depth === 1 && styles.matrixRowHeaderIndented,
                    row.isGroup && styles.matrixRowHeaderGroup,
                  )}
                  data-depth={row.depth}
                  data-technical={technicalIds.has(row.id) || undefined}
                >
                  <span {...stylex.props(styles.matrixFieldKey)}>{row.key === "" ? t("panelsScreen.unnamedField") : row.key}</span>
                  <span {...stylex.props(styles.matrixFieldType)} aria-label={`${t("fieldMatrix.rowTypeLabel")}: ${row.type}`}>
                    {row.type}
                  </span>
                  {technicalIds.has(row.id) && (
                    <span className="studio-matrix-row-technical" title={t("fieldMatrix.legendTechnical")}>
                      {t("fieldMatrix.technicalRowMark")}
                    </span>
                  )}
                  {showBulkBadges && rowTargets.length > 0 && (
                    <BulkBadges
                      targets={rowTargets}
                      allSteps={allSteps}
                      written={written}
                      technicalFieldIds={technicalIds}
                      onToggle={(key) => applyBulk(rowTargets, key)}
                    />
                  )}
                </th>
                {drawnSteps.map(({ step, index: stepIndex }, colIndex) => {
                  const state: CellState = cellState(step, row.id);
                  const entry = state === "live" ? cellEntry(step, row.id)?.entry : undefined;
                  const isFocusCell = focus.row === rowIndex && focus.col === colIndex;
                  const isActiveCell = activated && isFocusCell;
                  const flagged = entry ? isCellFlagged(entry, row.id, row.isGroup, written, stepIndex) : false;
                  return (
                    <td
                      key={step.id ?? colIndex}
                      ref={(el) => {
                        if (el) cellRefs.current.set(cellKey(rowIndex, colIndex), el);
                        else cellRefs.current.delete(cellKey(rowIndex, colIndex));
                      }}
                      role="gridcell"
                      tabIndex={isFocusCell ? (activated ? -1 : 0) : -1}
                      {...stylex.props(styles.matrixCell, MATRIX_CELL_STATE_STYLE[state], flagged && styles.matrixCellFlagged)}
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
                        <span {...stylex.props(styles.matrixCellFlags)}>
                          {FLAG_KEYS.map((key) => {
                            const raw = entry[key];
                            if (isExpression(raw)) {
                              return <CelStamp key={key} label={t(FLAG_LABEL_KEY[key])} src={raw.src ?? ""} />;
                            }
                            const gated = key !== "visible" && isFlagGated(entry, written, technicalIds, key, stepIndex);
                            return (
                              <input
                                key={key}
                                type="checkbox"
                                {...stylex.props(MATRIX_FLAG_ACCENT_STYLE[key], gated && styles.matrixFlagCheckboxDisabled)}
                                aria-label={t(FLAG_LABEL_KEY[key])}
                                aria-disabled={gated || undefined}
                                tabIndex={gated || !isActiveCell ? -1 : undefined}
                                checked={effectiveFlag(raw, key) === true}
                                onChange={(e) => {
                                  if (gated) return;
                                  writeFlag(stepIndex, row.id, key, e.target.checked);
                                }}
                              />
                            );
                          })}
                        </span>
                      )}
                      {!entry && state === "blank" && (
                        <span {...stylex.props(styles.matrixDash)} aria-hidden="true">
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

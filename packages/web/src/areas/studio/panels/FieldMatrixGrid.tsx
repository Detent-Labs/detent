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
  bulkBadgeState,
  bulkBadgeCounts,
  type BulkBadgeState,
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
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    maxHeight: "32rem",
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
    outlineOffset: -2,
    position: "sticky",
    backgroundColor: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    top: 0,
    width: "11rem",
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    zIndex: 2,
  },
  matrixCorner: {
    outlineOffset: -2,
    position: "sticky",
    backgroundColor: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    top: 0,
    width: "11rem",
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
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
    outlineOffset: -2,
    position: "sticky",
    backgroundColor: colors.surface,
    textAlign: "left",
    verticalAlign: "top",
    left: 0,
    width: "11rem",
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderRightWidth: 2,
    borderRightStyle: "solid",
    borderRightColor: colors.divider,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
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
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
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
      backgroundColor: colors.surfaceMuted,
    },
  },
  matrixCellFlags: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1.75rem)",
    columnGap: 0,
    justifyItems: "center",
    alignItems: "center",
  },
  // The blank cell's dash. It read `neutral500`, a ramp step, which the
  // design language forbids a component from touching and which measured
  // 2.586:1 on this ground. `textMuted` is the role that means this, and it
  // measures 5.835:1.
  matrixEmpty: {
    color: colors.textMuted,
    marginBlock: 0,
    paddingBlock: space.s4,
    paddingInline: space.s3,
  },
  matrixDash: {
    display: "block",
    fontFamily: fonts.mono,
    color: colors.textMuted,
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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
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
    backgroundColor: "transparent",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: 0,
    paddingInline: space.s1,
    cursor: "pointer",
    ":hover": {
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
    },
  },
  // `[aria-pressed="true"]`: a JS-computed choice reading the same
  // `aria-pressed` the button already carries.
  //
  // The fill is the flag's own color, never the accent. Three reasons, in
  // order. The legend twelve pixels away names these three colors, so a REQ
  // badge that filled with the accent would contradict the key beside it.
  // The accent marks state and the one primary action per screen
  // (`design-language.md`), and Publish already holds it. And the accent
  // fill clears AA by 0.025 under this badge's own 11px text, at 4.525:1;
  // each flag color measures 6.4:1 or better, in both schemes.
  matrixFlagBadgePressedVisible: {
    color: colors.accentContrast,
    backgroundColor: colors.flagVisible,
    borderColor: colors.flagVisible,
  },
  matrixFlagBadgePressedRequired: {
    color: colors.accentContrast,
    backgroundColor: colors.flagRequired,
    borderColor: colors.flagRequired,
  },
  matrixFlagBadgePressedReadonly: {
    color: colors.accentContrast,
    backgroundColor: colors.flagReadonly,
    borderColor: colors.flagReadonly,
  },
  // The mixed state: the flag's color on the border and the label, and no
  // fill. The fill is what separates it from the pressed state, so an author
  // reads flag and state from one mark. Each flag's color measures 6.4:1 or
  // better as text on this ground, in both schemes.
  matrixFlagBadgeMixedVisible: {
    color: colors.flagVisible,
    borderColor: colors.flagVisible,
  },
  matrixFlagBadgeMixedRequired: {
    color: colors.flagRequired,
    borderColor: colors.flagRequired,
  },
  matrixFlagBadgeMixedReadonly: {
    color: colors.flagReadonly,
    borderColor: colors.flagReadonly,
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

/** The pressed fill, per flag. Mirrors `FLAG_SWATCH_STYLE` in the panel's
 * legend, so the badge and the key it explains read one color each. */
const FLAG_BADGE_PRESSED: Record<FlagKey, stylex.StyleXStyles> = {
  visible: styles.matrixFlagBadgePressedVisible,
  required: styles.matrixFlagBadgePressedRequired,
  readonly: styles.matrixFlagBadgePressedReadonly,
};

/** The mixed fill, per flag. Same shape as the pressed lookup above. */
const FLAG_BADGE_MIXED: Record<FlagKey, stylex.StyleXStyles> = {
  visible: styles.matrixFlagBadgeMixedVisible,
  required: styles.matrixFlagBadgeMixedRequired,
  readonly: styles.matrixFlagBadgeMixedReadonly,
};

/** The style a badge takes for the state its cells are in. */
const badgeStateStyle = (state: BulkBadgeState, key: FlagKey): stylex.StyleXStyles | false =>
  state === "full" ? FLAG_BADGE_PRESSED[key] : state === "mixed" ? FLAG_BADGE_MIXED[key] : false;

/** `aria-pressed` takes all three states. A tri-state toggle button says
 * `mixed`, which is exactly what a partly-set column is. */
const badgeAriaPressed = (state: BulkBadgeState): boolean | "mixed" =>
  state === "full" ? true : state === "mixed" ? "mixed" : false;
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
 * bulk-toggle requirement). Reads `bulkBadgeState` for `aria-pressed`,
 * which takes all three states, and writes through `applyBulkToggle` inside
 * one `mutate()` call. */
function BulkBadges({
  active,
  targets,
  allSteps,
  written,
  technicalFieldIds,
  scope,
  onToggle,
}: {
  targets: BulkTarget[];
  /** Which axis this badge group acts on, and what that target is called.
   * The accessible name carries both, so thirty badges stop sharing three
   * names between them. */
  scope: { kind: "column" | "row"; name: string };
  /** True while this header holds the grid's focus and the author has
   * activated it. Only then do its badges take the keyboard. */
  active: boolean;
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
        const state = bulkBadgeState(allSteps, targets, key, written, technicalFieldIds);
        const counts = bulkBadgeCounts(allSteps, targets, key, written, technicalFieldIds);
        // The flag's own word is a complete label. The blast radius is a
        // complete sentence. Joining two whole labels is not the same as
        // building one sentence out of fragments.
        const radius =
          state === "full"
            ? t(scope.kind === "column" ? "fieldMatrix.bulkClearColumn" : "fieldMatrix.bulkClearRow")
                .replace("{total}", String(counts.total))
                .replace("{name}", scope.name)
            : t(scope.kind === "column" ? "fieldMatrix.bulkSetColumn" : "fieldMatrix.bulkSetRow")
                .replace("{total}", String(counts.total))
                .replace("{set}", String(counts.alreadySet))
                .replace("{name}", scope.name);
        const name = `${t(FLAG_LABEL_KEY[key])}. ${radius}`;
        return (
          <button
            key={key}
            type="button"
            {...stylex.props(styles.matrixFlagBadge, badgeStateStyle(state, key))}
            aria-pressed={badgeAriaPressed(state)}
            tabIndex={active ? undefined : -1}
            aria-label={name}
            title={name}
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
   * screen's "Hide inert columns" toggle. */
  hideInert?: boolean;
  /** Shows the column and row bulk toggle badges. Only the panels-screen
   * wrapper (`FieldMatrixPanel`) sets this, per design.md decision 6. */
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
 * inside itself (design.md decision 6).
 */
export function FieldMatrixGrid({ hideInert = false, showBulkBadges = false }: Props) {
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
  // Headers join the roving model when they carry bulk badges, so a badge
  // takes no tab stop of its own (`spa-accessibility`: "A control inside a
  // grid cell joins the grid's roving model"). Row -1 is the header row and
  // col -1 the header column; together they reach the corner.
  const headerFloor = showBulkBadges ? -1 : 0;
  const clamp = (n: number, count: number, min: number) => Math.max(min, Math.min(n, count - 1));

  const moveFocus = (next: Focus) => {
    if (rowCount === 0 || colCount === 0) return;
    const clamped = {
      row: clamp(next.row, rowCount, headerFloor),
      col: clamp(next.col, colCount, headerFloor),
    };
    setFocus(clamped);
    cellRefs.current.get(cellKey(clamped.row, clamped.col))?.focus();
  };

  const activate = () => {
    // A header carrying badges activates the way a live cell does: the
    // gesture is one Enter, and the controls inside become reachable.
    if (focus.row === -1 || focus.col === -1) {
      if (showBulkBadges) setActivated(true);
      return;
    }
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
    // A data cell holds checkboxes and a header holds bulk badges, so the
    // first control is an `input` in one case and a `button` in the other.
    // Looking only for `input` left an activated header with focus still on
    // the `th` and the arrow keys already suspended, which reads as a dead
    // Enter.
    const cell = cellRefs.current.get(cellKey(focus.row, focus.col));
    cell?.querySelector<HTMLElement>("input, button")?.focus();
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

  // An empty state says so in words, and names which of its two causes
  // applies (`studio-app`: "The field matrix states an empty result in
  // words"). A header row above no row is what this replaces.
  if (rows.length === 0 || drawnSteps.length === 0) {
    return (
      <p {...stylex.props(styles.matrixEmpty)} role="status">
        {t(rows.length === 0 ? "fieldMatrix.emptyNoFields" : "fieldMatrix.emptyNoColumns")}
      </p>
    );
  }

  return (
    <div
      {...stylex.props(styles.matrixScroll)}
      tabIndex={0}
      aria-label={t("fieldMatrix.scrollRegionLabel")}
    >
      <table {...stylex.props(styles.matrixTable)} role="grid" aria-label={t("fieldMatrix.heading")} onKeyDown={onGridKeyDown}>
        <thead>
          <tr>
            <th
              scope="col"
              {...stylex.props(styles.matrixCorner)}
              ref={(el) => {
                if (!showBulkBadges) return;
                if (el) cellRefs.current.set(cellKey(-1, -1), el);
                else cellRefs.current.delete(cellKey(-1, -1));
              }}
              tabIndex={showBulkBadges && focus.row === -1 && focus.col === -1 && !activated ? 0 : -1}
              onFocus={() => showBulkBadges && setFocus({ row: -1, col: -1 })}
              onBlur={activated && focus.row === -1 && focus.col === -1 ? onCellBlur : undefined}
            />
            {drawnSteps.map(({ step, index: stepIndex }, colIndex) => {
              const inert = step.view === undefined;
              const colTargets = showBulkBadges ? columnLiveTargets(rows, step, stepIndex) : [];
              return (
                <th
                  key={step.id ?? colIndex}
                  scope="col"
                  {...stylex.props(styles.matrixColHeader)}
                  data-inert={inert || undefined}
                  ref={(el) => {
                    if (!showBulkBadges) return;
                    if (el) cellRefs.current.set(cellKey(-1, colIndex), el);
                    else cellRefs.current.delete(cellKey(-1, colIndex));
                  }}
                  tabIndex={showBulkBadges && focus.row === -1 && focus.col === colIndex && !activated ? 0 : -1}
                  onFocus={() => showBulkBadges && setFocus({ row: -1, col: colIndex })}
                  onBlur={activated && focus.row === -1 && focus.col === colIndex ? onCellBlur : undefined}
                >
                  <span {...stylex.props(styles.matrixColLabel)}>
                    {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                  </span>
                  <span {...stylex.props(styles.matrixColKey)}>{step.key}</span>
                  {inert && <span {...stylex.props(styles.matrixColNote)}>{t("fieldMatrix.columnInertNote")}</span>}
                  {showBulkBadges && colTargets.length > 0 && (
                    <BulkBadges
                      targets={colTargets}
                      active={activated && focus.row === -1 && focus.col === colIndex}
                      scope={{
                        kind: "column",
                        name:
                          resolveDraftLocalizedText(step.label, contentLocale, baseLocale) ||
                          step.key ||
                          t("steps.unnamedStep"),
                      }}
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
                  ref={(el) => {
                    if (!showBulkBadges) return;
                    if (el) cellRefs.current.set(cellKey(rowIndex, -1), el);
                    else cellRefs.current.delete(cellKey(rowIndex, -1));
                  }}
                  tabIndex={showBulkBadges && focus.col === -1 && focus.row === rowIndex && !activated ? 0 : -1}
                  onFocus={() => showBulkBadges && setFocus({ row: rowIndex, col: -1 })}
                  onBlur={activated && focus.col === -1 && focus.row === rowIndex ? onCellBlur : undefined}
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
                      active={activated && focus.col === -1 && focus.row === rowIndex}
                      scope={{ kind: "row", name: row.key === "" ? t("panelsScreen.unnamedField") : row.key }}
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
                            // A gated control that says nothing reads as
                            // broken. The two rules that gate a cell carry
                            // different reasons, so the words say which one.
                            const gateReason = gated
                              ? t(technicalIds.has(row.id) ? "fieldMatrix.gatedTechnical" : "fieldMatrix.gatedNotWritten")
                              : undefined;
                            return (
                              <input
                                key={key}
                                type="checkbox"
                                {...stylex.props(MATRIX_FLAG_ACCENT_STYLE[key], gated && styles.matrixFlagCheckboxDisabled)}
                                aria-label={gateReason ? `${t(FLAG_LABEL_KEY[key])}. ${gateReason}` : t(FLAG_LABEL_KEY[key])}
                                title={gateReason}
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

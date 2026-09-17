import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { GripVertical } from "lucide-react";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import type { StepKind } from "../draft/createStep.js";
import { railRowIssues } from "./stepRailRow.js";

/** The width below which the Steps tab stands one column, so the rail gives
 * up its own and caps its height instead of pushing the step page a screen
 * down. `EntityTabs` turns its own rail at this same width. */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  rail: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    borderRightWidth: { default: 2, [NARROW]: 0 },
    borderRightStyle: "solid",
    borderRightColor: colors.divider,
    // Above the breakpoint the Steps tab's own grid row bounds the rail: the
    // edit screen takes the viewport's height rather than its content's, so
    // the row stretches to what is left and `overflow-y: auto` above scrolls
    // the rows inside it. Below it the rail stands over the step page instead
    // of beside it, where no row bounds anything, so it caps itself.
    maxHeight: { default: "none", [NARROW]: "20rem" },
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // One rail row holds three controls: the step itself and its two reorder
  // controls. The wrapper carries the ledger hairline the single button
  // carried in the register, so the three still read as one row.
  row: {
    display: "flex",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // The row's identity, and the whole of what a press selects.
  rowMain: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flex: "1 1 auto",
    minWidth: 0,
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // Reads the same `aria-current` the button already carries, per
  // `design-language.md`'s rule against a hand-written state selector.
  rowMainCurrent: {
    backgroundColor: colors.surfaceMuted,
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
  },
  // The step's place in the draft's own order. A number that aligns down a
  // column, so mono with tabular figures.
  number: {
    flex: "none",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  name: {
    flex: "1 1 auto",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  nameCurrent: {
    fontWeight: 800,
  },
  badge: {
    flex: "none",
    alignSelf: "center",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: 11,
    fontWeight: 600,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  badgeBlocker: {
    color: colors.refusal,
  },
  badgeAdvisory: {
    color: colors.textMuted,
  },
  // The drag handle, at the row's trailing edge, in the chevrons' old
  // position. Padding gives it a 24x24 CSS pixel hit area independent of the
  // 18px icon inside it (`spa-accessibility`'s pointer-target minimum).
  grip: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    minWidth: 24,
    minHeight: 24,
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: { default: colors.textMuted, ":disabled": colors.textMuted },
    borderWidth: 0,
    paddingBlock: space.s1,
    paddingInline: space.s1,
    font: "inherit",
    opacity: { default: 1, ":disabled": 0.45 },
    cursor: { default: "grab", ":disabled": "not-allowed" },
  },
  // The dragged row: "this row is momentarily not where it belongs"
  // (design.md), the same 45% opacity a disabled control already uses. No
  // shadow, no radius, no lift.
  rowDragging: {
    opacity: 0.45,
  },
  // The drop-position indicator: the same `boxShadow` mechanism
  // `rowMainCurrent` uses for its own 3px mark, turned horizontal. It marks
  // the gap immediately before this row.
  rowDropBefore: {
    boxShadow: `inset 0 3px 0 0 ${colors.accent}`,
  },
  // The same mark, on this row's trailing edge, for the one gap after the
  // last row.
  rowDropAfter: {
    boxShadow: `inset 0 -3px 0 0 ${colors.accent}`,
  },
  // The foot: the three add controls. The 2px divider is the structural rule
  // between the steps above and the controls below.
  foot: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.s2,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    paddingBlock: space.s3,
    paddingInline: space.s3,
  },
  footHeading: {
    margin: 0,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    marginBlock: 0,
  },
});

/** The three add controls in the rail's foot, in the palette's own order. */
const ADD_CONTROLS: { kind: StepKind; label: "stepsRail.addStep" | "stepsRail.addSubprocess" | "stepsRail.addEnd" }[] = [
  { kind: "task", label: "stepsRail.addStep" },
  { kind: "subprocess", label: "stepsRail.addSubprocess" },
  { kind: "end", label: "stepsRail.addEnd" },
];

interface Props {
  /** The step the step page holds. `ProcessSurface` owns it, so the canvas
   * and this rail cannot disagree about which step is current. */
  currentStepId: string | undefined;
  onSelectStep: (stepId: string) => void;
  /** Moves one step to a target index in the draft's own `workflow.steps` order. The rail
   * hands the row's step id and the target index. */
  onMove: (stepId: string, toIndex: number) => void;
  onAddStep: (kind: StepKind) => void;
}

/**
 * The Steps tab's leading column (`studio-step-page`: "The steps rail lists
 * each step in the draft's own order"). One ruled row per step, numbered,
 * each carrying its label and its open issue count.
 *
 * The rail lists the draft's own `workflow.steps` order. No walk over the
 * paths decides where a row stands, and a move control writes that same
 * `workflow.steps` order back, which is what the canvas's Up/Down traversal
 * and the serialized definition both read.
 */
export function StepsRail({ currentStepId, onSelectStep, onMove, onAddStep }: Props) {
  const { draft, validation, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const ordered = draft.workflow?.steps ?? [];
  const footHeadingId = "studio-steps-rail-add";
  // The row index currently picked up, and the nearest drop gap (0..ordered.length,
  // a gap index counted in the array's own numbering: gap `i` sits immediately
  // before row `i`, and gap `ordered.length` sits after the last row).
  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);
  const [dropGap, setDropGap] = useState<number | undefined>(undefined);
  const dragging = dragIndex !== undefined;

  const endDrag = () => {
    setDragIndex(undefined);
    setDropGap(undefined);
  };

  return (
    <nav {...stylex.props(styles.rail)} aria-label={t("stepsRail.label")}>
      {ordered.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t("stepsRail.empty")}</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {ordered.map((step, i) => {
            const issues = railRowIssues(validation.issues, step);
            const current = step.id !== undefined && step.id === currentStepId;
            const label = resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep");
            const gripDisabled = step.id === undefined || ordered.length <= 1;
            const dropBefore = dragging && dropGap === i;
            const dropAfter = dragging && dropGap === ordered.length && i === ordered.length - 1;
            return (
              <li
                key={step.id ?? `unsaved-${i}`}
                {...stylex.props(
                  styles.row,
                  i === dragIndex && styles.rowDragging,
                  dropBefore && styles.rowDropBefore,
                  dropAfter && styles.rowDropAfter,
                )}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const midpoint = rect.top + rect.height / 2;
                  setDropGap(e.clientY < midpoint ? i : i + 1);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === undefined || dropGap === undefined) {
                    endDrag();
                    return;
                  }
                  const moved = ordered[dragIndex];
                  if (moved?.id !== undefined) {
                    const target = dropGap > dragIndex ? dropGap - 1 : dropGap;
                    onMove(moved.id, target);
                  }
                  endDrag();
                }}
              >
                <button
                  type="button"
                  {...stylex.props(styles.rowMain, current && styles.rowMainCurrent)}
                  aria-current={current ? "true" : undefined}
                  disabled={step.id === undefined}
                  onClick={() => step.id !== undefined && onSelectStep(step.id)}
                >
                  <span {...stylex.props(styles.number)}>{i + 1}</span>
                  <span {...stylex.props(styles.name, current && styles.nameCurrent)}>{label}</span>
                  {issues.count > 0 && (
                    <span
                      {...stylex.props(styles.badge, issues.blocker ? styles.badgeBlocker : styles.badgeAdvisory)}
                      aria-label={`${issues.count} ${t(issues.count === 1 ? "stepsRail.issueMarkOne" : "stepsRail.issueMark")}`}
                    >
                      {issues.count}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  {...stylex.props(styles.grip)}
                  aria-label={t("stepsRail.dragHandle").replace("{step label}", label)}
                  draggable={!gripDisabled}
                  disabled={gripDisabled}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setDragIndex(i);
                  }}
                  onDragEnd={endDrag}
                >
                  <GripVertical size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <section {...stylex.props(styles.foot)} aria-labelledby={footHeadingId}>
        <h2 {...stylex.props(styles.footHeading)} id={footHeadingId}>
          {t("stepsRail.addLegend")}
        </h2>
        {ADD_CONTROLS.map(({ kind, label }) => (
          <button key={kind} type="button" className="btn btn-secondary" onClick={() => onAddStep(kind)}>
            {t(label)}
          </button>
        ))}
      </section>
    </nav>
  );
}

import * as stylex from "@stylexjs/stylex";
import { ChevronDown, ChevronUp } from "lucide-react";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { registerOrder } from "../draft/registerOrder.js";
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
  // The step's place in the walk. A number that aligns down a column, so
  // mono with tabular figures.
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
  move: {
    display: "flex",
    alignItems: "center",
    flex: "none",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: { default: colors.textMuted, ":disabled": colors.textMuted },
    borderWidth: 0,
    paddingBlock: 0,
    paddingInline: space.s1,
    font: "inherit",
    opacity: { default: 1, ":disabled": 0.45 },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
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
  /** Swaps two steps in the draft's own `workflow.steps` order. The rail
   * hands the row's step and the neighbour it trades places with, so the
   * caller needs no index of its own. */
  onReorder: (stepId: string, neighbourId: string) => void;
  onAddStep: (kind: StepKind) => void;
}

/**
 * The Steps tab's leading column (`studio-step-page`: "The steps rail lists
 * each step by number and label"). One ruled row per step, numbered, each
 * carrying its label and its open issue count.
 *
 * The steps rail's order is `registerOrder`'s reachability order. Reordering
 * writes the draft's own `workflow.steps` order, which is what the canvas's
 * Up/Down traversal and the serialized definition both read; the rail's own
 * order stays derived from the graph.
 */
export function StepsRail({ currentStepId, onSelectStep, onReorder, onAddStep }: Props) {
  const { draft, validation, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const ordered = registerOrder(draft.workflow?.steps, draft.workflow?.initialStep);
  const footHeadingId = "studio-steps-rail-add";

  return (
    <nav {...stylex.props(styles.rail)} aria-label={t("stepsRail.label")}>
      {ordered.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t("stepsRail.empty")}</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {ordered.map((step, i) => {
            const issues = railRowIssues(validation.issues, step);
            const current = step.id !== undefined && step.id === currentStepId;
            const earlier = ordered[i - 1]?.id;
            const later = ordered[i + 1]?.id;
            return (
              <li key={step.id ?? `unsaved-${i}`} {...stylex.props(styles.row)}>
                <button
                  type="button"
                  {...stylex.props(styles.rowMain, current && styles.rowMainCurrent)}
                  aria-current={current ? "true" : undefined}
                  disabled={step.id === undefined}
                  onClick={() => step.id !== undefined && onSelectStep(step.id)}
                >
                  <span {...stylex.props(styles.number)}>{i + 1}</span>
                  <span {...stylex.props(styles.name, current && styles.nameCurrent)}>
                    {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                  </span>
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
                  {...stylex.props(styles.move)}
                  aria-label={t("stepsRail.moveEarlier")}
                  disabled={step.id === undefined || earlier === undefined}
                  onClick={() => step.id !== undefined && earlier !== undefined && onReorder(step.id, earlier)}
                >
                  <ChevronUp size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  {...stylex.props(styles.move)}
                  aria-label={t("stepsRail.moveLater")}
                  disabled={step.id === undefined || later === undefined}
                  onClick={() => step.id !== undefined && later !== undefined && onReorder(step.id, later)}
                >
                  <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
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

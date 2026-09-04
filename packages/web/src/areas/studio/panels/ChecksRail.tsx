import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { allChecksClear, groupChecksBySource, totalOpenIssueCount } from "../draft/checksRail";
import type { ValidationResult } from "../draft/validation";

const styles = stylex.create({
  checksRail: {
    minWidth: 0,
    overflowY: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    padding: space.s3,
  },
  // The docked, collapsed presentation (`.studio-checks-rail-docked`):
  // `.canvas-inspector` already draws the bordered box around the whole
  // inspector, so this variant draws none of its own.
  checksRailDocked: {
    borderWidth: 0,
    paddingTop: space.s3,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: space.s3,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  // The panels screen's own docked instance, the sibling directly below
  // that screen's two columns. The docked variant above drops all four
  // edges because `.canvas-inspector` boxes the inspector's instance. That
  // screen boxes nothing, so this one draws the other three edges itself,
  // at the 1px weight the rail takes when it stands on its own. The 2px top
  // edge stays: it is the boundary against the columns, the structural
  // weight.
  checksRailFramed: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: colors.border,
    paddingTop: space.s3,
    paddingRight: space.s3,
    paddingBottom: space.s3,
    paddingLeft: space.s3,
  },
  // The canvas ribbon's bar, where the summary stands beside the ribbon's own
  // control rather than at a region's bottom edge. The docked variant's top
  // divider separates the rail from what sits above it; in the bar nothing
  // does, so both it and the margin that carried it drop.
  checksRailInBar: {
    flex: "1 1 auto",
    minWidth: 0,
    marginTop: 0,
    borderTopWidth: 0,
  },
  // `.studio-checks-rail h2`: a descendant selector on a bare `<h2>`.
  checksRailHeading: {
    marginTop: 0,
  },
  checksRailClear: {
    color: colors.text,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.text,
    padding: space.s2,
    marginBlockEnd: space.s3,
    marginBlockStart: 0,
    marginInline: 0,
  },
  checksGroup: {
    paddingBlock: space.s2,
    paddingInline: 0,
    borderTopWidth: { default: 1, ":first-of-type": 0 },
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  checksGroupHeading: {
    marginBlockEnd: space.s1,
    marginBlockStart: 0,
    marginInline: 0,
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  checksGroupHeldBack: {
    margin: 0,
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in srgb, ${colors.refusal} 55%, transparent)`,
    paddingLeft: space.s2,
    fontSize: "0.85rem",
  },
  checksGroupClear: {
    margin: 0,
    color: colors.textMuted,
    fontSize: "0.85rem",
  },
  checksGroupList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  checksGroupIssue: {
    paddingBlock: space.s1,
    paddingInline: 0,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    fontSize: "0.85rem",
  },
  checksGroupNote: {
    margin: 0,
    paddingTop: space.s1,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    color: colors.textMuted,
    fontSize: "0.8rem",
  },
  checksRailSummary: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s2,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    paddingTop: space.s2,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // `.studio-checks-rail-docked .studio-checks-rail-summary`: this file
  // knows `collapsed` at both render sites, so the descendant override
  // becomes a second style applied alongside the base one.
  checksRailSummaryDocked: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
  checksRailSummaryHeading: {
    flex: 1,
    minWidth: 0,
  },
  checksRailSummaryCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  checksRailSummaryHeldBack: {
    color: colors.refusal,
    fontSize: "0.85rem",
  },
});

interface Props {
  validation: ValidationResult;
  /** The loaded draft's `canPublish` report, threaded from `EditorArea`
   * through every one of this rail's four mounts. The all-clear box states a
   * publish verdict, and a rail that never reads the permission states one it
   * cannot verify: an actor without `system:publish` read "ready to publish"
   * here while the menu 900px away refused the act (studio-publish). */
  canPublish: boolean;
  /** True when this rail docks at a bottom edge and opens as a one-line
   * summary, expanding in place when chosen. Two sites take it: the step
   * inspector's bottom edge, and the panels screen's, below that screen's two
   * columns (task 7.4). False beside the canvas, where nothing is selected and
   * the full grouped list always shows. See `studio-checks-rail`'s
   * collapsed-summary requirement. */
  collapsed?: boolean;
  /** True at the panels screen's bottom edge alone, where nothing boxes the
   * rail: it then draws its own right, bottom and left edges. The inspector's
   * docked instance leaves it false and takes `.canvas-inspector`'s box. */
  framed?: boolean;
  /** True in the canvas ribbon's bar alone, where the summary stands beside
   * the ribbon's control instead of at a region's bottom edge. It drops the
   * docked variant's top divider and takes the bar's remaining width. */
  inBar?: boolean;
}

/**
 * The consolidated, source-grouped view of `validation.issues[]`
 * (`studio-checks-rail`). Reads the same array every per-entity `IssueList`
 * placement already filters; this is one more view over it, not a second
 * validation pass.
 */
export function ChecksRail({ validation, canPublish, collapsed = false, framed = false, inBar = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupChecksBySource(validation);
  const clear = allChecksClear(groups);
  const summary = totalOpenIssueCount(groups);
  const showSummary = collapsed && !expanded;

  return (
    <aside
      // `collapsed` also marks a docked instance (true whether the summary
      // or, once chosen, the expanded list shows). The two docked sites draw
      // their own box differently: at the step inspector's bottom edge the
      // rail draws none, since `.canvas-inspector` already provides one, and
      // at the panels screen's bottom edge it draws three of its four edges
      // itself (`framed`), since that screen boxes nothing.
      {...stylex.props(
        styles.checksRail,
        collapsed && styles.checksRailDocked,
        framed && styles.checksRailFramed,
        inBar && styles.checksRailInBar,
      )}
      aria-label={t("checksRail.heading")}
    >
      {showSummary ? (
        <button
          type="button"
          {...stylex.props(styles.checksRailSummary, collapsed && styles.checksRailSummaryDocked)}
          aria-expanded={false}
          aria-controls="studio-checks-rail-groups"
          onClick={() => setExpanded(true)}
        >
          <span {...stylex.props(styles.checksRailSummaryHeading)}>{t("checksRail.heading")}</span>
          {summary.kind === "count" && <span {...stylex.props(styles.checksRailSummaryCount)}>{summary.count}</span>}
          {summary.kind === "held-back" && (
            <span {...stylex.props(styles.checksRailSummaryHeldBack)}>{t("checksRail.heldBack")}</span>
          )}
        </button>
      ) : (
        <>
          <h2 {...stylex.props(styles.checksRailHeading)}>{t("checksRail.heading")}</h2>
          <div id="studio-checks-rail-groups">
            {/* Two sentences, two keys, one box. The first is what this rail
                measured. The second is what the engine reported about this
                actor. Conflating them into one sentence is the defect: the
                rail cannot verify a permission, so it must not assert one. */}
            {clear && (
              <p {...stylex.props(styles.checksRailClear)}>
                {t("checksRail.allClear")}{" "}
                {t(canPublish ? "checksRail.clearReadyToPublish" : "checksRail.clearNeedsPublishPermission")}
              </p>
            )}
            {groups.map((group) => (
              <section key={group.source} {...stylex.props(styles.checksGroup)}>
                {/* The source name is the same untranslated machine value
                    IssueList already prints (`[{issue.source}]`) — a category
                    this validation pipeline itself defines, not authored prose. */}
                <h3 {...stylex.props(styles.checksGroupHeading)}>{group.source}</h3>
                {group.heldBack ? (
                  <p {...stylex.props(styles.checksGroupHeldBack)}>{t("checksRail.heldBack")}</p>
                ) : (
                  <>
                    {group.issues.length === 0 ? (
                      <p {...stylex.props(styles.checksGroupClear)}>{t("checksRail.groupClear")}</p>
                    ) : (
                      <ul {...stylex.props(styles.checksGroupList)}>
                        {group.issues.map((issue, i) => (
                          <li key={i} {...stylex.props(styles.checksGroupIssue)}>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {group.registryConfigHeldBack && (
                      <p {...stylex.props(styles.checksGroupNote)}>{t("checksRail.configHeldBack")}</p>
                    )}
                    {group.unknownKeysHeldBack && (
                      <p {...stylex.props(styles.checksGroupNote)}>{t("checksRail.unknownKeysHeldBack")}</p>
                    )}
                  </>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}

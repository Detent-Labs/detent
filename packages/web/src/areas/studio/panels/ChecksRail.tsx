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
    border: `1px solid ${colors.border}`,
    padding: space.s3,
  },
  // The docked, collapsed presentation (`.studio-checks-rail-docked`):
  // `.canvas-inspector` already draws the bordered box around the whole
  // inspector, so this variant draws none of its own.
  checksRailDocked: {
    border: "none",
    paddingTop: space.s3,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: space.s3,
    borderTop: `2px solid ${colors.divider}`,
  },
  // `.studio-checks-rail h2`: a descendant selector on a bare `<h2>`.
  checksRailHeading: {
    marginTop: 0,
  },
  checksRailClear: {
    color: colors.text,
    border: `2px solid ${colors.text}`,
    padding: space.s2,
    marginBlockEnd: space.s3,
    marginBlockStart: 0,
    marginInline: 0,
  },
  checksGroup: {
    paddingBlock: space.s2,
    paddingInline: 0,
    borderTop: `1px solid ${colors.border}`,
    ":first-of-type": {
      borderTop: "none",
    },
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
    borderLeft: `3px solid color-mix(in srgb, ${colors.refusal} 55%, transparent)`,
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
    borderTop: `1px solid ${colors.border}`,
    fontSize: "0.85rem",
    ":first-child": {
      borderTop: "none",
    },
  },
  checksGroupNote: {
    margin: 0,
    paddingTop: space.s1,
    borderTop: `1px solid ${colors.border}`,
    color: colors.textMuted,
    fontSize: "0.8rem",
  },
  checksRailSummary: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s2,
    width: "100%",
    background: "none",
    color: "inherit",
    border: "none",
    borderTop: `2px solid ${colors.divider}`,
    paddingTop: space.s2,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  // `.studio-checks-rail-docked .studio-checks-rail-summary`: this file
  // knows `collapsed` at both render sites, so the descendant override
  // becomes a second style applied alongside the base one.
  checksRailSummaryDocked: {
    borderTop: "none",
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
  /** True when this rail docks at the step inspector's bottom edge: it opens
   * as a one-line summary and expands in place when chosen. False beside the
   * canvas, where nothing is selected and the full grouped list always shows.
   * See `studio-checks-rail`'s collapsed-summary requirement. */
  collapsed?: boolean;
}

/**
 * The consolidated, source-grouped view of `validation.issues[]`
 * (`studio-checks-rail`). Reads the same array every per-entity `IssueList`
 * placement already filters; this is one more view over it, not a second
 * validation pass.
 */
export function ChecksRail({ validation, canPublish, collapsed = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const groups = groupChecksBySource(validation);
  const clear = allChecksClear(groups);
  const summary = totalOpenIssueCount(groups);
  const showSummary = collapsed && !expanded;

  return (
    <aside
      // `collapsed` also marks the docked instance StepsPanel mounts at its
      // bottom edge (true whether the summary or, once chosen, the expanded
      // list shows) — it never draws its own border/padding there, since
      // `.canvas-inspector` already provides that box.
      {...stylex.props(styles.checksRail, collapsed && styles.checksRailDocked)}
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

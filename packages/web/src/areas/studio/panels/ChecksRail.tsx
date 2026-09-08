import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { allChecksClear, checksDotState, groupChecksBySource, totalOpenIssueCount } from "../draft/checksRail";
import type { EditorIssue } from "../draft/issues";
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
  // The collapsed form, in the studio's area nav. It stands beside three
  // buttons in a header row, so it draws no box and takes no padding: the
  // summary control inside it is the whole of it.
  checksRailBare: {
    overflowY: "visible",
    borderWidth: 0,
    padding: 0,
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
  // The collapsed summary, a control in the area nav's own button row. It
  // borrows `.btn-ghost`'s chrome through the class, so it declares only the
  // line the dot, the name and the count share.
  checksRailSummary: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
  // The state dot. It carries `aria-hidden`: the control's own accessible name
  // already states the count and what the dot reads, in one sentence.
  checksRailDot: {
    flex: "none",
    width: 8,
    height: 8,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
  },
  checksRailDotBlocker: {
    color: colors.refusal,
    backgroundColor: colors.refusal,
  },
  checksRailDotAdvisory: {
    color: colors.accent400,
    backgroundColor: colors.accent400,
  },
  checksRailDotClear: {
    color: colors.textMuted,
    backgroundColor: "transparent",
  },
  // The narrowing line: what the rail is showing, and the control widening it
  // again. It stands above the groups, so an author never reads a filtered
  // list as the whole one.
  checksRailNarrowed: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.s2,
    marginBlock: 0,
    marginBottom: space.s2,
    paddingBottom: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    color: colors.textMuted,
  },
  checksRailSummaryCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  // A row in the grouped list. It opens the tab owning the issue's subject, so
  // it is a real control, flush left and carrying the row's own text alone.
  checksGroupIssueButton: {
    display: "block",
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    padding: 0,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
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
  /** True in the studio's area nav, the rail's one collapsed site. It renders
   * the one-line summary there — the count, the state dot, and an accessible
   * name carrying both. Pressing it opens the Checks tab; it expands no list
   * in place, under the area nav or on any tab
   * (`studio-checks-rail`'s collapsed-summary requirement). */
  collapsed?: boolean;
  /** What the collapsed summary opens: the Checks tab. */
  onOpen?: () => void;
  /** What a row in the grouped list opens: the tab owning that issue's
   * subject (`studio-process-tabs`). A rail rendered without it prints its
   * rows as plain text, the way the per-entity placements do. */
  onOpenIssue?: (issue: EditorIssue) => void;
  /** The one step this rail is narrowed to: the entity ids its issues may
   * name, and the step's own label for the line saying so. Absent means the
   * whole draft, which is what every mount but the Forms tab's badge passes
   * (`studio-forms-overview`: "Pressing the badge SHALL open the Checks tab,
   * narrowed to that step"). */
  narrowedTo?: { label: string; entityIds: readonly string[] };
  /** Widens a narrowed rail back to the whole draft. Required beside
   * `narrowedTo`: an author must never be stuck in a filtered list. */
  onShowEvery?: () => void;
}

/**
 * The consolidated, source-grouped view of `validation.issues[]`
 * (`studio-checks-rail`). Reads the same array every per-entity `IssueList`
 * placement already filters; this is one more view over it, not a second
 * validation pass.
 *
 * Two forms, one component. The Checks tab stands the full grouped list. The
 * area nav stands the collapsed summary, which is the same rail reporting one
 * line instead of its groups.
 */
export function ChecksRail({ validation, canPublish, collapsed = false, onOpen, onOpenIssue, narrowedTo, onShowEvery }: Props) {
  // Narrowing filters the issues and nothing else: every dimension keeps its
  // own held-back state, so a narrowed rail still says which checks have not
  // run rather than reporting a step clear that nothing has checked yet.
  const shown: ValidationResult = narrowedTo
    ? { ...validation, issues: validation.issues.filter((i) => narrowedTo.entityIds.includes(i.entityId)) }
    : validation;
  const groups = groupChecksBySource(shown);
  const clear = allChecksClear(groups);
  const summary = totalOpenIssueCount(groups);
  const dot = checksDotState(groups);
  // One whole sentence per state, never a name assembled from fragments
  // (design-language.md). It carries the count and what the dot reads, which
  // is what the collapsed summary's accessible name has to say.
  const summaryName =
    summary.kind === "held-back"
      ? t("checksRail.summaryHeldBack")
      : summary.kind === "clear"
        ? t("checksRail.summaryClear")
        : summary.count === 1
          ? t(dot === "blocker" ? "checksRail.summaryBlockerOne" : "checksRail.summaryAdvisoryOne")
          : t(dot === "blocker" ? "checksRail.summaryBlocker" : "checksRail.summaryAdvisory").replace(
              "{count}",
              String(summary.count),
            );

  return (
    <aside
      {...stylex.props(styles.checksRail, collapsed && styles.checksRailBare)}
      aria-label={t("checksRail.heading")}
    >
      {collapsed ? (
        <button type="button" className="btn btn-ghost" aria-label={summaryName} onClick={onOpen}>
          <span {...stylex.props(styles.checksRailSummary)}>
            <span
              aria-hidden="true"
              {...stylex.props(
                styles.checksRailDot,
                dot === "blocker" && styles.checksRailDotBlocker,
                dot === "advisory" && styles.checksRailDotAdvisory,
                dot === "clear" && styles.checksRailDotClear,
              )}
            />
            {t("checksRail.heading")}
            {summary.kind === "count" && <span {...stylex.props(styles.checksRailSummaryCount)}>{summary.count}</span>}
          </span>
        </button>
      ) : (
        <>
          <h2 {...stylex.props(styles.checksRailHeading)}>{t("checksRail.heading")}</h2>
          <div id="studio-checks-rail-groups">
            {narrowedTo && (
              <p {...stylex.props(styles.checksRailNarrowed)}>
                {t("checksRail.narrowedTo").replace("{step}", narrowedTo.label)}
                <button type="button" className="btn btn-ghost" onClick={onShowEvery}>
                  {t("checksRail.showEvery")}
                </button>
              </p>
            )}
            {/* Two sentences, two keys, one box. The first is what this rail
                measured. The second is what the engine reported about this
                actor. Conflating them into one sentence is the defect: the
                rail cannot verify a permission, so it must not assert one. */}
            {clear && narrowedTo === undefined && (
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
                            {onOpenIssue ? (
                              <button
                                type="button"
                                {...stylex.props(styles.checksGroupIssueButton)}
                                onClick={() => onOpenIssue(issue)}
                              >
                                {issue.message}
                              </button>
                            ) : (
                              issue.message
                            )}
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

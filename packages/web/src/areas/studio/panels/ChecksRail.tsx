import { useId, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, focus, fonts, space } from "form-ui/tokens.stylex";
import { t, type CatalogKey } from "../catalog.js";
import {
  allChecksClear,
  groupChecksBySource,
  groupChecksBySubject,
  issueSeverity,
  type CheckSubjectName,
} from "../draft/checksRail";
import { issueText, type EditorIssue, type IssueSource } from "../draft/issues";
import type { ValidationResult } from "../draft/validation";

const styles = stylex.create({
  // `space.s3` (12px) already clears the ring's 4px reach at either end, but
  // a literal token drifts from the reach if either ever changes on its own
  // (`studio-focus-ring-clipping`, I-3). `max()` keeps today's value while
  // reading `focus.reach`, so the two move together. The scroll padding
  // keeps that same room mid-scroll, where the static padding cannot reach.
  checksRail: {
    minWidth: 0,
    overflowY: "auto",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    padding: `max(${space.s3}, ${focus.reach})`,
    scrollPadding: focus.reach,
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
  checksRailStart: {
    color: colors.textMuted,
    paddingBlock: space.s3,
    paddingInline: 0,
    marginBlock: 0,
  },
  // The column the rows stand in. It caps at the field card's width and sits
  // flush left, so a wide Checks tab does not stretch a sentence.
  checksColumn: {
    maxWidth: "52rem",
  },
  // One subject: its heading over a hairline, then its rows.
  checksSubject: {
    paddingBlock: space.s2,
    paddingInline: 0,
    borderTopWidth: { default: 1, ":first-of-type": 0 },
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  // The Title style (`DESIGN.md` Hierarchy) on an `h3`, which the global
  // `h2` rule does not reach.
  checksSubjectHeading: {
    fontFamily: fonts.heading,
    fontWeight: fonts.headingWeight,
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
    marginBlockEnd: space.s1,
    marginBlockStart: 0,
    marginInline: 0,
  },
  checksList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  checksRow: {
    paddingBlock: space.s3,
    paddingInline: 0,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  // A wrapping flex row, so Fix drops under the sentence once the row's own
  // width runs short of the sentence's basis plus the control.
  checksRowMain: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: space.s2,
  },
  checksRowText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "35rem",
    minWidth: 0,
  },
  // The Legend style (`DESIGN.md` Hierarchy). The word carries the severity,
  // so the color never rests alone.
  severity: {
    display: "block",
    fontSize: 11,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBlockEnd: space.s1,
  },
  severityBlocker: {
    color: colors.refusal,
  },
  severityAdvisory: {
    color: colors.textMuted,
  },
  sentence: {
    margin: 0,
    fontSize: "0.9rem",
    overflowWrap: "anywhere",
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate,
  // mono at 11px. It composes over `btn btn-ghost`, whose accent it replaces.
  command: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    textAlign: "left",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  developer: {
    marginBlockStart: space.s2,
  },
  developerSummary: {
    width: "fit-content",
    paddingBlock: space.s1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    cursor: "pointer",
  },
  developerBox: {
    marginBlockStart: space.s1,
    padding: space.s2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    fontFamily: fonts.mono,
    fontSize: 12,
    overflowWrap: "anywhere",
  },
  developerLine: {
    margin: 0,
  },
  // The line under Before publishing: what has not run, and what publishing
  // checks on its own.
  checksLine: {
    margin: 0,
    paddingBlock: space.s2,
    color: colors.textMuted,
    fontSize: "0.85rem",
  },
  // An issue's source, the machine-matched category the check came from.
  // Mono because the engine matches it exactly (`design-language.md`).
  issueSourceLabel: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
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
});

interface Props {
  validation: ValidationResult;
  /** The loaded draft's `canPublish` report, threaded from `EditorArea`
   * through every one of this rail's four mounts. The all-clear box states a
   * publish verdict, and a rail that never reads the permission states one it
   * cannot verify: an actor without `system:publish` read "ready to publish"
   * here while the menu 900px away refused the act (studio-publish). */
  canPublish: boolean;
  /** What a row's Fix control does: lands on the place that owns the issue
   * (`studio-process-tabs`). A rail rendered without it prints no control. */
  onFix?: (issue: EditorIssue) => void;
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

const SUBJECT_KEYS: Record<CheckSubjectName, CatalogKey> = {
  steps: "checksRail.subject.steps",
  fields: "checksRail.subject.fields",
  publishing: "checksRail.subject.publishing",
};

/** The command style with `btn btn-ghost` joined into one `className`, since
 * a `className` written after a spread of `stylex.props` would replace it. */
function commandProps() {
  const compiled = stylex.props(styles.command);
  return { ...compiled, className: `btn btn-ghost ${compiled.className ?? ""}`.trim() };
}

/** A closed disclosure over machine values, in the mono face. */
function DeveloperView({ children }: { children: ReactNode }) {
  return (
    <details {...stylex.props(styles.developer)}>
      <summary {...stylex.props(styles.developerSummary)}>{t("checksRail.developerView")}</summary>
      <div {...stylex.props(styles.developerBox)}>{children}</div>
    </details>
  );
}

/** One open issue: its severity word, its sentence and the Fix control, then
 * the closed Developer view holding the source, the raw message and the
 * location. */
function CheckRow({ issue, onFix }: { issue: EditorIssue; onFix?: (issue: EditorIssue) => void }) {
  const sentenceId = useId();
  const severity = issueSeverity(issue);
  return (
    <li {...stylex.props(styles.checksRow)}>
      <div {...stylex.props(styles.checksRowMain)}>
        <div {...stylex.props(styles.checksRowText)}>
          <span {...stylex.props(styles.severity, severity === "blocker" ? styles.severityBlocker : styles.severityAdvisory)}>
            {t(severity === "blocker" ? "checks.severity.blocker" : "checks.severity.advisory")}
          </span>
          <p id={sentenceId} {...stylex.props(styles.sentence)}>
            {issueText(issue)}
          </p>
        </div>
        {onFix && (
          <button type="button" {...commandProps()} aria-describedby={sentenceId} onClick={() => onFix(issue)}>
            {t("checksRail.fix")}
          </button>
        )}
      </div>
      <DeveloperView>
        <p {...stylex.props(styles.developerLine, styles.issueSourceLabel)}>{issue.source}</p>
        <p {...stylex.props(styles.developerLine)}>{issue.message}</p>
        {issue.loc !== "" && <p {...stylex.props(styles.developerLine)}>{issue.loc}</p>}
      </DeveloperView>
    </li>
  );
}

/** What has not run, in one line. While any check holds back it says more
 * checks run once the author fixes the rows above, and what publishing checks
 * on its own. Otherwise it says the second part alone. */
function HeldBackLine({ heldBack }: { heldBack: readonly IssueSource[] }) {
  return (
    <div>
      <p {...stylex.props(styles.checksLine)}>{t(heldBack.length > 0 ? "checksRail.heldBackLine" : "checksRail.publishLine")}</p>
      <DeveloperView>
        {heldBack.length > 0 && (
          <p {...stylex.props(styles.developerLine)}>
            {t("checksRail.heldBackKinds")}{" "}
            {heldBack.map((source, i) => (
              <span key={source}>
                {i > 0 && ", "}
                <span {...stylex.props(styles.issueSourceLabel)}>{source}</span>
              </span>
            ))}
          </p>
        )}
        <p {...stylex.props(styles.developerLine)}>{t("checksRail.configHeldBack")}</p>
        <p {...stylex.props(styles.developerLine)}>{t("checksRail.unknownKeysHeldBack")}</p>
      </DeveloperView>
    </div>
  );
}

/**
 * The consolidated, subject-grouped view of `validation.issues[]`
 * (`studio-checks-rail`). Reads the same array every per-entity `IssueList`
 * placement already filters; this is one more view over it, not a second
 * validation pass.
 *
 * One form: the full list. It stands only in the Checks tab body.
 */
export function ChecksRail({ validation, canPublish, onFix, narrowedTo, onShowEvery }: Props) {
  // Narrowing filters the issues and nothing else: the held-back state reads
  // the whole draft, so a narrowed rail still says which checks have not run
  // rather than reporting a step clear that nothing has checked yet.
  const shown = narrowedTo ? validation.issues.filter((i) => narrowedTo.entityIds.includes(i.entityId)) : validation.issues;
  const groups = groupChecksBySource(validation);
  const clear = allChecksClear(groups);
  const heldBack = groups.filter((g) => g.heldBack).map((g) => g.source);
  const subjects = groupChecksBySubject({ issues: shown });
  // A draft with no step: one sentence when nothing is open, else the sentence
  // first and the subjects under it.
  const startOnly = validation.noStepYet === true && shown.length === 0;

  return (
    <aside {...stylex.props(styles.checksRail)} aria-label={t("checksRail.heading")}>
      <h2 {...stylex.props(styles.checksRailHeading)}>{t("checksRail.heading")}</h2>
      <div id="studio-checks-rail-groups" {...stylex.props(styles.checksColumn)}>
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
        {validation.noStepYet === true && (
          <p {...stylex.props(styles.checksRailStart)}>{t("checksRail.noStepYet")}</p>
        )}
        {!startOnly &&
          subjects.map(({ subject, issues }) => {
            const line = subject === "publishing";
            if (issues.length === 0 && !line) return null;
            return (
              <section key={subject} {...stylex.props(styles.checksSubject)}>
                <h3 {...stylex.props(styles.checksSubjectHeading)}>{t(SUBJECT_KEYS[subject])}</h3>
                {issues.length > 0 && (
                  <ul {...stylex.props(styles.checksList)}>
                    {issues.map((issue, i) => (
                      <CheckRow key={i} issue={issue} onFix={onFix} />
                    ))}
                  </ul>
                )}
                {line && <HeldBackLine heldBack={heldBack} />}
              </section>
            );
          })}
      </div>
    </aside>
  );
}

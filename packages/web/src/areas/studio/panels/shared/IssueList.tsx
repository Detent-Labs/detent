import * as stylex from "@stylexjs/stylex";
import { colors, fonts } from "form-ui/tokens.stylex";
import type { EditorIssue } from "../../draft/issues";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";

const styles = stylex.create({
  /** An issue's source, the machine-matched category the check came from:
   * `zod`, `cel`, `registry`, `duration`, `structural` or `view`. Mono
   * because the engine matches it exactly (`design-language.md`), and the
   * catalog never translates such a value.
   *
   * The label's own visual identity, without a heading's block margins.
   * `ChecksRail.tsx`'s `checksGroupHeading` composes its margins over this,
   * so both call sites read one definition. */
  issueSourceLabel: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    // Stated, not inherited. The rail composes this onto an `<h3>`, whose
    // user-agent default is bold: the same label measured 700 there and 400
    // in the per-entity list, so one definition rendered two ways. 400 is
    // what `design-language.md` gives a label, and it is what the list
    // already read.
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
});

export const issueSourceLabel = styles.issueSourceLabel;

/** The rendered rows of an already-filtered issue set. The Fields view's
 * zones filter by `loc` before they render (`panels/fieldCheckZone.ts`), so
 * they hand this the checks one zone owns rather than an entity id.
 *
 * `style` is the caller's own compiled style for the list, composed after
 * the literal `issue-list` every other consumer still renders bare. */
export function IssueItems({ issues, style }: { issues: EditorIssue[]; style?: stylex.StyleXStyles }) {
  if (issues.length === 0) return null;
  return (
    <ul className={["issue-list", stylex.props(style).className].filter(Boolean).join(" ")}>
      {issues.map((issue, i) => (
        <li key={i} className={`issue issue-${issue.source}`}>
          <span {...stylex.props(styles.issueSourceLabel)}>{issue.source}</span> {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** Renders every `EditorIssue` for one entity — the same issue list every panel and the canvas read off. */
export function IssueList({ entityId }: { entityId: string | undefined }) {
  const { validation } = useDraft();
  if (!entityId) return null;
  return <IssueItems issues={validation.issues.filter((i) => i.entityId === entityId)} />;
}

export function NotCheckedBadge({ label }: { label: string }) {
  return (
    <span className="badge badge-not-checked">
      {label}: {t("issues.notChecked")}
    </span>
  );
}

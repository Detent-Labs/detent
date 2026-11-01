import * as stylex from "@stylexjs/stylex";
import { issueText, type EditorIssue } from "../../draft/issues";
import { useDraft } from "../../draft/store";

/** The rendered rows of an already-filtered issue set. The Fields view's
 * zones filter by `loc` before they render (`panels/fieldCheckZone.ts`), so
 * they hand this the checks one zone owns rather than an entity id.
 *
 * Each row prints the issue's sentence alone. The source and the raw message
 * stand in the Checks tab's Developer view.
 *
 * `style` is the caller's own compiled style for the list, composed after
 * the literal `issue-list` every other consumer still renders bare.
 * `anchorId` sets the list's `id` and makes it focusable, so a Fix press can
 * land on the sentence. */
export function IssueItems({
  issues,
  style,
  anchorId,
}: {
  issues: EditorIssue[];
  style?: stylex.StyleXStyles;
  anchorId?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <ul
      id={anchorId}
      tabIndex={anchorId === undefined ? undefined : -1}
      className={["issue-list", stylex.props(style).className].filter(Boolean).join(" ")}
    >
      {issues.map((issue, i) => (
        <li key={i} className={`issue issue-${issue.source}`}>
          {issueText(issue)}
        </li>
      ))}
    </ul>
  );
}

/** Renders every `EditorIssue` for one entity — the same issue list every panel and the canvas read off. */
export function IssueList({ entityId, anchorId }: { entityId: string | undefined; anchorId?: string }) {
  const { validation } = useDraft();
  if (!entityId) return null;
  return <IssueItems issues={validation.issues.filter((i) => i.entityId === entityId)} anchorId={anchorId} />;
}

/** `text` is the whole sentence, from the catalog, so none joins from two parts. */
export function NotCheckedBadge({ text }: { text: string }) {
  return <span className="badge badge-not-checked">{text}</span>;
}

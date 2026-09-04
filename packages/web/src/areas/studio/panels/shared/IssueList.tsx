import type { EditorIssue } from "../../draft/issues";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";

/** The rendered rows of an already-filtered issue set. The Fields view's
 * zones filter by `loc` before they render (`panels/fieldCheckZone.ts`), so
 * they hand this the checks one zone owns rather than an entity id. */
export function IssueItems({ issues }: { issues: EditorIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => (
        <li key={i} className={`issue issue-${issue.source}`}>
          [{issue.source}] {issue.message}
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

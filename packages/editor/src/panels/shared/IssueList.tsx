import { useDraft } from "../../draft/store";
import { t } from "../../i18n/catalog";

/** Renders every `EditorIssue` for one entity — the same issue list every panel and the future graph view read off (editor-live-validation spec). */
export function IssueList({ entityId }: { entityId: string | undefined }) {
  const { validation } = useDraft();
  if (!entityId) return null;
  const issues = validation.issues.filter((i) => i.entityId === entityId);
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

export function NotCheckedBadge({ label }: { label: string }) {
  return (
    <span className="badge badge-not-checked">
      {label}: {t("issues.notChecked")}
    </span>
  );
}

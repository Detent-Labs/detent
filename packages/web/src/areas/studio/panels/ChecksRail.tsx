import { t } from "../catalog.js";
import { allChecksClear, groupChecksBySource } from "../draft/checksRail";
import type { ValidationResult } from "../draft/validation";

interface Props {
  validation: ValidationResult;
}

/**
 * The consolidated, source-grouped view of `validation.issues[]`
 * (`studio-checks-rail`). Reads the same array every per-entity `IssueList`
 * placement already filters; this is one more view over it, not a second
 * validation pass.
 */
export function ChecksRail({ validation }: Props) {
  const groups = groupChecksBySource(validation);
  const clear = allChecksClear(groups);

  return (
    <aside className="studio-checks-rail" aria-label={t("checksRail.heading")}>
      <h2>{t("checksRail.heading")}</h2>
      {clear && <p className="studio-checks-rail-clear">{t("checksRail.allClear")}</p>}
      {groups.map((group) => (
        <section key={group.source} className="studio-checks-group">
          {/* The source name is the same untranslated machine value
              IssueList already prints (`[{issue.source}]`) — a category
              this validation pipeline itself defines, not authored prose. */}
          <h3 className="studio-checks-group-heading">{group.source}</h3>
          {group.heldBack ? (
            <p className="studio-checks-group-held-back">{t("checksRail.heldBack")}</p>
          ) : group.issues.length === 0 ? (
            <p className="studio-checks-group-clear">{t("checksRail.groupClear")}</p>
          ) : (
            <ul className="studio-checks-group-list">
              {group.issues.map((issue, i) => (
                <li key={i} className="studio-checks-group-issue">
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </aside>
  );
}

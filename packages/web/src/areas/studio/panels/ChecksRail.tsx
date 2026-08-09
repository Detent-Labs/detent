import { useState } from "react";
import { t } from "../catalog.js";
import { allChecksClear, groupChecksBySource, totalOpenIssueCount } from "../draft/checksRail";
import type { ValidationResult } from "../draft/validation";

interface Props {
  validation: ValidationResult;
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
export function ChecksRail({ validation, collapsed = false }: Props) {
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
      // `.canvas-inspector` already provides that box (app.css:
      // `.studio-checks-rail-docked`).
      className={collapsed ? "studio-checks-rail studio-checks-rail-docked" : "studio-checks-rail"}
      aria-label={t("checksRail.heading")}
    >
      {showSummary ? (
        <button
          type="button"
          className="studio-checks-rail-summary"
          aria-expanded={false}
          aria-controls="studio-checks-rail-groups"
          onClick={() => setExpanded(true)}
        >
          <span className="studio-checks-rail-summary-heading">{t("checksRail.heading")}</span>
          {summary.kind === "count" && <span className="studio-checks-rail-summary-count">{summary.count}</span>}
          {summary.kind === "held-back" && (
            <span className="studio-checks-rail-summary-held-back">{t("checksRail.heldBack")}</span>
          )}
        </button>
      ) : (
        <>
          <h2>{t("checksRail.heading")}</h2>
          <div id="studio-checks-rail-groups">
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
          </div>
        </>
      )}
    </aside>
  );
}

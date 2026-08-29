import { fieldCellDisplay, mergeCellDisplay } from "./reportsLogic.js";
import { EmptyState } from "../components.js";
import { t, tCount } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { MergeReportCell, ReportCell, ReportExecutionResult } from "../api/types.js";

/**
 * Renders a report's result table with its three empty-cell states — a
 * value, no-value, not-in-this-version, and redacted — each a visibly
 * distinct look, never collapsed into one blank appearance (spec: "The
 * table renders the three empty-cell states and merge collisions
 * distinctly"). A merge column's collision rows carry their own marker
 * beside the row's count, not only in the column header's aggregate.
 */
export function ReportTable({ result, locale }: { result: ReportExecutionResult; locale: UiLocale }) {
  if (result.rows.length === 0) return <EmptyState>{t(locale, "table.noRows")}</EmptyState>;

  return (
    <>
      {result.truncated && (
        <p className="rep-error" role="alert">
          <span className="rep-stamp rep-stamp-danger">{t(locale, "error.failed")}</span> {t(locale, "table.truncated")}
        </p>
      )}
      <div className="rep-table-scroll">
        <table className="rep-table rep-report-table">
          <thead>
            <tr>
              {result.columns.map((col, i) => (
                <th key={i} scope="col" translate="no">
                  {col.type === "field" ? (
                    col.fieldId
                  ) : (
                    <>
                      {t(locale, "builder.mergeColumnLabel")}
                      {col.collisions > 0 && (
                        <span className="rep-figure rep-column-collisions">
                          {" "}
                          · {tCount(locale, col.collisions === 1 ? "table.collisionsOne" : "table.collisionsMany", col.collisions)}
                        </span>
                      )}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.instanceId}>
                {row.cells.map((cell, i) =>
                  result.columns[i]?.type === "merge" ? (
                    <MergeCell key={i} cell={cell as MergeReportCell} locale={locale} />
                  ) : (
                    <FieldCell key={i} cell={cell as ReportCell} locale={locale} />
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FieldCell({ cell, locale }: { cell: ReportCell; locale: UiLocale }) {
  const display = fieldCellDisplay(cell, locale);
  return (
    <td className={`rep-cell rep-cell-${display.kind}`}>
      {display.kind === "redacted" ? <span className="rep-redaction-bar" aria-label={display.srLabel} /> : display.text}
    </td>
  );
}

function MergeCell({ cell, locale }: { cell: MergeReportCell; locale: UiLocale }) {
  const display = mergeCellDisplay(cell, locale);
  return (
    <td className={`rep-cell rep-cell-${display.kind}${display.collision ? " rep-cell-collision" : ""}`}>
      {display.kind === "redacted" ? (
        <span className="rep-redaction-bar" aria-label={display.srLabel} />
      ) : (
        <>
          {display.text}
          {display.collision && <span className="rep-stamp rep-collision-mark">{t(locale, "table.collisionMark")}</span>}
        </>
      )}
    </td>
  );
}

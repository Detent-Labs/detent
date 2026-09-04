import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { fieldCellDisplay, mergeCellDisplay } from "./reportsLogic.js";
import { EmptyState } from "../components.js";
import { t, tCount } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { MergeReportCell, ReportCell, ReportExecutionResult } from "../api/types.js";

/** `app.css`'s error/stamp/table/cell rules, as StyleX. `CellDisplay.kind`
 * is a bare `string` (open-ended), so `cellTone` is a partial lookup: an
 * unmatched kind composes no extra style, same as today's unmatched
 * `.rep-cell-*` suffix (design.md D3). This file's own `.rep-error` call
 * site pairs with a stamp, so it keeps the ink tone — the same two-way
 * choice `components.tsx`'s `ErrorNote` already makes. */
const styles = stylex.create({
  error: {
    fontSize: "0.9rem",
    color: colors.text,
    marginBlock: space.s3,
    marginInline: 0,
  },
  stamp: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  stampDanger: {
    color: colors.refusal,
  },
  tableScroll: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  thCol: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    fontWeight: 600,
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "middle",
  },
  figure: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
  },
  columnCollisions: {
    color: colors.textMuted,
  },
  collisionMark: {
    marginLeft: space.s2,
    color: colors.accent,
  },
  cellValue: {
    fontFamily: fonts.mono,
  },
  cellNoValue: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
  },
  cellNotInVersion: {
    color: colors.textMuted,
    fontStyle: "italic",
    fontSize: "0.85rem",
  },
  cellRedacted: {
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  cellCollision: {
    backgroundColor: `color-mix(in srgb, ${colors.accent} 8%, transparent)`,
  },
  redactionBar: {
    display: "block",
    height: "0.85em",
    width: "100%",
    minWidth: "3rem",
    backgroundColor: colors.text,
  },
});

const cellTone: Partial<Record<string, stylex.StyleXStyles>> = {
  value: styles.cellValue,
  "no-value": styles.cellNoValue,
  "not-in-version": styles.cellNotInVersion,
  redacted: styles.cellRedacted,
};

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
        <p {...stylex.props(styles.error)} role="alert">
          <span {...stylex.props(styles.stamp, styles.stampDanger)}>{t(locale, "error.failed")}</span> {t(locale, "table.truncated")}
        </p>
      )}
      <div {...stylex.props(styles.tableScroll)}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              {result.columns.map((col, i) => (
                <th key={i} scope="col" {...stylex.props(styles.thCol)} translate="no">
                  {col.type === "field" ? (
                    col.fieldId
                  ) : (
                    <>
                      {t(locale, "builder.mergeColumnLabel")}
                      {col.collisions > 0 && (
                        <span {...stylex.props(styles.figure, styles.columnCollisions)}>
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
    <td {...stylex.props(styles.td, cellTone[display.kind])}>
      {display.kind === "redacted" ? <span {...stylex.props(styles.redactionBar)} aria-label={display.srLabel} /> : display.text}
    </td>
  );
}

function MergeCell({ cell, locale }: { cell: MergeReportCell; locale: UiLocale }) {
  const display = mergeCellDisplay(cell, locale);
  return (
    <td {...stylex.props(styles.td, cellTone[display.kind], display.collision && styles.cellCollision)}>
      {display.kind === "redacted" ? (
        <span {...stylex.props(styles.redactionBar)} aria-label={display.srLabel} />
      ) : (
        <>
          {display.text}
          {display.collision && <span {...stylex.props(styles.stamp, styles.collisionMark)}>{t(locale, "table.collisionMark")}</span>}
        </>
      )}
    </td>
  );
}

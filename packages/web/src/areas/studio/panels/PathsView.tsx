/**
 * The panels screen's Paths view: one row per path across the whole draft
 * (`studio-app`'s Paths-view requirements). A canvas draws an automatic
 * path's priority and guard on the line and draws neither for a manual one,
 * so reading the rules of the whole process means clicking every line.
 *
 * The dock hosted this until the bench replaced it. Only the host moved. The
 * row derivation stays in `pathRows.ts` with its own `bun:test`.
 */
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import type { Draft } from "../draft/types.js";
import { pathRows, type PathRow } from "./pathRows.js";

/** The paths table and the `.studio-empty` shape, both from `app.css`.
 * Duplicated on purpose (D9) rather than shared: `.studio-empty` appears
 * near-identically in ten other studio files. */
const styles = stylex.create({
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  paths: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  pathsCell: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInlineEnd: space.s3,
    paddingInlineStart: 0,
    fontWeight: 400,
    verticalAlign: "top",
  },
  pathsHeadCell: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    color: colors.textMuted,
  },
  // A `key`, a raw `step_` id, a guard's CEL and a priority number are values
  // the engine matches exactly, so all four take the mono face. A resolved
  // label beside them is prose and keeps the body face.
  pathsMono: {
    fontFamily: fonts.mono,
  },
  pathsLabel: {
    display: "block",
  },
  pathsNone: {
    fontFamily: fonts.body,
    color: colors.textMuted,
  },
});

export function PathsView({ draft, contentLocale }: { draft: Draft; contentLocale: string }) {
  const rows = useMemo(() => pathRows(draft.workflow?.steps), [draft]);
  const baseLocale = draft.baseLocale ?? "en";

  if (rows.length === 0) return <p {...stylex.props(styles.empty)}>{t("dock.pathsEmpty")}</p>;

  const headCellProps = stylex.props(styles.pathsCell, styles.pathsHeadCell);

  return (
    <table {...stylex.props(styles.paths)}>
      <thead>
        <tr>
          <th scope="col" {...headCellProps}>{t("dock.pathsSource")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsTrigger")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsPriority")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsGuard")}</th>
          <th scope="col" {...headCellProps}>{t("dock.pathsTarget")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.pathId}>
            <th scope="row" {...stylex.props(styles.pathsCell)}>{stepCell(row.sourceLabel, row.sourceKey, contentLocale, baseLocale)}</th>
            <td {...stylex.props(styles.pathsCell)}>{row.trigger ?? ""}</td>
            <td {...stylex.props(styles.pathsCell, styles.pathsMono)}>
              {row.priority === undefined ? <span {...stylex.props(styles.pathsNone)}>{t("dock.pathsNoPriority")}</span> : row.priority}
            </td>
            <td {...stylex.props(styles.pathsCell, styles.pathsMono)}>
              {row.guardSrc === undefined ? <span {...stylex.props(styles.pathsNone)}>{t("dock.pathsNoGuard")}</span> : row.guardSrc}
            </td>
            <td {...stylex.props(styles.pathsCell)}>{stepCell(row.targetLabel, row.targetKey ?? row.targetId, contentLocale, baseLocale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A resolved label is prose and takes the body face. The `key` beside it is
 * a value the engine matches exactly, so it takes the mono face — and so does
 * the raw `step_` id a dangling `to` falls back to. */
function stepCell(label: PathRow["sourceLabel"], key: string, locale: string, baseLocale: string) {
  const text = resolveDraftLocalizedText(label, locale, baseLocale);
  return (
    <>
      {text !== undefined && <span {...stylex.props(styles.pathsLabel)}>{text}</span>}
      <code {...stylex.props(styles.pathsMono)}>{key}</code>
    </>
  );
}

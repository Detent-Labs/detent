import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { matrixRows, matrixCounts, filterInertSteps } from "./fieldMatrixLogic";
import { FieldMatrixGrid, FLAG_KEYS, FLAG_LABEL_KEY } from "./FieldMatrixGrid";

const styles = stylex.create({
  matrix: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
  },
  matrixToolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s3,
    paddingBottom: space.s2,
    borderBottom: `2px solid ${colors.divider}`,
  },
  matrixCount: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.8rem",
    color: colors.textMuted,
  },
  matrixLegend: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s3,
    marginLeft: "auto",
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  matrixLegendSwatches: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s2,
    marginLeft: space.s1,
  },
  matrixLegendSwatch: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
  },
  matrixLegendSwatchColor: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    border: `1px solid ${colors.border}`,
  },
  matrixLegendSwatchVisible: {
    background: colors.flagVisible,
  },
  matrixLegendSwatchRequired: {
    background: colors.flagRequired,
  },
  matrixLegendSwatchReadonly: {
    background: colors.flagReadonly,
  },
});

const FLAG_SWATCH_STYLE: Record<(typeof FLAG_KEYS)[number], stylex.StyleXStyles> = {
  visible: styles.matrixLegendSwatchVisible,
  required: styles.matrixLegendSwatchRequired,
  readonly: styles.matrixLegendSwatchReadonly,
};

const LEGEND_KEYS = [
  "fieldMatrix.legendBulk",
  "fieldMatrix.legendDefault",
  "fieldMatrix.legendCel",
  "fieldMatrix.legendBlank",
  "fieldMatrix.legendFlagged",
  "fieldMatrix.legendTechnical",
  "fieldMatrix.legendColors",
] as const;

function countLine(declared: number, fields: number, steps: number, cells: number): string {
  return t("fieldMatrix.countLine")
    .replace("{declared}", String(declared))
    .replace("{fields}", String(fields))
    .replace("{steps}", String(steps))
    .replace("{cells}", String(cells));
}

/**
 * The panels screen's field matrix: the bare `FieldMatrixGrid`, plus a
 * toolbar (inert-column filter, count line, legend) and the column/row bulk
 * toggle badges the grid draws when `showBulkBadges` is set (design.md
 * decision 6, `field-matrix-toolbar-and-inline-editing`).
 */
export function FieldMatrixPanel() {
  const { draft } = useDraft();
  const [hideInert, setHideInert] = useState(false);

  const rows = matrixRows(draft.fields);
  const drawnSteps = filterInertSteps(draft.workflow?.steps ?? [], hideInert);
  const counts = matrixCounts(rows, drawnSteps.map((d) => d.step));

  return (
    <div {...stylex.props(styles.matrix)}>
      <div {...stylex.props(styles.matrixToolbar)}>
        <button
          type="button"
          className="btn btn-secondary"
          aria-pressed={hideInert}
          onClick={() => setHideInert((v) => !v)}
        >
          {t("fieldMatrix.hideInertToggle")}
        </button>
        <span {...stylex.props(styles.matrixCount)}>
          {countLine(counts.declaredEntries, counts.fieldCount, counts.stepCount, counts.undeclaredCells)}
        </span>
        <div {...stylex.props(styles.matrixLegend)}>
          {LEGEND_KEYS.map((key) => (
            <span key={key} data-legend-entry>
              {t(key)}
              {key === "fieldMatrix.legendColors" && (
                <span {...stylex.props(styles.matrixLegendSwatches)}>
                  {FLAG_KEYS.map((flagKey) => (
                    <span key={flagKey} {...stylex.props(styles.matrixLegendSwatch)}>
                      <span {...stylex.props(styles.matrixLegendSwatchColor, FLAG_SWATCH_STYLE[flagKey])} aria-hidden="true" />
                      {t(FLAG_LABEL_KEY[flagKey])}
                    </span>
                  ))}
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
      <FieldMatrixGrid hideInert={hideInert} showBulkBadges />
    </div>
  );
}

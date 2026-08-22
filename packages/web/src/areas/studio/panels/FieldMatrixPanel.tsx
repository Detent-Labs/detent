import { useState } from "react";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { matrixRows, matrixCounts, filterInertSteps } from "./fieldMatrixLogic";
import { FieldMatrixGrid, FLAG_KEYS, FLAG_LABEL_KEY } from "./FieldMatrixGrid";

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
 *
 * The canvas dock's Field matrix tab mounts `FieldMatrixGrid` directly, not
 * this wrapper, so it gains none of the chrome added here
 * (`studio-canvas`'s dock requirements).
 */
export function FieldMatrixPanel() {
  const { draft } = useDraft();
  const [hideInert, setHideInert] = useState(false);

  const rows = matrixRows(draft.fields);
  const drawnSteps = filterInertSteps(draft.workflow?.steps ?? [], hideInert);
  const counts = matrixCounts(rows, drawnSteps.map((d) => d.step));

  return (
    <div className="studio-matrix">
      <div className="studio-matrix-toolbar">
        <button
          type="button"
          className="btn btn-secondary studio-matrix-inert-toggle"
          aria-pressed={hideInert}
          onClick={() => setHideInert((v) => !v)}
        >
          {t("fieldMatrix.hideInertToggle")}
        </button>
        <span className="studio-matrix-count">
          {countLine(counts.declaredEntries, counts.fieldCount, counts.stepCount, counts.undeclaredCells)}
        </span>
        <div className="studio-matrix-legend">
          {LEGEND_KEYS.map((key) => (
            <span key={key} data-legend-entry>
              {t(key)}
              {key === "fieldMatrix.legendColors" && (
                <span className="studio-matrix-legend-swatches">
                  {FLAG_KEYS.map((flagKey) => (
                    <span key={flagKey} className="studio-matrix-legend-swatch">
                      <span
                        className={`studio-matrix-legend-swatch-color studio-matrix-legend-swatch-${flagKey}`}
                        aria-hidden="true"
                      />
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

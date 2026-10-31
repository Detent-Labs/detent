import * as stylex from "@stylexjs/stylex";
import { t } from "../catalog.js";
import { HeldDraft } from "../draft/held-while-hidden.js";
import type { FieldsView, TabView } from "../routing.js";
import { FieldsTab } from "./EntityTabs.js";
import { FieldMatrixPanel } from "./FieldMatrixPanel.js";
import { SubRow, subTabDomId, subTabPanelDomId } from "./SubRow.js";

const styles = stylex.create({
  // The sub-row, then one view body growing into the height the tab body
  // leaves, so the matrix fills the body under the sub-row.
  column: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
  },
  view: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
  },
  // `hidden` alone loses against the compiled `display` above, since an
  // author sheet beats the UA one, so the hidden state picks its own style.
  viewHidden: {
    display: "none",
  },
});

interface Props {
  view: FieldsView;
  onOpenView: (view: TabView) => void;
  token: string;
  /** True while the Fields tab stands open and the JSON surface does not. */
  visible: boolean;
  onShowStep: (stepId: string) => void;
  /** Opens the form editor for one step: the field catalog's empty-state
   * route. */
  onOpenForm: (stepId: string) => void;
}

/**
 * The Fields tab: a sub-row over the catalog and the field matrix
 * (`studio-process-tabs`: "The Fields tab carries the catalog and the matrix
 * as views"). Both view bodies stay mounted, and `hidden` reveals one, so the
 * catalog keeps its selected field and the matrix its selected cell.
 *
 * The matrix derives from the whole draft. While hidden it reads the draft it
 * last drew, so typing in the catalog skips it (`studio-app`).
 */
export function FieldsTabViews({ view, onOpenView, token, visible, onShowStep, onOpenForm }: Props) {
  const catalogHidden = view !== "catalog";
  const matrixHidden = view !== "matrix";
  return (
    <div {...stylex.props(styles.column)}>
      <SubRow
        tab="fields"
        views={[
          { id: "catalog", label: t("fieldsViews.catalog") },
          { id: "matrix", label: t("fieldsViews.matrix") },
        ]}
        open={view}
        onOpen={onOpenView}
        label={t("fieldsViews.rowLabel")}
      />
      <div
        id={subTabPanelDomId("fields", "catalog")}
        role="tabpanel"
        aria-labelledby={subTabDomId("fields", "catalog")}
        hidden={catalogHidden}
        {...stylex.props(styles.view, catalogHidden && styles.viewHidden)}
      >
        <FieldsTab token={token} visible={visible && view === "catalog"} onShowStep={onShowStep} onOpenForm={onOpenForm} />
      </div>
      <div
        id={subTabPanelDomId("fields", "matrix")}
        role="tabpanel"
        aria-labelledby={subTabDomId("fields", "matrix")}
        hidden={matrixHidden}
        {...stylex.props(styles.view, matrixHidden && styles.viewHidden)}
      >
        <HeldDraft visible={visible && view === "matrix"}>
          <FieldMatrixPanel />
        </HeldDraft>
      </div>
    </div>
  );
}

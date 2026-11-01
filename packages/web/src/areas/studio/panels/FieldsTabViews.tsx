import * as stylex from "@stylexjs/stylex";
import { focus } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { HeldDraft } from "../draft/held-while-hidden.js";
import type { FieldsView, TabView } from "../routing.js";
import { DataSourcesTab, FieldsTab } from "./EntityTabs.js";
import type { OutsidePlace } from "./readByRows.js";
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
  // The view body scrolls (design.md D13). Above 64rem the rail and the
  // editor fill it and scroll on their own; below it they stack, and this
  // box scrolls both, as the step page's tab body does. Room for the focus
  // ring: a scroll box clips at its padding edge, and the scroll padding
  // keeps that room when a focus scroll stops short of either end.
  view: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: focus.reach,
    scrollPadding: focus.reach,
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
  /** Opens the form editor for one step: an Asked on row's "Open the form"
   * and the empty state's route. */
  onOpenForm: (stepId: string) => void;
  /** A Read by row's "Open" for a way out, a step or a form (design.md D4). */
  onOpenPlace: (target: OutsidePlace) => void;
}

/**
 * The Fields tab: a sub-row over the catalog, the field matrix and the data
 * sources (`studio-process-tabs`: "The Fields tab carries the catalog and the
 * matrix as views"). Every view body stays mounted, and `hidden` reveals one,
 * so the catalog keeps its selected field, the matrix its selected cell and
 * the data sources their half-typed name.
 *
 * The matrix derives from the whole draft. While hidden it reads the draft it
 * last drew, so typing in the catalog skips it (`studio-app`).
 */
export function FieldsTabViews({ view, onOpenView, token, visible, onShowStep, onOpenForm, onOpenPlace }: Props) {
  const catalogHidden = view !== "catalog";
  const matrixHidden = view !== "matrix";
  const sourcesHidden = view !== "sources";
  return (
    <div {...stylex.props(styles.column)}>
      <SubRow
        tab="fields"
        views={[
          { id: "catalog", label: t("fieldsViews.catalog") },
          { id: "matrix", label: t("fieldsViews.matrix") },
          { id: "sources", label: t("fieldsViews.sources") },
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
        <FieldsTab
          token={token}
          visible={visible && view === "catalog"}
          onShowStep={onShowStep}
          onOpenForm={onOpenForm}
          onOpenPlace={onOpenPlace}
        />
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
      <div
        id={subTabPanelDomId("fields", "sources")}
        role="tabpanel"
        aria-labelledby={subTabDomId("fields", "sources")}
        hidden={sourcesHidden}
        {...stylex.props(styles.view, sourcesHidden && styles.viewHidden)}
      >
        <DataSourcesTab token={token} visible={visible && view === "sources"} />
      </div>
    </div>
  );
}

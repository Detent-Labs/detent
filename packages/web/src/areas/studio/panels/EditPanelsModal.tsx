import { useEffect, useRef } from "react";
import { useDraft } from "../draft/store";
import { t, type TranslationKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { seedLocalizedText } from "../draft/localized-text";
import { flattenRailFields, issueCountForEntityType } from "../draft/panel-rail";
import type { EntityType } from "../draft/issues";
import { FieldCatalogPanel } from "./FieldCatalogPanel";
import { DataSourcesPanel } from "./DataSourcesPanel";
import { ContractPanel } from "./ContractPanel";

export type PanelView = "fields" | "dataSources" | "contract";

export const PANEL_VIEWS: PanelView[] = ["fields", "dataSources", "contract"];

const VIEW_LABEL: Record<PanelView, TranslationKey> = {
  fields: "fieldCatalog.heading",
  dataSources: "dataSources.heading",
  contract: "contract.heading",
};

/** One `EntityType` per view — the dimension `resolveLoc` reports an issue in
 * this view under. Contract issues all land on the single `"contract"` id. */
const VIEW_ENTITY_TYPE: Record<PanelView, EntityType> = {
  fields: "field",
  dataSources: "dataSource",
  contract: "contract",
};

interface Props {
  /** `undefined` while closed. The link that opened the modal seeds it. */
  openView: PanelView | undefined;
  onClose: () => void;
  onOpenView: (view: PanelView) => void;
  token: string;
}

/**
 * The three process-wide panels — field catalogue, data sources, contract —
 * behind one shared modal, with a left rail switching between them.
 *
 * The native `<dialog>` pattern `StartPickerDialog` and `PromotionPreviewDialog`
 * already use: the browser supplies the focus trap, the Escape key and the
 * backdrop, so none of that is hand-rolled. One dialog rather than three, so
 * jumping from Fields to Contract does not flash the backdrop and lose focus
 * twice.
 *
 * The element stays MOUNTED for the life of the screen, and `openView` drives
 * `showModal()`/`close()`. Mounting on open would drop `ContractPanel`'s
 * half-typed outcome name (its own `useState`) and refetch `DataSourcesPanel`'s
 * list keys on every open. The footer promises Close keeps every change, and
 * losing typed text would contradict it.
 *
 * The modal carries no Save. Every panel writes straight into the in-browser
 * draft through `useDraft()`, exactly as it did mounted above the canvas. The
 * screen's own Save/Discard/Publish toolbar stays the only thing that persists.
 */
export function EditPanelsModal({ openView, onClose, onOpenView, token }: Props) {
  const { draft, mutate, validation, contentLocale } = useDraft();
  const ref = useRef<HTMLDialogElement>(null);

  // `showModal()` on an already-open dialog throws, and `close()` on a closed
  // one fires a spurious `close` event, so both are guarded on `open`.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (openView !== undefined && !dialog.open) dialog.showModal();
    if (openView === undefined && dialog.open) dialog.close();
  }, [openView]);

  const railFields = flattenRailFields(draft.fields);
  const entityCount: Record<PanelView, number> = {
    fields: railFields.length,
    dataSources: (draft.dataSources ?? []).length,
    contract: (draft.contract?.outcomes ?? []).length,
  };

  const addField = () => {
    addToDraftArray(mutate, (d) => (d.fields ??= []), {
      id: mintId("field"),
      key: "",
      label: seedLocalizedText(contentLocale),
      type: "string",
    });
  };

  // Layout read, so it runs on click rather than during render.
  const scrollToField = (fieldId: string) => {
    document.getElementById(`field-row-${fieldId}`)?.scrollIntoView({ block: "start" });
  };

  return (
    <dialog
      ref={ref}
      className="studio-dialog studio-panels-modal"
      aria-labelledby="edit-panels-heading"
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="studio-panels-modal-header">
        <h2 id="edit-panels-heading">{openView === undefined ? "" : t(VIEW_LABEL[openView])}</h2>
      </header>

      <div className="studio-panels-modal-body">
        <nav className="studio-panels-rail" aria-label={t("editPanels.railLabel")}>
          <ul className="studio-panels-rail-list">
            {PANEL_VIEWS.map((view) => {
              const issues = issueCountForEntityType(validation.issues, VIEW_ENTITY_TYPE[view]);
              return (
                <li key={view}>
                  <button
                    type="button"
                    className="studio-panels-rail-entry"
                    aria-current={openView === view ? "true" : undefined}
                    onClick={() => onOpenView(view)}
                  >
                    <span className="studio-panels-rail-name">{t(VIEW_LABEL[view])}</span>
                    <span className="studio-panels-rail-count">{entityCount[view]}</span>
                    {issues > 0 && <span className="studio-panels-rail-issues">{issues}</span>}
                  </button>
                  {/* Contract holds one editor, so it carries no sub-list. */}
                  {view === "fields" && (
                    <ul className="studio-panels-rail-sublist">
                      {railFields.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="studio-panels-rail-field"
                            data-depth={row.depth}
                            onClick={() => {
                              onOpenView("fields");
                              scrollToField(row.id);
                            }}
                          >
                            {row.key === "" ? t("editPanels.unnamedField") : row.key}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button type="button" className="studio-panels-rail-field" onClick={addField}>
                          {t("fieldCatalog.addField")}
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="studio-panels-modal-view">
          {openView === "fields" && <FieldCatalogPanel />}
          {openView === "dataSources" && <DataSourcesPanel token={token} />}
          {openView === "contract" && <ContractPanel />}
        </div>
      </div>

      <footer className="studio-panels-modal-footer">
        <p className="studio-dialog-note">{t("editPanels.closeKeepsChanges")}</p>
        {/* Ghost, not the accent-filled primary: the screen already spends its
            one primary on Publish. */}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t("editPanels.close")}
        </button>
      </footer>
    </dialog>
  );
}

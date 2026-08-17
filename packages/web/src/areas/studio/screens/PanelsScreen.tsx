import { useState } from "react";
import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { seedLocalizedText } from "../draft/localized-text";
import {
  flattenRailFields,
  issueCountForEntityId,
  issueCountForEntityType,
  issueCountForSource,
  panelEntityCounts,
} from "../draft/panel-rail";
import type { EntityType } from "../draft/issues";

type DraftDataSource = DraftOf<DataSourceDef>;
import { PANEL_VIEWS, type PanelView } from "../routing";
import { FieldCatalogPanel } from "../panels/FieldCatalogPanel";
import { DataSourcesPanel } from "../panels/DataSourcesPanel";
import { ContractPanel } from "../panels/ContractPanel";
import { FieldMatrixPanel } from "../panels/FieldMatrixPanel";
import { ChecksRail } from "../panels/ChecksRail";

export { PANEL_VIEWS, type PanelView };

const VIEW_LABEL: Record<PanelView, CatalogKey> = {
  fields: "fieldCatalog.heading",
  dataSources: "dataSources.heading",
  contract: "contract.heading",
  matrix: "fieldMatrix.heading",
};

/** One `EntityType` per view — the dimension `resolveLoc` reports an issue in
 * this view under. Contract issues all land on the single `"contract"` id.
 * Matrix carries no entry: `checkViewFlags` issues share `entityType: "step"`
 * with every other per-step issue, so its rail badge counts by `source`
 * instead (`issueCountForSource`, below). */
const VIEW_ENTITY_TYPE: Record<Exclude<PanelView, "matrix">, EntityType> = {
  fields: "field",
  dataSources: "dataSource",
  contract: "contract",
};

interface Props {
  openView: PanelView;
  onBack: () => void;
  onOpenView: (view: PanelView) => void;
  token: string;
}

/**
 * The four process-wide panels — field catalogue, data sources, contract,
 * field matrix — on their own routed screen (`studio-app`'s panels-screen
 * requirements).
 *
 * It replaced a native `<dialog>`. The overlay hid the checks rail while an
 * author edited field keys and data source keys, and those two produce most of
 * what that rail reports. A screen gives the rail its own column. The route
 * also gives a view an address, which `showModal()` on component state could
 * not: no link reached a view, Back did not close it, and a reload landed on
 * the canvas.
 *
 * All four views stay MOUNTED and three hide. Rendering only the open one
 * would drop `ContractPanel`'s half-typed outcome name (its own `useState`)
 * and refetch `DataSourcesPanel`'s list keys on every switch, and it would
 * drop the field matrix's selected cell. `hidden` keeps the subtree and
 * takes it out of the accessibility tree, with no CSS of ours.
 *
 * The screen carries no Save. Every panel writes straight into the in-browser
 * draft through `useDraft()`, and the edit screen's own toolbar stays the only
 * thing that persists. The note beside Back states that, so leaving never
 * reads as a cancel.
 */
export function PanelsScreen({ openView, onBack, onOpenView, token }: Props) {
  const { draft, mutate, validation, contentLocale } = useDraft();

  const railFields = flattenRailFields(draft.fields);
  const dataSources = draft.dataSources ?? [];
  const entityCount = panelEntityCounts(draft);

  // Both selections are component state, not an address: a canvas round trip
  // unmounts this screen and resets them to the first entity, which is what
  // resolving-on-every-render against the current draft gives for free.
  const [selectedFieldIdState, setSelectedFieldId] = useState<string | undefined>(undefined);
  const [selectedDataSourceIdState, setSelectedDataSourceId] = useState<string | undefined>(undefined);

  const topLevelFieldIds = (draft.fields ?? [])
    .map((f) => f.id)
    .filter((id): id is NonNullable<typeof id> => id !== undefined) as string[];
  const selectedFieldId =
    selectedFieldIdState !== undefined && topLevelFieldIds.includes(selectedFieldIdState)
      ? selectedFieldIdState
      : topLevelFieldIds[0];

  const dataSourceIds = dataSources
    .map((ds) => ds.id)
    .filter((id): id is NonNullable<typeof id> => id !== undefined) as string[];
  const selectedDataSourceId =
    selectedDataSourceIdState !== undefined && dataSourceIds.includes(selectedDataSourceIdState)
      ? selectedDataSourceIdState
      : dataSourceIds[0];

  const addField = () => {
    const field: DraftField = { id: mintId("field"), key: "", label: seedLocalizedText(contentLocale), type: "string" };
    addToDraftArray(mutate, (d) => (d.fields ??= []), field);
    setSelectedFieldId(field.id);
  };

  const removeField = (index: number) => {
    const fields = draft.fields ?? [];
    const neighbor = fields[index + 1] ?? fields[index - 1];
    mutate((d) => {
      d.fields?.splice(index, 1);
    });
    setSelectedFieldId(neighbor?.id);
  };

  const addDataSource = () => {
    const dataSource: DraftDataSource = { id: mintId("dataSource"), key: "", type: "", config: {} };
    addToDraftArray(mutate, (d) => (d.dataSources ??= []), dataSource);
    setSelectedDataSourceId(dataSource.id);
  };

  const removeDataSource = (index: number) => {
    const neighbor = dataSources[index + 1] ?? dataSources[index - 1];
    mutate((d) => {
      d.dataSources?.splice(index, 1);
    });
    setSelectedDataSourceId(neighbor?.id);
  };

  // Layout read, so it runs on click rather than during render.
  const scrollToField = (fieldId: string) => {
    document.getElementById(`field-row-${fieldId}`)?.scrollIntoView({ block: "start" });
  };

  const selectField = (rootId: string, deepestId: string) => {
    onOpenView("fields");
    setSelectedFieldId(rootId);
    scrollToField(deepestId);
  };

  return (
    // A fragment, so the header and the layout are `.studio-edit-screen`'s own
    // flex children, as `.studio-canvas-layout` is. The layout's height comes
    // from that chain; app.css states what it takes to make it fit.
    <>
      {/* The view's name sits here, not above the panel: each panel renders
          its own heading, and a second copy directly above it read as a
          duplicate on screen. */}
      <header className="studio-panels-screen-header">
        <button type="button" className="btn btn-ghost studio-back" onClick={onBack}>
          {t("panelsScreen.backToCanvas")}
        </button>
        <h1 className="studio-panels-screen-heading">{t(VIEW_LABEL[openView])}</h1>
        <p className="studio-panels-screen-note">{t("panelsScreen.keepsChanges")}</p>
      </header>

      <div className="studio-panels-screen-layout">
        <nav className="studio-panels-rail" aria-label={t("panelsScreen.railLabel")}>
          <ul className="studio-panels-rail-list">
            {PANEL_VIEWS.map((view) => {
              // The matrix's badge counts `source: "view"` findings instead: its
              // issues share `entityType: "step"` with every other per-step
              // issue, so `VIEW_ENTITY_TYPE` carries no entry for it.
              const issues =
                view === "matrix"
                  ? issueCountForSource(validation.issues, "view")
                  : issueCountForEntityType(validation.issues, VIEW_ENTITY_TYPE[view]);
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
                  {/* Contract holds one editor, so it carries no sub-list. A
                      sub-list renders only under the open view: two at once
                      would overflow the rail's 16rem column. */}
                  {view === "fields" && view === openView && (
                    <ul className="studio-panels-rail-sublist">
                      {railFields.map((row) => {
                        const rowIssues = issueCountForEntityId(validation.issues, row.id);
                        return (
                          <li key={row.id}>
                            <button
                              type="button"
                              className="studio-panels-rail-field"
                              data-depth={row.depth}
                              aria-current={selectedFieldId === row.rootId ? "true" : undefined}
                              onClick={() => selectField(row.rootId, row.id)}
                            >
                              <span className="studio-panels-rail-name">
                                {row.key === "" ? t("panelsScreen.unnamedField") : row.key}
                              </span>
                              {rowIssues > 0 && (
                                <span
                                  className="studio-panels-rail-issues"
                                  aria-label={`${rowIssues} ${t("panelsScreen.issueMark")}`}
                                >
                                  {rowIssues}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                      <li>
                        <button type="button" className="studio-panels-rail-field" onClick={addField}>
                          {t("fieldCatalog.addField")}
                        </button>
                      </li>
                    </ul>
                  )}
                  {view === "dataSources" && view === openView && (
                    <ul className="studio-panels-rail-sublist">
                      {dataSources.map((ds) => {
                        if (ds.id === undefined) return null;
                        const dsIssues = issueCountForEntityId(validation.issues, ds.id);
                        return (
                          <li key={ds.id}>
                            <button
                              type="button"
                              className="studio-panels-rail-field"
                              aria-current={selectedDataSourceId === ds.id ? "true" : undefined}
                              onClick={() => setSelectedDataSourceId(ds.id)}
                            >
                              <span className="studio-panels-rail-name">
                                {ds.key === "" || ds.key === undefined ? t("panelsScreen.unnamedDataSource") : ds.key}
                              </span>
                              {dsIssues > 0 && (
                                <span
                                  className="studio-panels-rail-issues"
                                  aria-label={`${dsIssues} ${t("panelsScreen.issueMark")}`}
                                >
                                  {dsIssues}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                      <li>
                        <button type="button" className="studio-panels-rail-field" onClick={addDataSource}>
                          {t("dataSources.addDataSource")}
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="studio-panels-screen-view">
          {/* All four mount; `hidden` shows one. See the component note. */}
          <div hidden={openView !== "fields"}>
            <FieldCatalogPanel token={token} selectedId={selectedFieldId} onAdd={addField} onRemove={removeField} />
          </div>
          <div hidden={openView !== "dataSources"}>
            <DataSourcesPanel
              token={token}
              selectedId={selectedDataSourceId}
              onAdd={addDataSource}
              onRemove={removeDataSource}
            />
          </div>
          <div hidden={openView !== "contract"}>
            <ContractPanel />
          </div>
          <div hidden={openView !== "matrix"}>
            <FieldMatrixPanel />
          </div>
        </main>

        {/* Full grouped list, not the collapsed summary: that form exists
            because a canvas selection takes the third column for an inspector,
            and this screen carries neither. */}
        <ChecksRail validation={validation} />
      </div>
    </>
  );
}

import { useState } from "react";
import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { flattenDraftFields } from "../draft/fields";
import { FIELD_TYPE_LABELS } from "../draft/field-type-labels";
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
 * instead (`issueCountForSource`, below). Since technical-field-marker, that
 * `view`-source count also includes `checkUnwrittenTechnicalFields`'
 * field-anchored finding, which the Fields view's own `issueCountForEntityType`
 * badge surfaces correctly (design.md Risks). */
const VIEW_ENTITY_TYPE: Record<Exclude<PanelView, "matrix">, EntityType> = {
  fields: "field",
  dataSources: "dataSource",
  contract: "contract",
};

interface PanelsRailFieldRowProps {
  /** The resolved label, or the "unnamed field" fallback already applied. */
  label: string;
  typeLabel: string | undefined;
  depth: 0 | 1;
  issues: number;
  selected: boolean;
  onClick: () => void;
}

/**
 * A Fields rail row: the resolved label, the friendly type, the issue mark —
 * one line (field-catalog-editor-rework). The row prints no `key`; the key
 * stays visible in the Field tab once an author selects that field, where
 * the engine's exact-match value already lives. Pulled out of the render
 * loop so it can be exercised directly, the same reason `FormEditorStrip`
 * sits beside `FormEditorScreen`.
 */
export function PanelsRailFieldRow({ label, typeLabel, depth, issues, selected, onClick }: PanelsRailFieldRowProps) {
  return (
    <button
      type="button"
      className="studio-panels-rail-field"
      data-depth={depth}
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
    >
      <span className="studio-panels-rail-name">{label}</span>
      {typeLabel && <span className="studio-panels-rail-type studio-mono">{typeLabel}</span>}
      {issues > 0 && (
        <span className="studio-panels-rail-issues" aria-label={`${issues} ${t("panelsScreen.issueMark")}`}>
          {issues}
        </span>
      )}
    </button>
  );
}

interface Props {
  openView: PanelView;
  onBack: () => void;
  onOpenView: (view: PanelView) => void;
  /** "Show on the canvas" (task 6.3): navigates back to the canvas with the
   * named step preselected, through the `edit` route's step target. */
  onShowStep: (stepId: string) => void;
  token: string;
  /** For this screen's own `ChecksRail` column. `EditorArea` mounts this
   * screen, so the loaded draft's report is already in scope one level up and
   * needs no second fetch. */
  canPublish: boolean;
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
export function PanelsScreen({ openView, onBack, onOpenView, onShowStep, token, canPublish }: Props) {
  const { draft, mutate, validation, contentLocale } = useDraft();

  const railFields = flattenRailFields(draft.fields);
  const fieldsById = new Map(flattenDraftFields(draft.fields).map((f) => [f.id as string | undefined, f]));
  const baseLocale = draft.baseLocale ?? "en";
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

  // The deepest row a rail click named — a top-level field's own id, or a
  // group child's. `FieldCatalogPanel` owns the scroll: a child's anchor
  // sits inside the Field tab alone (task 3.4), which stays `hidden` when a
  // group's own editor is already open on Values or Rules (no field.id
  // change, so no remount resets the tab). Scrolling here, before that tab
  // switch commits, would target a hidden, zero-height element and land
  // nowhere visible.
  const [focusFieldId, setFocusFieldId] = useState<string | undefined>(undefined);

  const selectField = (rootId: string, deepestId: string) => {
    onOpenView("fields");
    setSelectedFieldId(rootId);
    setFocusFieldId(deepestId);
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
              // issue, so `VIEW_ENTITY_TYPE` carries no entry for it. That count
              // over-reports by one per unwritten technical field, since
              // `checkUnwrittenTechnicalFields`' finding is field-anchored, not
              // step-anchored (design.md Risks) — the Fields view's own badge,
              // below, surfaces it correctly instead.
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
                        const field = fieldsById.get(row.id);
                        const label = field ? resolveDraftLocalizedText(field.label, contentLocale, baseLocale) : undefined;
                        const typeLabel = field && typeof field.type === "string" ? FIELD_TYPE_LABELS[field.type].name : undefined;
                        return (
                          <li key={row.id}>
                            <PanelsRailFieldRow
                              label={label || t("panelsScreen.unnamedField")}
                              typeLabel={typeLabel}
                              depth={row.depth}
                              issues={rowIssues}
                              selected={selectedFieldId === row.rootId}
                              onClick={() => selectField(row.rootId, row.id)}
                            />
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
            <FieldCatalogPanel
              token={token}
              selectedId={selectedFieldId}
              focusFieldId={focusFieldId}
              onAdd={addField}
              onRemove={removeField}
              onShowStep={onShowStep}
            />
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
        <ChecksRail validation={validation} canPublish={canPublish} />
      </div>
    </>
  );
}

import { useEffect, useState } from "react";
import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { flattenDraftFields } from "../draft/fields";
import { fieldKindWord } from "../draft/field-type-labels";
import { groupTargetsFor, moveFieldToGroup } from "../panels/fieldCatalogLogic";
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
  /** Every place this row's field may sit, the top level first and then each
   * group it may join. One entry alone renders the control disabled rather
   * than dropping it: `studio-app` requires every field entry to carry one.
   *
   * The set matches what a drop can reach, which is the point of the picker.
   * A single direction control reached the nearest group above and no other,
   * so a keyboard user could not name a second group at all.
   *
   * Each label is already resolved. The picker never prints a label at full
   * width: the option list opens over the rail, and the closed control shows
   * one truncated line. Measured before the truncation: a wrapped move
   * sentence on all 22 rows of `purchase_requisition` put the rail at 1867px
   * inside a 576px pane. */
  moveTargets: { id: string | undefined; label: string }[];
  /** The group this field sits in today, `undefined` at the top level. The
   * picker's own value, so the control states the membership it writes. */
  currentTargetId: string | undefined;
  /** The id the move control's own element takes, so the screen can put focus
   * back on it after the move re-orders the list (`spa-accessibility`). */
  moveControlId: string;
  onMoveTo: (targetId: string | undefined) => void;
  /** The pointer half of the same move. The row is the drag source and every
   * row is a drop target: dropping on a group moves the dragged field in,
   * dropping on a row outside any group moves it out. */
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  dragging: boolean;
}

/**
 * A Fields rail row: the resolved label, the field's kind, the issue mark,
 * and the move control beside them. The row prints no `key`; the key stays
 * visible in the definition half once an author selects that field, where
 * the engine's exact-match value already lives. Pulled out of the render
 * loop so it can be exercised directly, the same reason `FormEditorStrip`
 * sits beside `FormEditorScreen`.
 *
 * Two controls, two sibling buttons rather than one nested in the other: a
 * button inside a button is invalid markup, and the move has to be a real
 * control in the tab order (`spa-accessibility`). The wrapper carries the
 * row's hairline and its indentation, so the two read as one row.
 */
export function PanelsRailFieldRow({
  label,
  typeLabel,
  depth,
  issues,
  selected,
  onClick,
  moveTargets,
  currentTargetId,
  moveControlId,
  onMoveTo,
  onDragStart,
  onDragEnd,
  onDrop,
  dragging,
}: PanelsRailFieldRowProps) {
  const moveSentence = t("panelsScreen.moveTargetLabel");
  return (
    <div
      className="studio-panels-rail-field-row"
      data-depth={depth}
      data-dragging={dragging ? "true" : undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <button
        type="button"
        className="studio-panels-rail-field"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-current={selected ? "true" : undefined}
        onClick={onClick}
      >
        <span className="studio-panels-rail-name">{label}</span>
        {typeLabel && <span className="studio-panels-rail-type">{typeLabel}</span>}
        {issues > 0 && (
          <span className="studio-panels-rail-issues" aria-label={`${issues} ${t("panelsScreen.issueMark")}`}>
            {issues}
          </span>
        )}
      </button>
      {/* A target picker, not a direction button. The drop can reach any
          group by falling on its row, so the keyboard names every group too
          (`spa-accessibility`: the keyboard reaches what the drag reaches).
          One arrow reached the nearest group above and nothing else, which
          left a keyboard user unable to name a second group at all. The
          picker's own value states where the field sits today, so the
          control reads the membership it also writes. */}
      <select
        id={moveControlId}
        className="studio-panels-rail-move"
        disabled={moveTargets.length < 2}
        aria-label={moveSentence}
        title={moveSentence}
        value={currentTargetId ?? ""}
        onChange={(e) => onMoveTo(e.target.value === "" ? undefined : e.target.value)}
      >
        {moveTargets.map((target) => (
          <option key={target.id ?? ""} value={target.id ?? ""}>
            {target.label}
          </option>
        ))}
      </select>
    </div>
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
  /** For this screen's own docked `ChecksRail`. `EditorArea` mounts this
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
 * what that rail reports. A screen keeps the rail on screen, docked at the
 * bottom edge as the collapsed summary. The route also gives a view an
 * address, which `showModal()` on component state could not: no link reached a
 * view, Back did not close it, and a reload landed on the canvas.
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

  // Whether the index rail's list shows below the breakpoint, where the rail
  // is a disclosure header rather than a column. It starts closed: the header
  // exists so the open view reaches the top of a narrow window. Above the
  // breakpoint app.css ignores it and the list always shows, so a window
  // widened while the rail is closed does not lose the rail.
  const [railOpen, setRailOpen] = useState(false);

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
  // group child's. `FieldCatalogPanel` owns the scroll, because the anchor
  // this names belongs to a row that panel renders. A click on a group child
  // changes no `field.id`, so the panel does not remount, and only the panel
  // knows when the row for that child is on screen. Scrolling from here would
  // race that render and land nowhere.
  const [focusFieldId, setFocusFieldId] = useState<string | undefined>(undefined);

  const selectField = (rootId: string, deepestId: string) => {
    onOpenView("fields");
    setSelectedFieldId(rootId);
    setFocusFieldId(deepestId);
  };

  // The move gesture's own three pieces of state. `dragFieldId` is the row a
  // pointer picked up; `announcement` is what the live region below reads out
  // after a move; `refocusId` is the move control the keyboard has to get back
  // (`spa-accessibility`: the moving entry keeps focus across the move).
  const [dragFieldId, setDragFieldId] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [refocusId, setRefocusId] = useState<string | undefined>(undefined);

  // React reorders keyed rows by moving the existing DOM nodes, which usually
  // carries focus along. It does not where the move changes which controls the
  // row renders, so the screen names the control it wants and takes it back
  // itself rather than resting on the reconciler.
  useEffect(() => {
    if (refocusId === undefined) return;
    document.getElementById(refocusId)?.focus();
    setRefocusId(undefined);
  }, [refocusId]);

  const moveControlId = (fieldId: string) => `studio-panels-rail-move-${fieldId}`;

  const fieldWord = (fieldId: string | undefined) => {
    const field = fieldId === undefined ? undefined : fieldsById.get(fieldId);
    const label = field ? resolveDraftLocalizedText(field.label, contentLocale, baseLocale) : undefined;
    return label || t("panelsScreen.unnamedField");
  };

  /** The group a rail row currently hangs in, or `undefined` at the top level. */
  const parentGroupId = (fieldId: string): string | undefined =>
    flattenDraftFields(draft.fields).find((f) => (f.fields ?? []).some((c) => c.id === fieldId))?.id;

  /**
   * The one write both gestures reach (design.md Risks: a keyboard move must
   * not become a second write path beside the drag). It re-hangs the field,
   * keeps it selected through its new top-level ancestor, announces where it
   * landed, and hands focus back to the row's own move control.
   */
  const moveField = (fieldId: string, targetGroupId: string | undefined) => {
    const fields = draft.fields ?? [];
    const next = moveFieldToGroup(fields, fieldId, targetGroupId);
    if (next === fields) return;

    const fromGroupId = parentGroupId(fieldId);
    mutate((d) => {
      d.fields = next;
    });

    // Read the new place off the moved tree, not off the target argument: a
    // move into a nested group makes some ancestor the top-level row, and that
    // ancestor is what the selection has to name.
    const landed = flattenRailFields(next).find((row) => row.id === fieldId);
    if (landed) {
      setSelectedFieldId(landed.rootId);
      setFocusFieldId(fieldId);
    }
    setAnnouncement(
      targetGroupId === undefined
        ? t("panelsScreen.movedToTopLevel").replace("{field}", fieldWord(fieldId)).replace("{group}", fieldWord(fromGroupId))
        : t("panelsScreen.movedIntoGroup").replace("{field}", fieldWord(fieldId)).replace("{group}", fieldWord(targetGroupId)),
    );
    setRefocusId(moveControlId(fieldId));
  };

  /** Where a drop on `targetId` sends the dragged field: into it when it is a
   * group, out to the top level when it is not. */
  const dropOnRow = (targetId: string) => {
    if (dragFieldId === undefined || dragFieldId === targetId) return;
    const target = fieldsById.get(targetId);
    moveField(dragFieldId, target?.type === "group" ? targetId : undefined);
    setDragFieldId(undefined);
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
        <nav className="studio-panels-rail" aria-label={t("panelsScreen.railLabel")} data-open={railOpen ? "true" : undefined}>
          {/* The rail's disclosure header. It renders always and app.css draws
              it only below the breakpoint, where the three regions stack and
              the rail would otherwise push the open view a screen down. Above
              that width the button is `display: none`, so it leaves the tab
              order and the accessibility tree, and the list shows whatever
              `railOpen` says. */}
          <button
            type="button"
            className="studio-panels-rail-disclosure"
            aria-expanded={railOpen}
            aria-controls="studio-panels-rail-list"
            onClick={() => setRailOpen((open) => !open)}
          >
            {t("panelsScreen.railLabel")}
          </button>
          <ul className="studio-panels-rail-list" id="studio-panels-rail-list">
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
                        // The kind, not the base type: the same word the
                        // definition half's kind picker shows for this field
                        // (task 7.3).
                        const typeLabel = field ? fieldKindWord(field) : undefined;
                        // Every place this field may sit: the top level, then
                        // each group a drop could also reach. Built per row
                        // because the excluded set is the row's own subtree.
                        //
                        // The current parent rides along when it is not one of
                        // those groups. A field can sit inside a parent that is
                        // no group: `changeKind` rewrites a field's type and
                        // leaves its `fields` in place, so a group turned into
                        // a Text field keeps its children, and `flattenRailFields`
                        // keeps drawing them. The picker's value has to name an
                        // option the picker holds, or React drops the selection
                        // and the row reads as top-level while it is nested.
                        // That parent is nobody else's destination, so it is
                        // listed here alone, and only to state where this one
                        // field sits today.
                        const parentId = parentGroupId(row.id);
                        const groupTargets = groupTargetsFor(draft.fields ?? [], row.id);
                        const orphanedParent = parentId !== undefined && !groupTargets.includes(parentId) ? [parentId] : [];
                        const moveTargets = [undefined, ...orphanedParent, ...groupTargets].map((id) => ({
                          id,
                          label: id === undefined ? t("panelsScreen.moveTargetTopLevel") : fieldWord(id),
                        }));
                        return (
                          <li key={row.id}>
                            <PanelsRailFieldRow
                              label={label || t("panelsScreen.unnamedField")}
                              typeLabel={typeLabel}
                              depth={row.depth}
                              issues={rowIssues}
                              selected={selectedFieldId === row.rootId}
                              onClick={() => selectField(row.rootId, row.id)}
                              moveTargets={moveTargets}
                              currentTargetId={parentId}
                              moveControlId={moveControlId(row.id)}
                              onMoveTo={(targetId) => moveField(row.id, targetId)}
                              onDragStart={() => setDragFieldId(row.id)}
                              onDragEnd={() => setDragFieldId(undefined)}
                              onDrop={() => dropOnRow(row.id)}
                              dragging={dragFieldId === row.id}
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
          {/* The move's own announcement. Polite, so it waits for a screen
              reader to finish whatever it is reading rather than cutting the
              row's own name off mid-word. It renders always: a live region
              added to the DOM at the same moment its text arrives is announced
              by no engine reliably. */}
          <p className="studio-visually-hidden" role="status" aria-live="polite" aria-label={t("panelsScreen.moveAnnouncerLabel")}>
            {announcement}
          </p>
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

      </div>

      {/* The collapsed summary at the screen's bottom edge, not a standing
          third column (task 7.4). The draft-wide checks and the publish
          verdict ride here; a check on the selected field stands at its own
          zone inside the open view instead. The column that stood here went to
          the open view, which the Fields view's two halves needed. */}
      <ChecksRail validation={validation} canPublish={canPublish} collapsed />
    </>
  );
}

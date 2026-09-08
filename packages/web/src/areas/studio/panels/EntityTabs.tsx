import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { flattenDraftFields } from "../draft/fields";
import { fieldKindWord } from "../draft/field-type-labels";
import { groupTargetsFor, moveFieldToGroup } from "./fieldCatalogLogic";
import { flattenRailFields, issueCountForEntityId } from "../draft/panel-rail";
import { FieldCatalogPanel } from "./FieldCatalogPanel";
import { DataSourcesPanel } from "./DataSourcesPanel";

type DraftDataSource = DraftOf<DataSourceDef>;

/** Below this width the rail and the open editor no longer fit beside one
 * another. The rail holds its 16rem, and `FieldCatalogPanel` stacks its own
 * two halves at the same width, so the whole tab turns at once. */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  // Below the breakpoint the rail and the editor fall under one another, in
  // source order: list, then the editor.
  layout: {
    display: "grid",
    flex: "1 1 0",
    gridTemplateColumns: { default: "16rem minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
    gridTemplateRows: { default: "none", [NARROW]: "auto minmax(0, 1fr)" },
    gap: space.s3,
    alignItems: "stretch",
    minHeight: 0,
    height: "100%",
    overflow: "hidden",
  },
  layoutChild: {
    minHeight: 0,
  },
  editor: {
    overflowY: "auto",
    overscrollBehavior: "contain",
    minWidth: 0,
  },
  // Below the breakpoint the rail gives up its column, so its right edge no
  // longer separates anything. The cap keeps a long list from taking the whole
  // row and squeezing the editor to nothing.
  rail: {
    borderRightWidth: { default: 2, [NARROW]: 0 },
    borderRightStyle: "solid",
    borderRightColor: colors.divider,
    maxHeight: { default: "none", [NARROW]: "20rem" },
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  railList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  railRow: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // `[aria-current="true"]`: a JS-computed choice reading the same
  // `aria-current` the button already carries.
  railRowCurrent: {
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
  },
  railRowIndented: {
    paddingLeft: space.s6,
  },
  // A Fields row holds two controls: the row itself and its move control.
  // The wrapper carries the hairline and the indentation the single button
  // carried before, so the pair still reads as one register row. One line,
  // no wrap: the move control is a fixed cell, so nothing on this row is
  // measured off an English label.
  railFieldRow: {
    display: "flex",
    alignItems: "baseline",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // The row a pointer has picked up. Reduced opacity alone, no transform:
  // the drop target is the row under the cursor, and moving the source would
  // say the list re-orders live, which it does not.
  railFieldRowDragging: {
    opacity: 0.5,
  },
  // Inside a row the button shares the line, so it takes the remainder
  // rather than the `width: 100%` its standalone form uses for "+ Add field"
  // and the data-source entries. The wrapper draws the hairline.
  railFieldInRow: {
    flex: "1 1 9rem",
    minWidth: 0,
    width: "auto",
    borderBottomWidth: 0,
    cursor: "grab",
  },
  // `studio-app` requires the rail entry to name its field on one line.
  // `minWidth: 0` lets the flex item shrink below its content's width; the
  // three properties below then truncate instead of wrapping into it.
  //
  // A real `4.5rem` basis, not the zero basis `flex: 1` carries, and not
  // `railType`'s own auto (content-tracking) basis either. A first pass
  // gave the name `flex: "1 1 7rem"` and left `railType` on its default
  // `0 1 auto` — measured (`getBoundingClientRect` against `scrollWidth`
  // on the live rail) to starve `railType` even for a four-character kind
  // like "Date", because 7rem alone already exceeds this button's ~86px
  // typical combined budget for the two spans, and an auto-basis kind
  // shrinks proportionally right along with it. `railType` below now
  // carries a matching fixed `3rem` basis instead of auto, so a short kind
  // word's claim on the row no longer depends on how little it needs —
  // both spans get a floor sized off the measured typical budget, name
  // larger since it is the row's primary text.
  railName: {
    flex: "1 1 4.5rem",
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // The written face carries two weights and no third, so the selected
  // row's name takes 800 rather than a tint the hover wash would collide
  // with.
  railNameSelected: {
    fontWeight: 800,
  },
  // The field's kind — a word an author reads, so the written face, not
  // mono. A fixed `3rem` basis, not auto: see `railName`'s comment above.
  // `minWidth: 0` and the truncation keep a long German kind name
  // ("Mehrfachauswahl") on the rail's one line, inside its 16rem column.
  railType: {
    flex: "0 1 3rem",
    minWidth: 0,
    fontSize: "0.8rem",
    color: colors.textMuted,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // The move target picker. A select rather than a direction button, because
  // a drop reaches every group and the keyboard has to reach the same set.
  // Its options carry group labels, which are prose, so it truncates instead
  // of wrapping: the closed control shares a 16rem column with the row's own
  // name and kind, and the option list opens over the rail at full width.
  // Disabled, it keeps its place — every field entry carries one, as
  // `studio-app` requires — and states that it has nothing to do rather than
  // vanishing between renders.
  railMove: {
    flex: "0 1 auto",
    minWidth: 0,
    maxWidth: "7rem",
    backgroundColor: colors.surface,
    color: { default: colors.textMuted, ":hover": colors.text, ":disabled": colors.textMuted },
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    font: "inherit",
    fontSize: "0.8rem",
    lineHeight: 1.4,
    textOverflow: "ellipsis",
    opacity: { default: 1, ":disabled": 0.5 },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
  },
  // The live region the move announces through. Off screen, never
  // `display: none`: a hidden region is announced by no engine.
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  railIssues: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
  },
});

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
  /** The id the move control's own element takes, so the tab can put focus
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
      {...stylex.props(
        styles.railFieldRow,
        depth === 1 && styles.railRowIndented,
        dragging && styles.railFieldRowDragging,
      )}
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
        {...stylex.props(styles.railRow, styles.railFieldInRow, selected && styles.railRowCurrent)}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-current={selected ? "true" : undefined}
        onClick={onClick}
      >
        <span title={label} {...stylex.props(styles.railName, selected && styles.railNameSelected)}>
          {label}
        </span>
        {typeLabel && (
          <span title={typeLabel} {...stylex.props(styles.railType)}>
            {typeLabel}
          </span>
        )}
        {issues > 0 && (
          <span {...stylex.props(styles.railIssues)} aria-label={`${issues} ${t("panelsScreen.issueMark")}`}>
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
        {...stylex.props(styles.railMove)}
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

const moveControlId = (fieldId: string) => `studio-panels-rail-move-${fieldId}`;

/**
 * The Fields tab: the catalog's own entity rail beside the open field's
 * editor (`studio-app`). The rail survives the index rail's removal because a
 * field still moves into a group and out of it from a row.
 *
 * The selection lives in component state and takes no address of its own. The
 * tab stays mounted for as long as the process surface is open, so a switch
 * away and back keeps whatever the author had selected.
 */
export function FieldsTab({ token, onShowStep }: { token: string; onShowStep: (stepId: string) => void }) {
  const { draft, mutate, validation, contentLocale } = useDraft();

  const railFields = flattenRailFields(draft.fields);
  const fieldsById = new Map(flattenDraftFields(draft.fields).map((f) => [f.id as string | undefined, f]));
  const baseLocale = draft.baseLocale ?? "en";

  const [selectedFieldIdState, setSelectedFieldId] = useState<string | undefined>(undefined);
  // The deepest row a rail click named — a top-level field's own id, or a
  // group child's. `FieldCatalogPanel` owns the scroll, because the anchor
  // this names belongs to a row that panel renders.
  const [focusFieldId, setFocusFieldId] = useState<string | undefined>(undefined);

  // The move gesture's own three pieces of state. `dragFieldId` is the row a
  // pointer picked up; `announcement` is what the live region below reads out
  // after a move; `refocusId` is the move control the keyboard has to get back
  // (`spa-accessibility`: the moving entry keeps focus across the move).
  const [dragFieldId, setDragFieldId] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [refocusId, setRefocusId] = useState<string | undefined>(undefined);

  const topLevelFieldIds = (draft.fields ?? [])
    .map((f) => f.id)
    .filter((id): id is NonNullable<typeof id> => id !== undefined) as string[];
  const selectedFieldId =
    selectedFieldIdState !== undefined && topLevelFieldIds.includes(selectedFieldIdState)
      ? selectedFieldIdState
      : topLevelFieldIds[0];

  // React reorders keyed rows by moving the existing DOM nodes, which usually
  // carries focus along. It does not where the move changes which controls the
  // row renders, so the tab names the control it wants and takes it back
  // itself rather than resting on the reconciler.
  useEffect(() => {
    if (refocusId === undefined) return;
    document.getElementById(refocusId)?.focus();
    setRefocusId(undefined);
  }, [refocusId]);

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

  const fieldWord = (fieldId: string | undefined) => {
    const field = fieldId === undefined ? undefined : fieldsById.get(fieldId);
    const label = field ? resolveDraftLocalizedText(field.label, contentLocale, baseLocale) : undefined;
    return label || t("panelsScreen.unnamedField");
  };

  /** The group a rail row currently hangs in, or `undefined` at the top level. */
  const parentGroupId = (fieldId: string): string | undefined =>
    flattenDraftFields(draft.fields).find((f) => (f.fields ?? []).some((c) => c.id === fieldId))?.id;

  /**
   * The one write both gestures reach (a keyboard move must not become a
   * second write path beside the drag). It re-hangs the field, keeps it
   * selected through its new top-level ancestor, announces where it landed,
   * and hands focus back to the row's own move control.
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
    <div {...stylex.props(styles.layout)}>
      <nav {...stylex.props(styles.rail, styles.layoutChild)} aria-label={t("panelsScreen.railLabel")}>
        <ul {...stylex.props(styles.railList)}>
          {railFields.map((row) => {
            const rowIssues = issueCountForEntityId(validation.issues, row.id);
            const field = fieldsById.get(row.id);
            const label = field ? resolveDraftLocalizedText(field.label, contentLocale, baseLocale) : undefined;
            // The kind, not the base type: the same word the definition half's
            // kind picker shows for this field.
            const typeLabel = field ? fieldKindWord(field) : undefined;
            // Every place this field may sit: the top level, then each group a
            // drop could also reach. Built per row because the excluded set is
            // the row's own subtree.
            //
            // The current parent rides along when it is not one of those
            // groups. A field can sit inside a parent that is no group:
            // `changeKind` rewrites a field's type and leaves its `fields` in
            // place, so a group turned into a Text field keeps its children,
            // and `flattenRailFields` keeps drawing them. The picker's value
            // has to name an option the picker holds, or React drops the
            // selection and the row reads as top-level while it is nested.
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
                  onClick={() => {
                    setSelectedFieldId(row.rootId);
                    setFocusFieldId(row.id);
                  }}
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
            <button type="button" {...stylex.props(styles.railRow)} onClick={addField}>
              {t("fieldCatalog.addField")}
            </button>
          </li>
        </ul>
        {/* The move's own announcement. Polite, so it waits for a screen
            reader to finish whatever it is reading rather than cutting the
            row's own name off mid-word. It renders always: a live region
            added to the DOM at the same moment its text arrives is announced
            by no engine reliably. */}
        <p {...stylex.props(styles.visuallyHidden)} role="status" aria-live="polite" aria-label={t("panelsScreen.moveAnnouncerLabel")}>
          {announcement}
        </p>
      </nav>
      <div {...stylex.props(styles.editor, styles.layoutChild)}>
        <FieldCatalogPanel
          token={token}
          selectedId={selectedFieldId}
          focusFieldId={focusFieldId}
          onAdd={addField}
          onRemove={removeField}
          onShowStep={onShowStep}
        />
      </div>
    </div>
  );
}

/**
 * The Data sources tab: the declared sources' own entity rail beside the open
 * source's editor. A data source nests under nothing, so no entry carries a
 * move control.
 */
export function DataSourcesTab({ token }: { token: string }) {
  const { draft, mutate, validation } = useDraft();
  const dataSources = draft.dataSources ?? [];

  const [selectedDataSourceIdState, setSelectedDataSourceId] = useState<string | undefined>(undefined);

  const dataSourceIds = dataSources
    .map((ds) => ds.id)
    .filter((id): id is NonNullable<typeof id> => id !== undefined) as string[];
  const selectedDataSourceId =
    selectedDataSourceIdState !== undefined && dataSourceIds.includes(selectedDataSourceIdState)
      ? selectedDataSourceIdState
      : dataSourceIds[0];

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

  return (
    <div {...stylex.props(styles.layout)}>
      <nav {...stylex.props(styles.rail, styles.layoutChild)} aria-label={t("panelsScreen.railLabel")}>
        <ul {...stylex.props(styles.railList)}>
          {dataSources.map((ds) => {
            if (ds.id === undefined) return null;
            const dsIssues = issueCountForEntityId(validation.issues, ds.id);
            return (
              <li key={ds.id}>
                <button
                  type="button"
                  {...stylex.props(styles.railRow, selectedDataSourceId === ds.id && styles.railRowCurrent)}
                  aria-current={selectedDataSourceId === ds.id ? "true" : undefined}
                  onClick={() => setSelectedDataSourceId(ds.id)}
                >
                  <span
                    title={ds.key === "" || ds.key === undefined ? t("panelsScreen.unnamedDataSource") : ds.key}
                    {...stylex.props(styles.railName)}
                  >
                    {ds.key === "" || ds.key === undefined ? t("panelsScreen.unnamedDataSource") : ds.key}
                  </span>
                  {dsIssues > 0 && (
                    <span {...stylex.props(styles.railIssues)} aria-label={`${dsIssues} ${t("panelsScreen.issueMark")}`}>
                      {dsIssues}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" {...stylex.props(styles.railRow)} onClick={addDataSource}>
              {t("dataSources.addDataSource")}
            </button>
          </li>
        </ul>
      </nav>
      <div {...stylex.props(styles.editor, styles.layoutChild)}>
        <DataSourcesPanel
          token={token}
          selectedId={selectedDataSourceId}
          onAdd={addDataSource}
          onRemove={removeDataSource}
        />
      </div>
    </div>
  );
}

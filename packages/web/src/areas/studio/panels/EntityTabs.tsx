import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { DataSourceDef } from "workflow-engine/schema";
import type { LucideIcon } from "lucide-react";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray } from "../draft/draft-array-crud";
import { resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { flattenDraftFields } from "../draft/fields";
import { fieldKindIcon, fieldKindWord } from "../draft/field-type-labels";
import {
  ADD_FIRST_FIELD_ID,
  appendToGroup,
  fieldLabelInputId,
  focusAfterRemove,
  moveControlId,
  moveFieldToGroup,
  neighbourAfterRemove,
  parentIdOf,
  railEntryId,
  removalAnnouncement,
  removeControlId,
} from "./fieldCatalogLogic";
import { flattenRailFields, issueCountForEntityId } from "../draft/panel-rail";
import { moveFieldAndSyncViews } from "../draft/view-group-sync";
import { fieldRemovalReach, hasReach, removeFieldAndReferences, type FieldRemovalReach } from "../draft/field-removal";
import { FieldCatalogPanel } from "./FieldCatalogPanel";
import { RemoveFieldDialog } from "./RemoveFieldDialog";
import { DataSourcesPanel } from "./DataSourcesPanel";

type DraftDataSource = DraftOf<DataSourceDef>;

/** Below this width the rail and the open editor no longer fit beside one
 * another. The rail holds its 20rem, and `FieldCatalogPanel` stacks its own
 * two halves at the same width, so the whole tab turns at once. */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  // Below the breakpoint the rail and the editor fall under one another, in
  // source order: list, then the editor.
  layout: {
    display: "grid",
    flex: "1 1 0",
    gridTemplateColumns: { default: "20rem minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
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
    // Contains each row's hidden kind word and group name, plus the live
    // region announcing field moves and removals; a positioned container
    // clips and scrolls them instead of the page.
    position: "relative",
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
  // The row's own wrapper: it carries the hairline, the indentation and the
  // drop target for the field's drag (`studio-app`). The move control lives
  // in the field's own editor, not on this row.
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
  // The wrapper still draws the hairline and the indentation, so the button
  // takes the remainder of the row rather than the `width: 100%` its
  // standalone form uses for "+ Add field" and the data-source entries. An
  // SVG has no text baseline, so the row centers instead of the shared
  // `railRow`'s `baseline`.
  railFieldInRow: {
    flex: "1 1 9rem",
    minWidth: 0,
    width: "auto",
    borderBottomWidth: 0,
    alignItems: "center",
    cursor: "grab",
  },
  // `studio-app` requires the rail entry to name its field on one line.
  // `minWidth: 0` lets the flex item shrink below its content's width; the
  // three properties below then truncate instead of wrapping into it. A
  // real `4.5rem` basis, not the zero basis `flex: 1` carries: the name is
  // the row's primary text, so it claims the row ahead of the icon and the
  // issue mark rather than sharing evenly with them.
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
  // The field's kind icon, leading the label (design.md, decision: "One
  // icon per kind"). `aria-hidden` on this wrapper: the kind name reaches
  // the button's accessible name as hidden text beside the label instead,
  // so a screen reader never hears the kind twice.
  railKindIcon: {
    flex: "none",
    display: "inline-flex",
    color: colors.textMuted,
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
  /** The DOM id for the entry's own button, `railEntryId(fieldId)`. Lets the
   * refocus effect scroll the entry into the rail's view after an add or a
   * move through the move control
   * (design.md, "Focus and the rail entry after an add or a move"). The same
   * effect focuses the entry after a removal. Every entry `FieldsTab` renders
   * passes one. */
  id?: string;
  /** The resolved label, or the "unnamed field" fallback already applied. */
  label: string;
  typeLabel: string | undefined;
  /** The resolved label of the field that holds this entry's field, or the
   * "unnamed field" fallback already applied, given for a nested entry alone.
   * It reaches the button's accessible name as hidden text after the kind name
   * and prints nothing visible. A screen reader hears no indent, and a field
   * past the rail's indent cap draws at depth 0 (design.md, "A nested rail
   * entry names its group in hidden text"). */
  groupLabel?: string;
  depth: 0 | 1;
  issues: number;
  selected: boolean;
  onClick: () => void;
  /** The field's kind icon, leading the label (design.md, decision: "One
   * icon per kind"). `undefined` only where the row names no field at all —
   * every other case pairs it with `typeLabel`. */
  kindIcon: LucideIcon | undefined;
  /** The pointer half of the move (`studio-app`). The row is the drag source
   * and every row is a drop target: dropping on a group moves the dragged
   * field in, dropping on a row outside any group moves it out. The
   * keyboard route is the move control in the field's own editor
   * (`spa-accessibility`). */
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  dragging: boolean;
}

/**
 * A Fields rail row: the kind icon, the resolved label, and the issue mark,
 * in one button. The row prints no `key` and no visible kind word; the key
 * stays in the definition half once an author selects that field. The kind
 * name is the icon's tooltip, and it stays in the button's accessible name
 * as hidden text (design.md, decision: "The kind name stays inside the
 * button, visually hidden"). A nested entry's button also names the group
 * holding its field, as hidden text after the kind name. Pulled out of the
 * render loop so it can be exercised directly, the same reason
 * `FormEditorStrip` sits beside `FormEditorScreen`.
 *
 * The row moves a field by drag alone; the keyboard route is the move
 * control in the field's own editor (`spa-accessibility`). The wrapper still
 * carries the row's hairline, its indentation and the drop target, so the
 * one button still reads as one row.
 */
export function PanelsRailFieldRow({
  id,
  label,
  typeLabel,
  groupLabel,
  kindIcon: KindIcon,
  depth,
  issues,
  selected,
  onClick,
  onDragStart,
  onDragEnd,
  onDrop,
  dragging,
}: PanelsRailFieldRowProps) {
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
        id={id}
        type="button"
        {...stylex.props(styles.railRow, styles.railFieldInRow, selected && styles.railRowCurrent)}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        aria-current={selected ? "true" : undefined}
        onClick={onClick}
      >
        {/* `aria-hidden` here, not on the icon alone: a `title` on an
            element holding no text still counts toward the button's name,
            and the kind name already reaches that name as hidden text
            below. With the attribute on the icon alone a screen reader
            would hear the kind twice. */}
        {KindIcon && (
          <span aria-hidden="true" title={typeLabel} {...stylex.props(styles.railKindIcon)}>
            <KindIcon size={18} strokeWidth={1.75} />
          </span>
        )}
        <span title={label} {...stylex.props(styles.railName, selected && styles.railNameSelected)}>
          {label}
        </span>
        {typeLabel && <span {...stylex.props(styles.visuallyHidden)}>{typeLabel}</span>}
        {groupLabel !== undefined && (
          <span {...stylex.props(styles.visuallyHidden)}>{t("panelsScreen.railEntryGroup").replace("{group}", groupLabel)}</span>
        )}
        {issues > 0 && (
          <span {...stylex.props(styles.railIssues)} aria-label={`${issues} ${t("panelsScreen.issueMark")}`}>
            {issues}
          </span>
        )}
      </button>
    </div>
  );
}

/** A removal `FieldsTab::requestRemove` has measured: the field, its label as
 * the entity rail resolves it, and the removal's reach. The dialog's heading
 * and the announcement read this one label, so the two name the field alike. */
interface FieldRemoval {
  fieldId: string;
  label: string;
  reach: FieldRemovalReach;
}

/**
 * The Fields tab: the catalog's own entity rail beside the open field's
 * editor (`studio-app`). The rail survives the index rail's removal because a
 * field still moves into a group and out of it from a row.
 *
 * The selection lives in component state and takes no address of its own. The
 * tab stays mounted for as long as the process surface is open, so a switch
 * away and back keeps whatever the author had selected.
 */
export function FieldsTab({
  token,
  visible,
  onShowStep,
}: {
  token: string;
  /** False while the Fields tab hides. Every tab body stays mounted and nine
   * hide, so a browser Back can hide this tab while its removal dialog stands
   * open. A hide declines that removal. */
  visible: boolean;
  onShowStep: (stepId: string) => void;
}) {
  const { draft, mutate, validation, contentLocale } = useDraft();

  const railFields = flattenRailFields(draft.fields);
  const fieldsById = new Map(flattenDraftFields(draft.fields).map((f) => [f.id as string | undefined, f]));
  const baseLocale = draft.baseLocale ?? "en";

  const [selectedFieldIdState, setSelectedFieldId] = useState<string | undefined>(undefined);

  // `dragFieldId` is the row a pointer picked up. `announcement` is what the
  // live region below reads out after a move or a removal. `refocusId` names
  // the element the tab hands keyboard focus to after the next commit: the new
  // field's label input after any add, the move control after a move through
  // that control (`spa-accessibility`), or `focusAfterRemove`'s answer after a
  // removal. `refocusRailId` names the rail entry that commit scrolls into the
  // rail's view: the added or moved field's own, or the entry a removal
  // focuses. Every add, every move and every removal sets `refocusId`. Each
  // sets `refocusRailId` too. A removal that focuses the first-field control
  // sets it to undefined. A pointer drop clears both again.
  const [dragFieldId, setDragFieldId] = useState<string | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");
  const [refocusId, setRefocusId] = useState<string | undefined>(undefined);
  const [refocusRailId, setRefocusRailId] = useState<string | undefined>(undefined);

  // `pendingRemoval` is the removal `RemoveFieldDialog` asks about, while the
  // dialog stays open. `removeTriggerRef` holds that removal's Remove field
  // control, where `useConfirmDialog` returns focus on a decline.
  // `announcementFrame` holds the frame a removal's sentence waits for.
  const [pendingRemoval, setPendingRemoval] = useState<FieldRemoval | undefined>(undefined);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const announcementFrame = useRef<number | undefined>(undefined);

  // A hide declines the pending removal. The update runs during this render,
  // so no commit holds the dialog inside a hidden tab body, where it would
  // stay modal: out of sight, yet blocking every click on the tab the author
  // sees. A return to the tab shows no dialog, and the next press measures
  // the reach again.
  if (!visible && pendingRemoval !== undefined) setPendingRemoval(undefined);

  // Resolved against every field id, at any depth — `railFields` already
  // lists one row per field, from `flattenRailFields`. Falls back to the
  // first rail entry when the stored id names no field in the tree.
  const selectedFieldId =
    selectedFieldIdState !== undefined && railFields.some((row) => row.id === selectedFieldIdState)
      ? selectedFieldIdState
      : railFields[0]?.id;

  // The editor pane scrolls on its own; opening a different field's editor
  // resets that scroll to the top rather than keeping the previous field's
  // position. `behavior: "instant"` makes the jump immediate whatever
  // `scroll-behavior` a stylesheet sets.
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    editorRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedFieldId]);

  // The effect runs after the commit, since a new field's label input exists
  // only then. It focuses that input after an add, and re-asserts focus on the
  // move control after a move through that control. The same run scrolls the
  // field's rail entry into the rail's view, `nearest`
  // (design.md, "Focus and the rail entry after an add or a move"). After a
  // removal it focuses what `focusAfterRemove` names, a rail entry or the
  // start state's first-field control, and scrolls a rail entry into view the
  // same way. By then the removed field's editor has left the DOM with Remove
  // field, and the start state exists only from that commit on (design.md,
  // decision: "The tab renders the dialog, and focus follows the removal").
  useEffect(() => {
    if (refocusId === undefined) return;
    document.getElementById(refocusId)?.focus();
    if (refocusRailId !== undefined) {
      document.getElementById(refocusRailId)?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
    setRefocusId(undefined);
    setRefocusRailId(undefined);
  }, [refocusId, refocusRailId]);

  /** Drops a removal's sentence still waiting for its frame, so it never lands
   * over a newer write to the live region. */
  const cancelAnnouncementFrame = () => {
    if (announcementFrame.current === undefined) return;
    cancelAnimationFrame(announcementFrame.current);
    announcementFrame.current = undefined;
  };
  // An unmounted tab has no live region left to write, so a waiting frame goes
  // with it.
  useEffect(() => () => cancelAnnouncementFrame(), []);

  /**
   * Every add reaches this: the rail's "+ Add field", the start state, the
   * panel's own "+ Add field" and a group's "Fields inside this group" zone.
   * Without `groupId` the new field lands at the catalog's end; with one, at
   * the end of that group. Each path ends the same way: the new field
   * selected, keyboard focus in its label input, and its rail entry in the
   * rail's view.
   */
  const addField = (groupId?: string) => {
    const newId = mintId("field");
    const field: DraftField = { id: newId, key: "", label: seedLocalizedText(contentLocale), type: "string" };
    if (groupId === undefined) {
      addToDraftArray(mutate, (d) => (d.fields ??= []), field);
    } else {
      mutate((d) => {
        d.fields = appendToGroup(d.fields ?? [], groupId, field);
      });
    }
    setSelectedFieldId(newId);
    setRefocusId(fieldLabelInputId(newId));
    setRefocusRailId(railEntryId(newId));
  };

  const fieldWord = (fieldId: string | undefined) => {
    const field = fieldId === undefined ? undefined : fieldsById.get(fieldId);
    const label = field ? resolveDraftLocalizedText(field.label, contentLocale, baseLocale) : undefined;
    return label || t("panelsScreen.unnamedField");
  };

  /**
   * Remove field's press in the selected field's editor reaches this, as
   * `FieldCatalogPanel`'s `onRemove`. It measures the removal's reach on this
   * render's draft, once per press. A removal with no reach runs at once. One
   * with reach waits in `pendingRemoval` for `RemoveFieldDialog`, which the
   * tab renders outside the keyed `FieldEditor`: a confirm mounts a new
   * editor, and that remount must not take the dialog along mid-press
   * (design.md, decision: "The tab renders the dialog, and focus follows the
   * removal"). The trigger ref points at the pressed control, found by
   * `removeControlId`, so a decline hands focus back to it. An id no field
   * carries does nothing.
   */
  const requestRemove = (fieldId: string) => {
    const reach = fieldRemovalReach(draft, fieldId);
    if (reach === undefined) return;
    const removal: FieldRemoval = { fieldId, label: fieldWord(fieldId), reach };
    if (!hasReach(reach)) {
      removeField(removal);
      return;
    }
    const trigger = document.getElementById(removeControlId(fieldId));
    removeTriggerRef.current = trigger instanceof HTMLButtonElement ? trigger : null;
    setPendingRemoval(removal);
  };

  /**
   * Makes a removal `requestRemove` measured, at once or on the dialog's
   * confirm. One `mutate` runs `removeFieldAndReferences`, so the field, every
   * field below it and every id reference to them outside a plugin `config`
   * leave in one draft change (design.md, decision: "One recipe collects, then
   * cleans, then prunes").
   * The tab then selects `neighbourAfterRemove`'s answer (design.md: "Remove
   * selects a sibling, then the group") and hands keyboard focus to
   * `focusAfterRemove`'s. Both read the draft in this closure, which still
   * holds the removed field.
   *
   * The announcement names the field by `label`, which `requestRemove`
   * resolved before this `mutate` with the rail's own fallback. The dialog's
   * heading reads the same string (design.md, "Announcements and the live
   * region's name"). The region empties first and takes the sentence on the
   * next animation frame. Two removals in a row with one sentence, as two
   * unnamed fields give, would otherwise leave the region's text unchanged,
   * and an unchanged text announces nothing.
   */
  const removeField = ({ fieldId, label, reach }: FieldRemoval) => {
    const fields = draft.fields ?? [];
    const neighbour = neighbourAfterRemove(fields, fieldId);
    const focusId = focusAfterRemove(fields, fieldId);
    mutate((d) => removeFieldAndReferences(d, fieldId));
    setSelectedFieldId(neighbour);
    setRefocusId(focusId);
    setRefocusRailId(focusId === ADD_FIRST_FIELD_ID ? undefined : focusId);

    cancelAnnouncementFrame();
    setAnnouncement("");
    const sentence = removalAnnouncement(label, reach.fieldsInside);
    announcementFrame.current = requestAnimationFrame(() => {
      announcementFrame.current = undefined;
      setAnnouncement(sentence);
    });
  };

  /**
   * The one write both gestures reach (a keyboard move must not become a
   * second write path beside the drag). It re-hangs the field, keeps the
   * moved field itself selected, announces where it landed, hands focus back
   * to the field's own move control in its editor, and scrolls the field's
   * rail entry into the rail's view. `dropOnRow` clears both refocus ids
   * again for a pointer drop.
   */
  const moveField = (fieldId: string, targetGroupId: string | undefined) => {
    const fields = draft.fields ?? [];
    const next = moveFieldToGroup(fields, fieldId, targetGroupId);
    if (next === fields) return;

    const fromGroupId = parentIdOf(fields, fieldId);
    // One mutate carries the field-array write, the `group` rewrite on every
    // view entry naming the field, and any group card a form now lacks, so a
    // reader never sees the catalog and the views disagree
    // (`view-group-sync.ts::moveFieldAndSyncViews`).
    mutate((d) => moveFieldAndSyncViews(d, fieldId, targetGroupId));

    // The moved field stays selected, under whichever parent it landed in.
    // Its own editor stays mounted across the move, since its key does not
    // change, so the move control the refocus effect targets below is still
    // there to take focus back.
    setSelectedFieldId(fieldId);
    cancelAnnouncementFrame();
    setAnnouncement(
      targetGroupId === undefined
        ? t("panelsScreen.movedToTopLevel").replace("{field}", fieldWord(fieldId)).replace("{group}", fieldWord(fromGroupId))
        : t("panelsScreen.movedIntoGroup").replace("{field}", fieldWord(fieldId)).replace("{group}", fieldWord(targetGroupId)),
    );
    setRefocusId(moveControlId(fieldId));
    setRefocusRailId(railEntryId(fieldId));
  };

  /** Where a drop on `targetId` sends the dragged field: into it when it is a
   * group, out to the top level when it is not. */
  const dropOnRow = (targetId: string) => {
    if (dragFieldId === undefined || dragFieldId === targetId) return;
    const target = fieldsById.get(targetId);
    moveField(dragFieldId, target?.type === "group" ? targetId : undefined);
    // A pointer drop is not a move "made through the control", so it must not
    // carry the keyboard focus into the editor the way a control-driven move
    // does (`spa-accessibility`). `moveField` and these calls batch into one
    // update, so the refocus effect never sees the ids `moveField` set. The
    // rail id clears too: only a run holding a `refocusId` resets it, so a
    // stale id would otherwise linger until that run.
    setRefocusId(undefined);
    setRefocusRailId(undefined);
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
            const kindIcon = field ? fieldKindIcon(field) : undefined;
            // The field that holds this one, at any depth. A field past the
            // indent cap draws at depth 0, and this still names the group
            // that holds it rather than the root.
            const parentId = parentIdOf(draft.fields ?? [], row.id);
            return (
              <li key={row.id}>
                <PanelsRailFieldRow
                  id={railEntryId(row.id)}
                  label={label || t("panelsScreen.unnamedField")}
                  typeLabel={typeLabel}
                  groupLabel={parentId === undefined ? undefined : fieldWord(parentId)}
                  kindIcon={kindIcon}
                  depth={row.depth}
                  issues={rowIssues}
                  selected={selectedFieldId === row.id}
                  onClick={() => setSelectedFieldId(row.id)}
                  onDragStart={() => setDragFieldId(row.id)}
                  onDragEnd={() => setDragFieldId(undefined)}
                  onDrop={() => dropOnRow(row.id)}
                  dragging={dragFieldId === row.id}
                />
              </li>
            );
          })}
          <li>
            <button type="button" {...stylex.props(styles.railRow)} onClick={() => addField()}>
              {t("fieldCatalog.addField")}
            </button>
          </li>
        </ul>
        {/* The announcement of each move and each removal. Polite, so it
            waits for a screen reader to finish whatever it is reading rather
            than cutting the row's own name off mid-word. It renders always: a
            live region added to the DOM at the same moment its text arrives
            is announced by no engine reliably. */}
        <p {...stylex.props(styles.visuallyHidden)} role="status" aria-live="polite" aria-label={t("panelsScreen.fieldAnnouncerLabel")}>
          {announcement}
        </p>
      </nav>
      <div ref={editorRef} {...stylex.props(styles.editor, styles.layoutChild)}>
        <FieldCatalogPanel
          token={token}
          selectedId={selectedFieldId}
          onAdd={addField}
          onRemove={requestRemove}
          onShowStep={onShowStep}
          onMoveField={moveField}
        />
      </div>
      {/* Outside the keyed `FieldEditor`, which a confirm remounts. A modal
          dialog sits in the top layer, so it takes no cell of this grid. A
          confirm clears the trigger ref before the dialog unmounts: the
          hook's focus return then finds nothing, and the refocus effect alone
          places focus. A decline keeps the ref, so focus returns to Remove
          field. A hide, such as a browser Back to another tab, declines too:
          the dialog renders only while the tab shows. The hook's focus return
          then reaches a hidden Remove field and does nothing, and the tab the
          Back opened keeps the page. */}
      {visible && pendingRemoval !== undefined && (
        <RemoveFieldDialog
          label={pendingRemoval.label}
          reach={pendingRemoval.reach}
          triggerRef={removeTriggerRef}
          onCancel={() => setPendingRemoval(undefined)}
          onConfirm={() => {
            removeTriggerRef.current = null;
            setPendingRemoval(undefined);
            removeField(pendingRemoval);
          }}
        />
      )}
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

import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { FieldId, Step, View, ViewNote } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import {
  clampSpan,
  dropSlot,
  insertViewField,
  insertViewNote,
  isDraftViewField,
  moveViewField,
  nudgeViewField,
  unplacedRefs,
  type DraftViewEntry,
  type DraftViewField,
  type DropSide,
} from "../draft/view-layout";
import { PALETTE_FIELD_KINDS, mintCatalogField, type PaletteFieldKind } from "../draft/mintField";
import { seedLocalizedText, missingTranslationWarning, resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text";
import { BooleanOrExpressionInput } from "../panels/shared/BooleanOrExpressionInput";
import { LocalizedTextInput } from "../panels/shared/LocalizedTextInput";
import { isExpression, type BoolOrExpr } from "../panels/shared/overrideMode";
import { effectiveFlag, gatedKeys, setFlag, writtenFieldCounts, type FlagKey, type WrittenAccessor } from "../draft/view-flags";

type DraftStep = DraftOf<Step>;
type DraftView = DraftOf<View>;

/** What the pointer is currently carrying. A palette drag either places an
 * existing catalog field or mints a new one; a card drag reorders one. All
 * three land on the same drop targets, so the payload says which array
 * change to make. */
type Dragging = { kind: "palette"; ref: FieldId } | { kind: "card"; index: number } | { kind: "mint"; fieldKind: PaletteFieldKind };

/** A field's `type` is either a literal type name or a `{ type, config }`
 * plugin envelope. A card shows the envelope's own `type`, and nothing at all
 * for a field whose type the author has not chosen yet. */
function typeLabel(type: DraftField["type"]): string | undefined {
  return typeof type === "string" ? type : type?.type;
}

const MINT_KIND_LABEL: Record<PaletteFieldKind, CatalogKey> = {
  text: "formEditor.mintText",
  choice: "formEditor.mintChoice",
  date: "formEditor.mintDate",
  file: "formEditor.mintFile",
  section: "formEditor.mintSection",
};

/** One override field: a plain checkbox, always reachable, and a
 * "Developer view" disclosure holding the same field's CEL escape hatch —
 * collapsed by default, per this change's `studio-form-editor` addition.
 * The checkbox reads the engine's resolved default for an absent key
 * (`effectiveFlag`), not `value === true`. Flipping it writes a literal
 * boolean regardless of what the value held before; an author who wants to
 * keep or edit the CEL opens the disclosure instead. `disabled` is set when
 * `visible: false` gates this flag off (`gatedKeys`). */
function OverrideField({
  label,
  value,
  flagKey,
  disabled,
  stepId,
  onChange,
}: {
  label: string;
  value: BoolOrExpr;
  flagKey: FlagKey;
  disabled?: boolean;
  stepId?: string;
  onChange: (next: BoolOrExpr) => void;
}) {
  const cel = isExpression(value);
  return (
    <div className="studio-form-strip-override">
      <label className="studio-form-strip-field">
        {label}
        <input
          type="checkbox"
          checked={effectiveFlag(value, flagKey) === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {cel && <span className="studio-form-cel">{t("formEditor.markCel")}</span>}
      <details className="studio-devview">
        <summary>{t("formEditor.developerView")}</summary>
        <BooleanOrExpressionInput label={label} value={value} flagKey={flagKey} stepId={stepId} onChange={onChange} />
      </details>
    </div>
  );
}

export interface FormEditorStripProps {
  row: DraftViewField;
  label: string;
  stepId: DraftStep["id"];
  ownStepIndex: number;
  written: WrittenAccessor;
  technicalFieldIds: Set<string>;
  isGroup: boolean;
  groupKeys: string[];
  onChangeFlag: (key: FlagKey, next: BoolOrExpr) => void;
  onChangeSpan: (span: 1 | 2) => void;
  onChangeGroup: (group: string | undefined) => void;
}

/**
 * The selected field's overrides — pulled out of `FormEditorScreen` so a
 * server render can exercise it directly with an arbitrary `row`, without
 * simulating the click that selects one (`renderToStaticMarkup` fires no DOM
 * events). Purely presentational: every write goes back through the two
 * callback props, `FormEditorScreen`'s own `setViewFlag`/`updateRow`.
 */
export function FormEditorStrip({
  row,
  label,
  stepId,
  ownStepIndex,
  written,
  technicalFieldIds,
  isGroup,
  groupKeys,
  onChangeFlag,
  onChangeSpan,
  onChangeGroup,
}: FormEditorStripProps) {
  // A technical field's view entry may declare neither key at all (the
  // definition contract rejects both) — the strip removes the `required`/
  // `readonly` controls entirely rather than disabling them, since a
  // settable-but-doomed control would only invite the rejected publish this
  // change exists to prevent (design.md). `visible`, `span` and `group` stay
  // offered unchanged.
  const isTechnical = row.ref !== undefined && technicalFieldIds.has(row.ref);
  return (
    <section className="studio-form-strip" aria-label={t("formEditor.stripLabel")}>
      <h3 className="studio-form-strip-heading">{label}</h3>
      <OverrideField
        label={t("formEditor.visible")}
        stepId={stepId}
        flagKey="visible"
        value={row.visible}
        onChange={(visible) => onChangeFlag("visible", visible)}
      />
      {!isTechnical && (
        <OverrideField
          label={t("formEditor.required")}
          stepId={stepId}
          flagKey="required"
          disabled={gatedKeys(row, written, technicalFieldIds, ownStepIndex).includes("required")}
          value={row.required}
          onChange={(required) => onChangeFlag("required", required)}
        />
      )}
      {!isTechnical && (
        <OverrideField
          label={t("formEditor.readonly")}
          stepId={stepId}
          flagKey="readonly"
          disabled={gatedKeys(row, written, technicalFieldIds, ownStepIndex).includes("readonly")}
          value={row.readonly}
          onChange={(readonly) => onChangeFlag("readonly", readonly)}
        />
      )}
      {/* No span control on a group: it draws at the form's full width and
          `form-ui` reads no span on it, so the control would write a value
          nothing renders. */}
      {!isGroup && (
        <label className="studio-form-strip-field">
          {t("formEditor.span")}
          <select value={String(row.span ?? 1)} onChange={(e) => onChangeSpan(Number(e.target.value) as 1 | 2)}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
      )}
      {/* Move-to-group, the third keyboard move command. A group is named by
          its key, which is what `ViewField.group` carries. */}
      <label className="studio-form-strip-field">
        {t("formEditor.group")}
        <select value={row.group ?? ""} onChange={(e) => onChangeGroup(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">{t("formEditor.noGroup")}</option>
          {groupKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

/** A note carries no `ref` for the group select's key attribute, unlike a
 * field row (`row.ref ?? rowIndex`); it keys by index alone, which costs
 * nothing here since `LocalizedTextInput` holds no state of its own
 * (task 5.4d). */
export interface NoteEditorStripProps {
  row: DraftOf<ViewNote>;
  stepId: DraftStep["id"];
  baseLocale: string | undefined;
  groupKeys: string[];
  onChangeText: (text: DraftLocalizedText) => void;
  onChangeVisible: (visible: BoolOrExpr) => void;
  onChangeSpan: (span: 1 | 2) => void;
  onChangeGroup: (group: string | undefined) => void;
}

/**
 * A selected note's strip (`studio-form-editor`'s "A note's strip sets its
 * text, its span, its group and its visibility"): the note's text, its
 * `visible` condition (the same input a field card's strip offers), its
 * span and its group. No requiredness, no readonly state, no validation —
 * a note carries none of those.
 */
export function NoteEditorStrip({ row, stepId, baseLocale, groupKeys, onChangeText, onChangeVisible, onChangeSpan, onChangeGroup }: NoteEditorStripProps) {
  const { contentLocale } = useDraft();
  return (
    <section className="studio-form-strip" aria-label={t("formEditor.stripLabel")}>
      <h3 className="studio-form-strip-heading">{t("formEditor.noteHeading")}</h3>
      <label className="studio-form-strip-field">
        {t("formEditor.noteText")}
        <LocalizedTextInput value={row.text} onChange={onChangeText} />
      </label>
      {missingTranslationWarning(row.text, contentLocale, baseLocale) && (
        <p className="studio-warning">{missingTranslationWarning(row.text, contentLocale, baseLocale)}</p>
      )}
      <OverrideField label={t("formEditor.visible")} stepId={stepId} flagKey="visible" value={row.visible} onChange={onChangeVisible} />
      <label className="studio-form-strip-field">
        {t("formEditor.span")}
        <select value={String(row.span ?? 1)} onChange={(e) => onChangeSpan(Number(e.target.value) as 1 | 2)}>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </label>
      <label className="studio-form-strip-field">
        {t("formEditor.group")}
        <select value={row.group ?? ""} onChange={(e) => onChangeGroup(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">{t("formEditor.noGroup")}</option>
          {groupKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

interface Props {
  /** The step whose view this page builds, and its index in
   * `workflow.steps` — the same pair `FormEditorDialog`'s `open` carried,
   * now the screen's own required props instead of an optional open state
   * (design.md: a routed sub-state of `edit`, not a toggled dialog). */
  step: DraftStep;
  index: number;
  fields: DraftField[];
  onBack: () => void;
}

/**
 * The visual form editor, as a full-screen routed page (`studio-form-editor`
 * capability): a palette of unplaced catalog fields plus an "add a field to
 * the process" mint section, a canvas that draws the form at its declared
 * column count, and a strip editing the selected field's overrides.
 *
 * No Save. Every change writes straight into the in-browser draft through
 * `mutate()`, the same call `ViewEditor`'s own `move()` used before it, and
 * `FormEditorDialog` after that. The screen's Save/Discard/Publish toolbar
 * stays the only thing that persists.
 */
export function FormEditorScreen({ step, index, fields, onBack }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const written = useMemo(() => writtenFieldCounts(draft), [draft]);
  // Threaded into both gatedKeys calls below (task 5.2) and this screen's own
  // control-omission logic (task 4.1) — computed once, from the already-flat
  // catalog this screen receives, rather than twice.
  const technicalIds = useMemo(
    () => new Set(fields.filter((f) => f.technical === true && f.id !== undefined).map((f) => f.id!)),
    [fields],
  );
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState<Dragging | undefined>(undefined);

  // The selection belongs to the step this page was opened for.
  useEffect(() => {
    setSelected(undefined);
  }, [step.id]);

  const rows: DraftViewEntry[] = step.view?.fields ?? [];
  // Absent means one column, which is the width every view had before
  // `view.columns` existed. A form built before this editor therefore opens
  // one-column with every card full width, in its existing array order.
  const columns: 1 | 2 = step.view?.columns === 2 ? 2 : 1;

  const writeView = (next: DraftView) => {
    updateInDraftArray<DraftStep>(mutate, (d) => d.workflow?.steps?.[index], { view: next });
  };

  const setRows = (next: DraftViewEntry[]) => {
    if (next === rows) return;
    writeView({ ...(step.view ?? {}), fields: next });
  };

  const setColumns = (next: 1 | 2) => {
    // The count is written even when it is 1: an author who narrows a form
    // said so, and the JSON view should show it.
    writeView({ ...(step.view ?? { fields: [] }), fields: rows, columns: next });
  };

  const updateRow = (rowIndex: number, patch: Partial<DraftViewEntry>) => {
    setRows(rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)));
  };

  /** The one writer for the three view flags: `setFlag` deletes a key on a
   * return to the engine's default instead of writing it, and deletes
   * `required`/`readonly` too when `visible` goes to literal `false`
   * (view-flags.ts). `updateRow`'s plain spread cannot delete a key. Also the
   * writer for a note's own `visible`: `setFlag`'s implementation touches no
   * field-only key unless `key` names one, so it is correct for either row
   * kind even though its declared parameter type names the field member
   * (design.md Risks: "A half-typed note card...", the `setFlag` site). */
  const setViewFlag = (rowIndex: number, key: FlagKey, next: BoolOrExpr) => {
    setRows(rows.map((r, i) => (i === rowIndex ? setFlag(r as DraftViewField, key, next) : r)));
  };

  const removeRow = (rowIndex: number) => {
    setRows(rows.filter((_, i) => i !== rowIndex));
    setSelected(undefined);
  };

  /** Mints a catalog field and places it on this step's view, in one Draft
   * mutation (task 3.2): both the new `fields` entry and the new `view`
   * row commit together, so a mid-mutation reader never sees one without
   * the other. */
  const mintAndPlace = (kind: PaletteFieldKind, slot: number) => {
    mutate((d) => {
      const field = mintCatalogField(kind, seedLocalizedText(contentLocale));
      d.fields ??= [];
      d.fields.push(field);
      const s = d.workflow?.steps?.[index];
      if (!s) return;
      s.view ??= { fields: [] };
      s.view.fields = insertViewField(s.view.fields ?? [], field.id!, slot);
    });
    setSelected(undefined);
  };

  /** Places a note at the end of the view, seeded with a non-empty entry for
   * the body's `baseLocale` (task 5.4a). A note inserted with no text at all
   * would parse against neither union member, failing the draft's whole
   * `authoredProcessBody.safeParse` and blanking every checks-rail dimension
   * after `zod` (design.md Risks: "A half-typed note card blanks the whole
   * checks rail"). */
  const insertNote = () => {
    const baseLocale = draft.baseLocale ?? "en";
    setRows(insertViewNote(rows, { [baseLocale]: t("formEditor.newNoteText") }, rows.length));
    setSelected(rows.length);
  };

  /** One drop handler for all three payloads: a palette field is inserted at
   * the slot, a mint entry is minted and inserted there, a card is moved to
   * it. */
  const dropAt = (slot: number) => {
    if (!dragging) return;
    if (dragging.kind === "palette") {
      setRows(insertViewField(rows, dragging.ref, slot));
      setSelected(undefined);
    } else if (dragging.kind === "mint") {
      mintAndPlace(dragging.fieldKind, slot);
    } else {
      setRows(moveViewField(rows, dragging.index, slot));
      // The selection is an array index, and a drop renumbers the array from
      // the slot on. Keeping it would leave the strip editing a different
      // field than the one the author last chose.
      setSelected(undefined);
    }
    setDragging(undefined);
  };

  const move = (rowIndex: number, delta: -1 | 1) => {
    const next = nudgeViewField(rows, rowIndex, delta);
    if (next === rows) return;
    setRows(next);
    setSelected(rowIndex + delta);
  };

  const fieldFor = (ref_: FieldId | undefined) => fields.find((f) => f.id === ref_);
  const labelFor = (ref_: FieldId | undefined) => fieldFor(ref_)?.key || ref_ || t("formEditor.unnamedField");
  /** A group's card always draws at the form's full width and `form-ui` reads
   * no `span` on it, so the canvas draws it that way and the strip offers no
   * span control for it. A note names no catalog field, so it is never a
   * group row. */
  const isGroupRow = (row: DraftViewEntry) => isDraftViewField(row) && fieldFor(row.ref)?.type === "group";

  const catalogIds = fields.map((f) => f.id).filter((id): id is FieldId => id !== undefined);
  const palette = unplacedRefs(catalogIds, rows);

  const groupKeys = rows
    .filter(isDraftViewField)
    .map((r) => fieldFor(r.ref))
    .filter((f) => f?.type === "group")
    .map((f) => f!.key)
    .filter((k): k is string => k !== undefined && k !== "");

  const selectedRow = selected !== undefined ? rows[selected] : undefined;

  return (
    <div className="studio-form-editor-page">
      <header className="studio-form-editor-header">
        <button type="button" className="btn btn-ghost studio-back" onClick={onBack}>
          {t("formEditor.backToCanvas")}
        </button>
        <h2 id="form-editor-heading">
          {t("formEditor.heading")}
          <span className="studio-form-editor-step">{resolveDraftLocalizedText(step.label, contentLocale, draft.baseLocale ?? "en") || step.key || t("steps.unnamedStep")}</span>
        </h2>
      </header>

      <div className="studio-form-editor-body">
        <nav className="studio-form-palette" aria-label={t("formEditor.paletteLabel")}>
          <h3 className="studio-form-palette-heading">{t("formEditor.paletteHeading")}</h3>
          {palette.length === 0 ? (
            <p className="empty">{t("formEditor.paletteEmpty")}</p>
          ) : (
            <ul className="studio-form-palette-list">
              {palette.map((id) => (
                <li key={id}>
                  {/* Draggable for a pointer, and a plain activation for a
                      keyboard: the same append the drop would make at the end. */}
                  <button
                    type="button"
                    className="studio-form-palette-field"
                    draggable
                    onDragStart={() => setDragging({ kind: "palette", ref: id })}
                    onDragEnd={() => setDragging(undefined)}
                    onClick={() => setRows(insertViewField(rows, id, rows.length))}
                  >
                    <span className="studio-form-palette-key">{labelFor(id)}</span>
                    <span className="studio-form-palette-type">{typeLabel(fieldFor(id)?.type)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="studio-form-palette-heading">{t("formEditor.mintHeading")}</h3>
          <ul className="studio-form-palette-list">
            {PALETTE_FIELD_KINDS.map((kind) => (
              <li key={kind}>
                {/* A dashed border, not a new color: the same "not there yet"
                    vocabulary a conditionally-visible card already carries
                    (`data-conditional`). Nothing here exists in the catalog
                    until the drop or the click mints it. */}
                <button
                  type="button"
                  className="studio-form-palette-field studio-form-palette-field-mint"
                  draggable
                  onDragStart={() => setDragging({ kind: "mint", fieldKind: kind })}
                  onDragEnd={() => setDragging(undefined)}
                  onClick={() => mintAndPlace(kind, rows.length)}
                >
                  <span className="studio-form-palette-key">{t(MINT_KIND_LABEL[kind])}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* A note belongs to no catalog, so it sits beside the palette
              rather than inside it (studio-form-editor: "An author places a
              note on the form canvas"). */}
          <h3 className="studio-form-palette-heading">{t("formEditor.noteSectionHeading")}</h3>
          <button type="button" className="btn btn-secondary studio-form-add-note" onClick={insertNote}>
            {t("formEditor.addNote")}
          </button>
        </nav>

        <div className="studio-form-canvas-region">
          {/* The visible label names the group rather than a second aria-label
              repeating it, so a screen reader announces one name, not two. */}
          <div className="studio-form-columns" role="group" aria-labelledby="form-editor-columns-label">
            <span className="studio-form-columns-label" id="form-editor-columns-label">
              {t("formEditor.columnsLabel")}
            </span>
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="btn btn-secondary studio-form-columns-option"
                aria-pressed={columns === n}
                onClick={() => setColumns(n)}
              >
                {n === 1 ? t("formEditor.oneColumn") : t("formEditor.twoColumns")}
              </button>
            ))}
          </div>

          <ol className="studio-form-canvas" data-columns={columns} aria-label={t("formEditor.canvasLabel")}>
            {rows.length === 0 && <li className="empty">{t("formEditor.canvasEmpty")}</li>}
            {rows.map((row, rowIndex) => {
              const isField = isDraftViewField(row);
              const field = isField ? fieldFor(row.ref) : undefined;
              const span = isGroupRow(row) ? columns : clampSpan(row.span, columns);
              const hiddenByExpression = isExpression(row.visible);
              const celMarked = isField && (isExpression(row.visible) || isExpression(row.required) || isExpression(row.readonly));
              const cardKey = isField ? `field:${row.ref}` : `note:${rowIndex}`;
              const cardLabel = isField ? labelFor(row.ref) : resolveDraftLocalizedText(row.text, contentLocale, draft.baseLocale ?? "en") || t("formEditor.emptyNote");
              const cardType = isField ? typeLabel(field?.type) : t("formEditor.noteType");
              const dropOn = (side: DropSide) => (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                dropAt(dropSlot(rowIndex, side));
              };
              const allowDrop = (e: DragEvent) => e.preventDefault();
              return (
                <li
                  key={cardKey}
                  className={isField ? "studio-form-card" : "studio-form-card studio-form-card-note"}
                  data-span={span}
                  data-selected={selected === rowIndex || undefined}
                  data-conditional={hiddenByExpression || undefined}
                  onDragOver={allowDrop}
                  onDrop={dropOn("after")}
                >
                  {/* Two thin edges rather than one whole-card target: a drop
                      names a side, and the side is what decides the slot. A
                      span-2 card owns its row, so both of its halves are the
                      same card and only these edges split it. */}
                  <span className="studio-form-card-edge" onDragOver={allowDrop} onDrop={dropOn("before")} aria-hidden="true" />
                  <button
                    type="button"
                    className="studio-form-card-body"
                    draggable
                    onDragStart={() => setDragging({ kind: "card", index: rowIndex })}
                    onDragEnd={() => setDragging(undefined)}
                    aria-pressed={selected === rowIndex}
                    onClick={() => setSelected(selected === rowIndex ? undefined : rowIndex)}
                  >
                    <span className={isField ? "studio-form-card-key" : "studio-form-card-note-preview"}>{cardLabel}</span>
                    <span className="studio-form-card-marks">
                      {isField && row.required === true && <span className="studio-form-mark">{t("formEditor.markRequired")}</span>}
                      {isField && row.readonly === true && <span className="studio-form-mark">{t("formEditor.markReadonly")}</span>}
                      {celMarked && <span className="studio-form-cel">{t("formEditor.markCel")}</span>}
                      <span className="studio-form-card-span">
                        {span}/{columns}
                      </span>
                    </span>
                    <span className="studio-form-card-type">{cardType}</span>
                  </button>
                  {/* The keyboard route to the same array change a drag makes.
                      A drag handle alone leaves reordering unreachable without
                      a pointer. */}
                  <span className="studio-form-card-moves">
                    <button type="button" className="btn btn-secondary" disabled={rowIndex === 0} onClick={() => move(rowIndex, -1)}>
                      {t("formEditor.moveUp")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={rowIndex === rows.length - 1}
                      onClick={() => move(rowIndex, 1)}
                    >
                      {t("formEditor.moveDown")}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => removeRow(rowIndex)}>
                      {t("formEditor.remove")}
                    </button>
                  </span>
                </li>
              );
            })}
            {/* The tail slot, so a card can be dropped past the last one. */}
            <li
              className="studio-form-canvas-tail"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                dropAt(rows.length);
              }}
            >
              {t("formEditor.dropHere")}
            </li>
          </ol>

          {selectedRow && isDraftViewField(selectedRow) ? (
            <FormEditorStrip
              row={selectedRow}
              label={labelFor(selectedRow.ref)}
              stepId={step.id}
              ownStepIndex={index}
              written={written}
              technicalFieldIds={technicalIds}
              isGroup={isGroupRow(selectedRow)}
              groupKeys={groupKeys}
              onChangeFlag={(key, next) => setViewFlag(selected!, key, next)}
              onChangeSpan={(span) => updateRow(selected!, { span })}
              onChangeGroup={(group) => updateRow(selected!, { group })}
            />
          ) : selectedRow ? (
            <NoteEditorStrip
              row={selectedRow}
              stepId={step.id}
              baseLocale={draft.baseLocale}
              groupKeys={groupKeys}
              onChangeText={(text) => updateRow(selected!, { text })}
              onChangeVisible={(visible) => setViewFlag(selected!, "visible", visible)}
              onChangeSpan={(span) => updateRow(selected!, { span })}
              onChangeGroup={(group) => updateRow(selected!, { group })}
            />
          ) : (
            <p className="studio-form-strip-empty">{t("formEditor.selectAField")}</p>
          )}
        </div>
      </div>

      <footer className="studio-form-editor-footer">
        <p className="studio-dialog-note">{t("formEditor.navigateAwayKeepsChanges")}</p>
      </footer>
    </div>
  );
}

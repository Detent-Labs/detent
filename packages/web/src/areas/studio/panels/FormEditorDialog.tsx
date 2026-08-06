import { useEffect, useRef, useState, type DragEvent } from "react";
import type { FieldId, Step, View } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import {
  clampSpan,
  dropSlot,
  insertViewField,
  moveViewField,
  nudgeViewField,
  unplacedRefs,
  type DraftViewField,
  type DropSide,
} from "../draft/view-layout";
import { BooleanOrExpressionInput } from "./shared/BooleanOrExpressionInput";
import { isExpression } from "./shared/overrideMode";

type DraftStep = DraftOf<Step>;
type DraftView = DraftOf<View>;

/** What the pointer is currently carrying. A palette drag adds a field; a card
 * drag reorders one. Both land on the same drop targets, so the payload says
 * which array change to make. */
type Dragging = { kind: "palette"; ref: FieldId } | { kind: "card"; index: number };

/** A field's `type` is either a literal type name or a `{ type, config }`
 * plugin envelope. A card shows the envelope's own `type`, and nothing at all
 * for a field whose type the author has not chosen yet. */
function typeLabel(type: DraftField["type"]): string | undefined {
  return typeof type === "string" ? type : type?.type;
}

interface Props {
  /** The step whose view is open, and its index in `workflow.steps`.
   * `undefined` while closed. */
  open: { step: DraftStep; index: number } | undefined;
  fields: DraftField[];
  onClose: () => void;
}

/**
 * The visual form editor: a palette of unplaced catalog fields, a canvas that
 * draws the form at its declared column count, and a strip editing the
 * selected field's overrides.
 *
 * It replaces `ViewEditor`'s override-row list. An author arranges the form by
 * moving cards on the canvas rather than by reading an ordered list of names,
 * and the canvas is the form: position on it IS the view array's order, read
 * left to right then down.
 *
 * The native `<dialog>` pattern `EditPanelsModal` already uses, so the platform
 * supplies `showModal()`, the focus trap, Escape and the backdrop.
 *
 * No Save. Every change writes straight into the in-browser draft through
 * `mutate()`, the same call `ViewEditor`'s own `move()` used. The screen's
 * Save/Discard/Publish toolbar stays the only thing that persists.
 */
export function FormEditorDialog({ open, fields, onClose }: Props) {
  const { mutate } = useDraft();
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState<Dragging | undefined>(undefined);

  // `showModal()` on an already-open dialog throws, and `close()` on a closed
  // one fires a spurious `close` event, so both are guarded on `open`.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open !== undefined && !dialog.open) dialog.showModal();
    if (open === undefined && dialog.open) dialog.close();
  }, [open]);

  // The selection belongs to the step it was made on.
  useEffect(() => {
    setSelected(undefined);
  }, [open?.step.id]);

  const rows: DraftViewField[] = open?.step.view?.fields ?? [];
  // Absent means one column, which is the width every view had before
  // `view.columns` existed. A form built before this editor therefore opens
  // one-column with every card full width, in its existing array order.
  const columns: 1 | 2 = open?.step.view?.columns === 2 ? 2 : 1;

  const writeView = (next: DraftView) => {
    if (!open) return;
    updateInDraftArray<DraftStep>(mutate, (d) => d.workflow?.steps?.[open.index], { view: next });
  };

  const setRows = (next: DraftViewField[]) => {
    if (next === rows) return;
    writeView({ ...(open?.step.view ?? {}), fields: next });
  };

  const setColumns = (next: 1 | 2) => {
    // The count is written even when it is 1: an author who narrows a form
    // said so, and the JSON view should show it.
    writeView({ ...(open?.step.view ?? { fields: [] }), fields: rows, columns: next });
  };

  const updateRow = (index: number, patch: Partial<DraftViewField>) => {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    setSelected(undefined);
  };

  /** One drop handler for both payloads: a palette field is inserted at the
   * slot, a card is moved to it. */
  const dropAt = (slot: number) => {
    if (!dragging) return;
    if (dragging.kind === "palette") {
      setRows(insertViewField(rows, dragging.ref, slot));
    } else {
      setRows(moveViewField(rows, dragging.index, slot));
    }
    setDragging(undefined);
    // The selection is an array index, and a drop renumbers the array from the
    // slot on. Keeping it would leave the strip editing a different field than
    // the one the author last chose.
    setSelected(undefined);
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = nudgeViewField(rows, index, delta);
    if (next === rows) return;
    setRows(next);
    setSelected(index + delta);
  };

  const fieldFor = (ref_: FieldId | undefined) => fields.find((f) => f.id === ref_);
  const labelFor = (ref_: FieldId | undefined) => fieldFor(ref_)?.key || ref_ || t("formEditor.unnamedField");

  const catalogIds = fields.map((f) => f.id).filter((id): id is FieldId => id !== undefined);
  const palette = unplacedRefs(catalogIds, rows);

  const groupKeys = rows
    .map((r) => fieldFor(r.ref))
    .filter((f) => f?.type === "group")
    .map((f) => f!.key)
    .filter((k): k is string => k !== undefined && k !== "");

  const selectedRow = selected !== undefined ? rows[selected] : undefined;

  return (
    <dialog
      ref={ref}
      className="studio-dialog studio-form-editor"
      aria-labelledby="form-editor-heading"
      onCancel={onClose}
      onClose={onClose}
    >
      <header className="studio-form-editor-header">
        <h2 id="form-editor-heading">
          {t("formEditor.heading")}
          {open && <span className="studio-form-editor-step">{open.step.key || t("steps.unnamedStep")}</span>}
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
            {rows.map((row, index) => {
              const field = fieldFor(row.ref);
              const span = clampSpan(row.span, columns);
              const hiddenByExpression = isExpression(row.visible);
              const celMarked = isExpression(row.visible) || isExpression(row.required) || isExpression(row.readonly);
              const dropOn = (side: DropSide) => (e: DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                dropAt(dropSlot(index, side));
              };
              const allowDrop = (e: DragEvent) => e.preventDefault();
              return (
                <li
                  key={row.ref ?? index}
                  className="studio-form-card"
                  data-span={span}
                  data-selected={selected === index || undefined}
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
                    onDragStart={() => setDragging({ kind: "card", index })}
                    onDragEnd={() => setDragging(undefined)}
                    aria-pressed={selected === index}
                    onClick={() => setSelected(selected === index ? undefined : index)}
                  >
                    <span className="studio-form-card-key">{labelFor(row.ref)}</span>
                    <span className="studio-form-card-marks">
                      {row.required === true && <span className="studio-form-mark">{t("formEditor.markRequired")}</span>}
                      {row.readonly === true && <span className="studio-form-mark">{t("formEditor.markReadonly")}</span>}
                      {celMarked && <span className="studio-form-cel">{t("formEditor.markCel")}</span>}
                      <span className="studio-form-card-span">{span}/{columns}</span>
                    </span>
                    <span className="studio-form-card-type">{typeLabel(field?.type)}</span>
                  </button>
                  {/* The keyboard route to the same array change a drag makes.
                      A drag handle alone leaves reordering unreachable without
                      a pointer. */}
                  <span className="studio-form-card-moves">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      {t("formEditor.moveUp")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={index === rows.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      {t("formEditor.moveDown")}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => removeRow(index)}>
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

          {selectedRow ? (
            <section className="studio-form-strip" aria-label={t("formEditor.stripLabel")}>
              <h3 className="studio-form-strip-heading">{labelFor(selectedRow.ref)}</h3>
              <BooleanOrExpressionInput
                label={t("formEditor.visible")}
                stepId={open?.step.id}
                value={selectedRow.visible}
                onChange={(visible) => updateRow(selected!, { visible })}
              />
              <BooleanOrExpressionInput
                label={t("formEditor.required")}
                stepId={open?.step.id}
                value={selectedRow.required}
                onChange={(required) => updateRow(selected!, { required })}
              />
              <BooleanOrExpressionInput
                label={t("formEditor.readonly")}
                stepId={open?.step.id}
                value={selectedRow.readonly}
                onChange={(readonly) => updateRow(selected!, { readonly })}
              />
              <label className="studio-form-strip-field">
                {t("formEditor.span")}
                <select
                  value={String(selectedRow.span ?? 1)}
                  onChange={(e) => updateRow(selected!, { span: Number(e.target.value) as 1 | 2 })}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              {/* Move-to-group, the third keyboard move command. A group is
                  named by its key, which is what `ViewField.group` carries. */}
              <label className="studio-form-strip-field">
                {t("formEditor.group")}
                <select
                  value={selectedRow.group ?? ""}
                  onChange={(e) => updateRow(selected!, { group: e.target.value === "" ? undefined : e.target.value })}
                >
                  <option value="">{t("formEditor.noGroup")}</option>
                  {groupKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : (
            <p className="studio-form-strip-empty">{t("formEditor.selectAField")}</p>
          )}
        </div>
      </div>

      <footer className="studio-form-editor-footer">
        <p className="studio-dialog-note">{t("formEditor.closeKeepsChanges")}</p>
        {/* Ghost, not the accent-filled primary: the screen already spends its
            one primary on Publish. */}
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t("formEditor.close")}
        </button>
      </footer>
    </dialog>
  );
}

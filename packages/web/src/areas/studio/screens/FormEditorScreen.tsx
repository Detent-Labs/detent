import { useEffect, useMemo, useState, type DragEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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

const styles = stylex.create({
  formStripOverride: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: "10rem",
  },
  formStripField: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  formCel: {
    fontFamily: fonts.mono,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.accent,
    border: "2px solid currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  studioDevview: {
    marginBlock: space.s2,
    marginInline: 0,
    border: `1px solid ${colors.border}`,
    paddingBlock: space.s1,
    paddingInline: space.s2,
  },
  studioDevviewSummary: {
    cursor: "pointer",
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
  },
  formStrip: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: space.s3,
    marginTop: space.s4,
    paddingTop: space.s3,
    borderTop: `2px solid ${colors.divider}`,
  },
  formStripHeading: {
    flexBasis: "100%",
    fontFamily: fonts.mono,
    margin: 0,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeft: `3px solid ${colors.accent400}`,
    paddingLeft: space.s2,
  },
  formEditorPage: {
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${colors.border}`,
  },
  formEditorHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    paddingBlock: space.s3,
    paddingInline: space.s4,
    borderBottom: `2px solid ${colors.divider}`,
  },
  // `.studio-form-editor-header .studio-back`.
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: 0,
  },
  // `.studio-form-editor-header h2`: a descendant selector on a bare `<h2>`.
  formEditorHeading: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    margin: 0,
  },
  formEditorStep: {
    fontFamily: fonts.mono,
    fontSize: "0.8em",
    color: colors.textMuted,
  },
  formEditorBody: {
    display: "grid",
    gridTemplateColumns: "16rem minmax(0, 1fr)",
    alignItems: "start",
  },
  formPalette: {
    borderRight: `2px solid ${colors.divider}`,
  },
  formPaletteHeading: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    margin: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderBottom: `1px solid ${colors.border}`,
  },
  // `.studio-form-palette-heading + .studio-form-palette-heading` and
  // `.studio-form-palette-list + .studio-form-palette-heading`: this file
  // knows at each of the three headings whether the sibling before it
  // matches, so the adjacency becomes a per-heading conditional.
  formPaletteHeadingBordered: {
    borderTop: `2px solid ${colors.divider}`,
  },
  formPaletteList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // `.studio-form-palette-field`, merged with the shared
  // `.studio-form-palette-field, .studio-form-card-body { user-select: none;
  // touch-action: manipulation }` declaration (D6) and its own `:hover`.
  formPaletteField: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    background: "none",
    color: "inherit",
    border: "none",
    borderBottom: `1px solid ${colors.border}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    userSelect: "none",
    touchAction: "manipulation",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  formPaletteFieldMint: {
    borderStyle: "dashed",
  },
  formPaletteKey: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.mono,
    overflowWrap: "anywhere",
  },
  formPaletteType: {
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
  formAddNote: {
    marginBlock: space.s2,
    marginInline: space.s3,
  },
  formCanvasRegion: {
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: space.s3,
    paddingInline: space.s4,
    minWidth: 0,
  },
  formColumns: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    paddingBottom: space.s3,
    borderBottom: `2px solid ${colors.divider}`,
    marginBottom: space.s3,
  },
  formColumnsLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  // `[aria-pressed="true"]`: a JS-computed choice reading the same
  // `aria-pressed` the button already carries.
  formColumnsOptionPressed: {
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
  },
  // `.studio-form-canvas` merges its own base declaration with the
  // `[data-columns="2"]` variant (D5's parameterized-style-function
  // pattern, the same shape `form-ui/FieldForm.tsx` already uses).
  formCanvasOneCol: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: space.s2,
  },
  formCanvasTwoCol: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: space.s2,
  },
  // `.studio-form-canvas[data-columns="2"] > [data-span="2"]`.
  formCardSpanTwo: {
    gridColumn: "span 2",
  },
  // `.studio-form-canvas > .empty`, merged with `.studio-form-canvas-tail`'s
  // own shared grid-column/color declaration (D6).
  formCanvasEmpty: {
    gridColumn: "1 / -1",
    color: colors.textMuted,
  },
  formCanvasTail: {
    gridColumn: "1 / -1",
    color: colors.textMuted,
    border: `1px dashed ${colors.border}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  formCard: {
    display: "flex",
    alignItems: "stretch",
    border: `1px solid ${colors.border}`,
    minWidth: 0,
  },
  // `[data-selected]`/`[data-conditional]`: JS-computed choices reading the
  // same booleans the data attributes already carry.
  formCardSelected: {
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
  },
  formCardConditional: {
    borderStyle: "dashed",
  },
  formCardEdge: {
    flex: `0 0 ${space.s2}`,
    borderRight: `1px solid ${colors.border}`,
  },
  // `.studio-form-card-body`, merged with the same shared user-select/
  // touch-action declaration `formPaletteField` carries (D6), plus `:hover`.
  formCardBody: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flex: 1,
    minWidth: 0,
    background: "none",
    color: "inherit",
    border: "none",
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    userSelect: "none",
    touchAction: "manipulation",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  formCardKey: {
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.mono,
    overflowWrap: "anywhere",
  },
  formCardNotePreview: {
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  formCardMarks: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s1,
  },
  // `.studio-form-mark, .studio-form-card-span, .studio-form-card-type`'s
  // shared declaration.
  formMachineMark: {
    fontFamily: fonts.mono,
    fontSize: "11px",
    color: colors.textMuted,
  },
  formCardSpan: {
    fontVariantNumeric: "tabular-nums",
  },
  formCardMoves: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    paddingRight: space.s2,
  },
  formStripEmpty: {
    marginTop: space.s4,
    paddingTop: space.s3,
    borderTop: `2px solid ${colors.divider}`,
    color: colors.textMuted,
  },
  formEditorFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s3,
    paddingBlock: space.s3,
    paddingInline: space.s4,
    borderTop: `2px solid ${colors.divider}`,
  },
  studioDialogNote: {
    color: colors.textMuted,
    fontSize: "0.9rem",
  },
  // `.studio-form-editor-footer .studio-dialog-note`.
  studioDialogNoteInFooter: {
    margin: 0,
  },
});

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
    <div {...stylex.props(styles.formStripOverride)}>
      <label {...stylex.props(styles.formStripField)}>
        {label}
        <input
          type="checkbox"
          checked={effectiveFlag(value, flagKey) === true}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
      {cel && <span {...stylex.props(styles.formCel)}>{t("formEditor.markCel")}</span>}
      <details {...stylex.props(styles.studioDevview)}>
        <summary {...stylex.props(styles.studioDevviewSummary)}>{t("formEditor.developerView")}</summary>
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
    <section {...stylex.props(styles.formStrip)} aria-label={t("formEditor.stripLabel")}>
      <h3 {...stylex.props(styles.formStripHeading)}>{label}</h3>
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
        <label {...stylex.props(styles.formStripField)}>
          {t("formEditor.span")}
          <select value={String(row.span ?? 1)} onChange={(e) => onChangeSpan(Number(e.target.value) as 1 | 2)}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
      )}
      {/* Move-to-group, the third keyboard move command. A group is named by
          its key, which is what `ViewField.group` carries. */}
      <label {...stylex.props(styles.formStripField)}>
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
    <section {...stylex.props(styles.formStrip)} aria-label={t("formEditor.stripLabel")}>
      <h3 {...stylex.props(styles.formStripHeading)}>{t("formEditor.noteHeading")}</h3>
      <label {...stylex.props(styles.formStripField)}>
        {t("formEditor.noteText")}
        <LocalizedTextInput value={row.text} onChange={onChangeText} />
      </label>
      {missingTranslationWarning(row.text, contentLocale, baseLocale) && (
        <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(row.text, contentLocale, baseLocale)}</p>
      )}
      <OverrideField label={t("formEditor.visible")} stepId={stepId} flagKey="visible" value={row.visible} onChange={onChangeVisible} />
      <label {...stylex.props(styles.formStripField)}>
        {t("formEditor.span")}
        <select value={String(row.span ?? 1)} onChange={(e) => onChangeSpan(Number(e.target.value) as 1 | 2)}>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </label>
      <label {...stylex.props(styles.formStripField)}>
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
    <div {...stylex.props(styles.formEditorPage)}>
      <header {...stylex.props(styles.formEditorHeader)}>
        <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={onBack}>
          {t("formEditor.backToCanvas")}
        </button>
        <h2 id="form-editor-heading" {...stylex.props(styles.formEditorHeading)}>
          {t("formEditor.heading")}
          <span {...stylex.props(styles.formEditorStep)}>{resolveDraftLocalizedText(step.label, contentLocale, draft.baseLocale ?? "en") || step.key || t("steps.unnamedStep")}</span>
        </h2>
      </header>

      <div {...stylex.props(styles.formEditorBody)}>
        <nav {...stylex.props(styles.formPalette)} aria-label={t("formEditor.paletteLabel")}>
          <h3 {...stylex.props(styles.formPaletteHeading)}>{t("formEditor.paletteHeading")}</h3>
          {palette.length === 0 ? (
            <p className="empty">{t("formEditor.paletteEmpty")}</p>
          ) : (
            <ul {...stylex.props(styles.formPaletteList)}>
              {palette.map((id) => (
                <li key={id}>
                  {/* Draggable for a pointer, and a plain activation for a
                      keyboard: the same append the drop would make at the end. */}
                  <button
                    type="button"
                    {...stylex.props(styles.formPaletteField)}
                    draggable
                    onDragStart={() => setDragging({ kind: "palette", ref: id })}
                    onDragEnd={() => setDragging(undefined)}
                    onClick={() => setRows(insertViewField(rows, id, rows.length))}
                  >
                    <span {...stylex.props(styles.formPaletteKey)}>{labelFor(id)}</span>
                    <span {...stylex.props(styles.formPaletteType)}>{typeLabel(fieldFor(id)?.type)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 {...stylex.props(styles.formPaletteHeading, palette.length > 0 && styles.formPaletteHeadingBordered)}>
            {t("formEditor.mintHeading")}
          </h3>
          <ul {...stylex.props(styles.formPaletteList)}>
            {PALETTE_FIELD_KINDS.map((kind) => (
              <li key={kind}>
                {/* A dashed border, not a new color: the same "not there yet"
                    vocabulary a conditionally-visible card already carries
                    (`data-conditional`). Nothing here exists in the catalog
                    until the drop or the click mints it. */}
                <button
                  type="button"
                  {...stylex.props(styles.formPaletteField, styles.formPaletteFieldMint)}
                  draggable
                  onDragStart={() => setDragging({ kind: "mint", fieldKind: kind })}
                  onDragEnd={() => setDragging(undefined)}
                  onClick={() => mintAndPlace(kind, rows.length)}
                >
                  <span {...stylex.props(styles.formPaletteKey)}>{t(MINT_KIND_LABEL[kind])}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* A note belongs to no catalog, so it sits beside the palette
              rather than inside it (studio-form-editor: "An author places a
              note on the form canvas"). */}
          <h3 {...stylex.props(styles.formPaletteHeading, styles.formPaletteHeadingBordered)}>{t("formEditor.noteSectionHeading")}</h3>
          <button type="button" className="btn btn-secondary" {...stylex.props(styles.formAddNote)} onClick={insertNote}>
            {t("formEditor.addNote")}
          </button>
        </nav>

        <div {...stylex.props(styles.formCanvasRegion)}>
          {/* The visible label names the group rather than a second aria-label
              repeating it, so a screen reader announces one name, not two. */}
          <div {...stylex.props(styles.formColumns)} role="group" aria-labelledby="form-editor-columns-label">
            <span {...stylex.props(styles.formColumnsLabel)} id="form-editor-columns-label">
              {t("formEditor.columnsLabel")}
            </span>
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="btn btn-secondary"
                {...stylex.props(columns === n && styles.formColumnsOptionPressed)}
                aria-pressed={columns === n}
                onClick={() => setColumns(n)}
              >
                {n === 1 ? t("formEditor.oneColumn") : t("formEditor.twoColumns")}
              </button>
            ))}
          </div>

          <ol
            {...stylex.props(columns === 2 ? styles.formCanvasTwoCol : styles.formCanvasOneCol)}
            data-columns={columns}
            aria-label={t("formEditor.canvasLabel")}
          >
            {rows.length === 0 && <li {...stylex.props(styles.formCanvasEmpty)}>{t("formEditor.canvasEmpty")}</li>}
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
              const cardProps = stylex.props(
                styles.formCard,
                selected === rowIndex && styles.formCardSelected,
                hiddenByExpression && styles.formCardConditional,
                columns === 2 && span === 2 && styles.formCardSpanTwo,
              );
              return (
                <li
                  key={cardKey}
                  className={isField ? cardProps.className : `studio-form-card-note ${cardProps.className}`}
                  style={cardProps.style}
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
                  <span {...stylex.props(styles.formCardEdge)} onDragOver={allowDrop} onDrop={dropOn("before")} aria-hidden="true" />
                  <button
                    type="button"
                    {...stylex.props(styles.formCardBody)}
                    draggable
                    onDragStart={() => setDragging({ kind: "card", index: rowIndex })}
                    onDragEnd={() => setDragging(undefined)}
                    aria-pressed={selected === rowIndex}
                    onClick={() => setSelected(selected === rowIndex ? undefined : rowIndex)}
                  >
                    <span {...stylex.props(isField ? styles.formCardKey : styles.formCardNotePreview)}>{cardLabel}</span>
                    <span {...stylex.props(styles.formCardMarks)}>
                      {isField && row.required === true && <span {...stylex.props(styles.formMachineMark)}>{t("formEditor.markRequired")}</span>}
                      {isField && row.readonly === true && <span {...stylex.props(styles.formMachineMark)}>{t("formEditor.markReadonly")}</span>}
                      {celMarked && <span {...stylex.props(styles.formCel)}>{t("formEditor.markCel")}</span>}
                      <span {...stylex.props(styles.formMachineMark, styles.formCardSpan)}>
                        {span}/{columns}
                      </span>
                    </span>
                    <span {...stylex.props(styles.formMachineMark)}>{cardType}</span>
                  </button>
                  {/* The keyboard route to the same array change a drag makes.
                      A drag handle alone leaves reordering unreachable without
                      a pointer. */}
                  <span {...stylex.props(styles.formCardMoves)}>
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
              {...stylex.props(styles.formCanvasTail)}
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
            <p {...stylex.props(styles.formStripEmpty)}>{t("formEditor.selectAField")}</p>
          )}
        </div>
      </div>

      <footer {...stylex.props(styles.formEditorFooter)}>
        <p {...stylex.props(styles.studioDialogNote, styles.studioDialogNoteInFooter)}>{t("formEditor.navigateAwayKeepsChanges")}</p>
      </footer>
    </div>
  );
}

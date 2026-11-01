import { useEffect, useMemo, useState, type DragEvent, type FocusEvent, type KeyboardEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, focus, fonts, space } from "form-ui/tokens.stylex";
import { FIELD_KINDS, type FieldId, type FieldKindName, type Step, type View, type ViewNote } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import {
  addViewTab,
  clampSpan,
  drawnRows,
  dropSlot,
  fillMissingTabs,
  insertViewField,
  insertViewNote,
  isDraftViewField,
  moveViewField,
  moveViewTab,
  owningTab,
  removeViewTab,
  renameViewTab,
  setEntryGroup,
  shownTab,
  tabAfterPlacement,
  unplacedRefs,
  type DraftViewEntry,
  type DraftViewField,
  type DraftViewTab,
  type DropSide,
} from "../draft/view-layout";
import {
  dragScopeByIndex,
  groupTailSlot,
  insertGroupedField,
  isLawfulCardDrop,
  landedIndex,
  nudgeViewField,
  removeViewEntry,
  viewTree,
  cardGroupKey,
  type DragScope,
  type ViewTreeNode,
} from "../draft/view-tree";
import { PALETTE_FIELD_KINDS, mintCatalogField } from "../draft/mintField";
import { writeFieldLabel } from "../draft/fieldLabel";
import { takenFieldKeys } from "../panels/fieldCatalogLogic";
import { usePublishedFieldIds } from "../draft/publishedFields";
import { seedLocalizedText, missingTranslationWarning, resolveDraftLocalizedText, type DraftLocalizedText } from "../draft/localized-text";
import { BooleanOrExpressionInput } from "../panels/shared/BooleanOrExpressionInput";
import { LocalizedTextInput } from "../panels/shared/LocalizedTextInput";
import { isExpression, type BoolOrExpr } from "../panels/shared/overrideMode";
import { effectiveFlag, gatedKeys, setFlag, writtenFieldCounts, type FlagKey, type WrittenAccessor } from "../draft/view-flags";
import { PanelsRailFieldRow } from "../panels/EntityTabs";
import { flattenRailFields } from "../draft/panel-rail";
import { fieldKindIcon, fieldKindLabel, fieldKindWord, isUnmatchedKind } from "../draft/field-type-labels";
import { FormPreview } from "../panels/FormPreview";
import { FormTabStrip, formTabDomId, formTabPanelDomId } from "../panels/FormTabStrip";
import { scrollKeyboardFocusIntoView } from "../focusScroll.js";
import type { ProcessTab } from "../routing.js";

type DraftStep = DraftOf<Step>;
type DraftView = DraftOf<View>;

/** The width at and below which the preview no longer fits beside the canvas.
 * In three columns under it, a card's label wraps. `FormPreview.tsx`
 * declares the same constant, so the preview's divider turns with this grid. */
const PREVIEW_NARROW = "@media (max-width: 80rem)";

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
  // The "Condition" mark: the Label role inside the 2px accent border, on a
  // card and beside a strip's checkbox.
  formCondition: {
    fontSize: "11px",
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  studioDevview: {
    marginBlock: space.s2,
    marginInline: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s1,
    paddingInline: space.s2,
  },
  // 24px tall, the WCAG 2.5.8 target floor. `list-item` keeps the
  // disclosure marker a `min-height` would otherwise not need to touch.
  studioDevviewSummary: {
    display: "list-item",
    minHeight: 24,
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
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  formStripHeading: {
    flexBasis: "100%",
    margin: 0,
    overflowWrap: "anywhere",
  },
  studioWarning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
  },
  formEditorPage: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  // The breadcrumb, then the `h2` under it.
  formEditorHeader: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s1,
    paddingBlock: space.s3,
    paddingInline: space.s4,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  crumbs: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s1,
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  crumb: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s1,
  },
  // The authoring command's look in the written face: body text in slate,
  // ink under the pointer, no underline. `global.css` draws the focus ring.
  crumbControl: {
    font: "inherit",
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    backgroundColor: "transparent",
    borderStyle: "none",
    paddingBlock: space.s1,
    paddingInline: 0,
    cursor: "pointer",
    textAlign: "left",
  },
  crumbSeparator: {
    color: colors.textMuted,
  },
  crumbCurrent: {
    color: colors.text,
  },
  // `.studio-form-editor-header h2`: a descendant selector on a bare `<h2>`.
  formEditorHeading: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    margin: 0,
  },
  // Three columns: the palette, the canvas, and the participant preview in
  // the trailing pane (`studio-form-editor`). At 80rem and below the preview
  // gives up its column and stands under the canvas, which takes its width.
  formEditorBody: {
    display: "grid",
    gridTemplateColumns: { default: "16rem minmax(0, 1fr) minmax(0, 22rem)", [PREVIEW_NARROW]: "16rem minmax(0, 1fr)" },
    alignItems: "start",
  },
  formEditorPreview: {
    gridColumn: { default: "auto", [PREVIEW_NARROW]: "1 / -1" },
  },
  formPalette: {
    borderRightWidth: 2,
    borderRightStyle: "solid",
    borderRightColor: colors.divider,
  },
  formPaletteHeading: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    margin: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // `.studio-form-palette-heading + .studio-form-palette-heading` and
  // `.studio-form-palette-list + .studio-form-palette-heading`: this file
  // knows at each of the three headings whether the sibling before it
  // matches, so the adjacency becomes a per-heading conditional.
  formPaletteHeadingBordered: {
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
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
    alignItems: "center",
    gap: space.s2,
    width: "100%",
    backgroundColor: "transparent",
    color: "inherit",
    borderStyle: "none",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    userSelect: "none",
    touchAction: "manipulation",
    ":hover": {
      backgroundColor: colors.surfaceMuted,
    },
  },
  // The row's own bottom hairline, dashed; the other three sides stay bare.
  formPaletteFieldMint: {
    borderBottomStyle: "dashed",
  },
  formPaletteKindIcon: {
    flex: "none",
    display: "inline-flex",
    color: colors.textMuted,
  },
  formPaletteKindName: {
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  formAddNote: {
    marginBlock: space.s2,
    marginInline: space.s3,
  },
  // `space.s3`/`s4` already clear the ring's 4px reach at either end, but a
  // literal token drifts from the reach if either ever changes on its own
  // (`studio-focus-ring-clipping`, I-3). `max()` keeps today's value while
  // reading `focus.reach`, so the two move together. The scroll padding
  // keeps that same room mid-scroll, where the static padding cannot reach.
  formCanvasRegion: {
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: `max(${space.s3}, ${focus.reach})`,
    paddingInline: `max(${space.s4}, ${focus.reach})`,
    scrollPadding: focus.reach,
    minWidth: 0,
  },
  formColumns: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    paddingBottom: space.s3,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
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
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  formCard: {
    display: "flex",
    alignItems: "stretch",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
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
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
  },
  // `.studio-form-card-body`, merged with the same shared user-select/
  // touch-action declaration `formPaletteField` carries (D6), plus `:hover`.
  formCardBody: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.s2,
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
    color: "inherit",
    borderStyle: "none",
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "grab",
    userSelect: "none",
    touchAction: "manipulation",
    ":hover": {
      backgroundColor: colors.surfaceMuted,
    },
  },
  // The card's identity: the label, or a note's text, on a line of its own.
  formCardLabel: {
    flexBasis: "100%",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // The Label role (`DESIGN.md`'s Hierarchy section): the kind line and the
  // "Required" and "Read-only" marks.
  formCardLabelRole: {
    fontSize: "11px",
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  formCardKind: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
    minWidth: 0,
  },
  // The card's second line: the kind, then the marks after it.
  formCardKindRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s2,
    flexBasis: "100%",
    minWidth: 0,
  },
  // The raw `{type, format, control}` triple no curated kind names: a machine
  // value (design-language rule 4).
  formCardKindRaw: {
    fontFamily: fonts.mono,
    textTransform: "none",
    letterSpacing: "normal",
  },
  // A card in the naming variant: the input takes the first row beside the
  // edge, and the move and Remove controls wrap onto a second row.
  formCardNaming: {
    flexWrap: "wrap",
  },
  formCardNameBox: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    flex: 1,
    minWidth: 0,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  formCardNameField: {
    width: "100%",
    minWidth: 0,
  },
  formCardMovesWrapped: {
    flexBasis: "100%",
    paddingInline: space.s3,
    paddingBottom: space.s2,
  },
  formCardMoves: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
    paddingRight: space.s2,
  },
  // The same authoring-command shape as `FormsTab.tsx`'s `openControl` and
  // `FormTabStrip.tsx`'s `control` (mono face, 11px, `textMuted` turning to
  // `text` on hover/press, a `surfaceMuted` hover wash, an ink-14% press
  // wash) — copied here rather than exported, per `design-language.md`'s
  // deliberate-duplicate precedent. `formCardMoves`' Move up/Move down at
  // both consumers, and the field card's own plain Remove, use this block;
  // the group's own `Remove ({count})` keeps its `.btn-secondary
  // btn-destructive` classes unchanged. Like both cited precedents, this
  // pairs with the shared `.btn.btn-ghost` reset (via the `ghost()` helper
  // below) rather than standing alone: `.btn` supplies `font-weight: 800`
  // (not covered anywhere else, and font-weight inherits, so a bare button
  // would render at the page's normal weight) and `.btn-ghost` supplies the
  // 4px `paddingInline` this block leaves unset on purpose, so there is one
  // source of truth for that value.
  authoringCommand: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    paddingBlock: space.s2,
    minHeight: 24,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  // A disabled move control takes no hover or press look: slate text on a
  // transparent ground under the pointer too, the same fix
  // `FormTabStrip.tsx`'s `controlDisabled` applies for the same reason —
  // StyleX orders `:disabled` (92) before `:hover` (130), so a `":disabled"`
  // key inside `authoringCommand` would lose under the pointer. This block
  // stacks after `authoringCommand`, from the boolean that sets `disabled`,
  // and restates all three conditions.
  authoringCommandDisabled: {
    color: {
      default: colors.textMuted,
      ":hover": colors.textMuted,
      ":active": colors.textMuted,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": "transparent",
      ":active": "transparent",
    },
  },
  // The group card (`studio-form-editor`'s fieldset/legend/nested-`<ol>`
  // shape): the `<li>` spans the canvas grid's full width, the
  // same way the empty-state and tail rows already do, and lays its own edge
  // beside the fieldset the way a leaf card lays its edge beside its body
  // button.
  formGroupLi: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "stretch",
    minWidth: 0,
  },
  // `DESIGN.md`: "A canvas group is a 1px stroke with no fill, so the grid
  // stays visible through it". No radius, matching every other
  // surface; the 4-point padding keeps the legend and the members off the
  // stroke.
  formGroupFieldset: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: "transparent",
    margin: 0,
    paddingBlock: space.s3,
    paddingInline: space.s3,
  },
  formGroupLegend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
    width: "100%",
    padding: 0,
  },
  // The Title role (`DESIGN.md`'s Hierarchy section: 800 weight, 0.85rem,
  // uppercase, 0.08em tracking, slate) — the same rule `global.css`'s bare
  // `h2` already draws, read here from tokens instead of a hand-written
  // selector.
  formGroupLegendName: {
    display: "flex",
    alignItems: "baseline",
    flex: 1,
    minWidth: 0,
    backgroundColor: "transparent",
    borderStyle: "none",
    color: colors.textMuted,
    fontFamily: fonts.heading,
    fontWeight: fonts.headingWeight,
    fontSize: "0.85rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    textAlign: "left",
    cursor: "grab",
    paddingBlock: space.s1,
    paddingInline: 0,
  },
  formGroupLegendNaming: {
    flexWrap: "wrap",
  },
  formGroupMembersSpacing: {
    marginTop: space.s3,
  },
  formStripEmpty: {
    marginTop: space.s4,
    paddingTop: space.s3,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    color: colors.textMuted,
  },
  formEditorFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s3,
    paddingBlock: space.s3,
    paddingInline: space.s4,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
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
type Dragging = { kind: "palette"; ref: FieldId } | { kind: "card"; index: number } | { kind: "mint"; fieldKind: FieldKindName };

/** The element id of the editor's `h2`, which takes the focus when the editor
 * opens. */
export const FORM_EDITOR_HEADING_ID = "form-editor-heading";

/** The element id of a card's name input, which takes the focus when a
 * minted card opens for naming. */
export const formCardNameInputId = (fieldId: string) => `form-card-name-${fieldId}`;

/** The element id of a card's own control: a leaf card's body button, or a
 * group card's legend name. Enter or Escape in the name input moves the focus
 * there. */
export const formCardBodyId = (fieldId: string) => `form-card-body-${fieldId}`;

/** Whether a label holds text in the content locale or the base locale. An
 * empty string counts as no text, which `resolveDraftLocalizedText` keeps. */
function hasLabelText(label: DraftLocalizedText, contentLocale: string, baseLocale: string): boolean {
  return !!label?.[contentLocale] || !!label?.[baseLocale];
}

/** Whether a field's card shows its name input in place of its own control:
 * while it is naming, or while neither the content locale nor the base locale
 * holds a label (`studio-form-editor`: "A card whose field has no label ...
 * SHALL keep the input"). */
export function cardShowsNameInput(
  fieldId: string,
  naming: string | undefined,
  label: DraftLocalizedText,
  contentLocale: string,
  baseLocale: string,
): boolean {
  return naming === fieldId || !hasLabelText(label, contentLocale, baseLocale);
}

/** The naming state after a key in a card's name input. Enter or Escape ends
 * the naming once the label holds text in the content locale or the base
 * locale. A label without text keeps it, so the card keeps its input through
 * the next keystroke instead of swapping it out from under the focus. Any
 * other key leaves the state as it is. */
export function namingAfterKey<T extends string>(
  key: string,
  fieldId: T,
  naming: T | undefined,
  label: DraftLocalizedText,
  contentLocale: string,
  baseLocale: string,
): T | undefined {
  if (key !== "Enter" && key !== "Escape") return naming;
  return hasLabelText(label, contentLocale, baseLocale) ? undefined : fieldId;
}

/** A label for display: the content locale's text, else the base locale's.
 * Unlike `resolveDraftLocalizedText`, a cleared translation falls through to
 * the base locale. */
function displayLabel(label: DraftLocalizedText, contentLocale: string, baseLocale: string): string | undefined {
  return label?.[contentLocale] || label?.[baseLocale] || undefined;
}

/** A card control's accessible name: `key`'s sentence with `{field}` filled
 * by a replacer function, so a label holding `$&` reads as typed. */
function named(key: "formEditor.moveUpNamed" | "formEditor.moveDownNamed" | "formEditor.removeNamed", field: string): string {
  return t(key).replace("{field}", () => field);
}

/** A card's kind line: the kind's icon and its name, the words the Fields
 * tab's entity rail prints for the field. A triple no kind names prints its
 * raw members, a machine value: mono, with no case transform. */
function CardKindLine({ field }: { field: DraftField }) {
  const KindIcon = fieldKindIcon(field);
  return (
    <span {...stylex.props(styles.formCardLabelRole, styles.formCardKind, isUnmatchedKind(field) && styles.formCardKindRaw)}>
      <KindIcon size={18} strokeWidth={1.75} aria-hidden="true" />
      {fieldKindWord(field)}
    </span>
  );
}

/**
 * The naming variant of a card (`studio-form-editor`: "A new field takes its
 * name on its card"): the name input over the kind line, in place of the
 * card's draggable control. It is not draggable, so the input keeps text
 * selection. The wrapper takes the key and focus events, since React's
 * bubble from the input.
 */
function CardNameInput({
  field,
  fieldId,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  field: DraftField;
  fieldId: string;
  onChange: (label: DraftLocalizedText) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocus: (e: FocusEvent) => void;
  onBlur: (e: FocusEvent) => void;
}) {
  return (
    <div {...stylex.props(styles.formCardNameBox)} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>
      {/* translation-warning-exempt: this input shows only while the card is
          naming, or while neither the content locale nor the base locale
          holds a label. The strip's Name control carries the warning. */}
      <LocalizedTextInput
        id={formCardNameInputId(fieldId)}
        value={field.label}
        onChange={onChange}
        ariaLabel={t("formEditor.nameInputLabel")}
        placeholder={t("formEditor.namePlaceholder")}
        autoComplete="off"
        {...stylex.props(styles.formCardNameField)}
      />
      <CardKindLine field={field} />
    </div>
  );
}

/** Literal `.btn` classes plus compiled styles, as one set of props, since
 * spreading `stylex.props(...)` beside a `className` attribute drops
 * whichever of the two the JSX writes first. */
function btn(classes: string, ...style: stylex.StyleXStyles[]) {
  const compiled = stylex.props(...style);
  return { ...compiled, className: `${classes} ${compiled.className ?? ""}`.trim() };
}

/** `btn btn-ghost` plus compiled styles — the same join `FormTabStrip.tsx`'s
 * `ghost()` makes. */
function ghost(...style: stylex.StyleXStyles[]) {
  return btn("btn btn-ghost", ...style);
}

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
  onChange,
}: {
  label: string;
  value: BoolOrExpr;
  flagKey: FlagKey;
  disabled?: boolean;
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
      {cel && <span {...stylex.props(styles.formCondition)}>{t("formEditor.markCondition")}</span>}
      <details {...stylex.props(styles.studioDevview)}>
        <summary {...stylex.props(styles.studioDevviewSummary)}>{t("formEditor.developerView")}</summary>
        <BooleanOrExpressionInput label={label} value={value} flagKey={flagKey} onChange={onChange} />
      </details>
    </div>
  );
}

/** One choice in a strip's tab picker: the tab's minted `key`, and its label
 * already resolved for the content locale. Both strips take their options
 * this way rather than resolving each tab's label themselves. Both strips
 * still read `useDraft()` for their own localized inputs, so each renders
 * inside a `DraftContext` provider. */
export interface TabOption {
  key: string;
  label: string;
}

/** The element the disabled picker's reason names, so the reason reaches a
 * screen reader as the control's description rather than as loose text
 * beside it. One strip renders at a time, so one id is enough. */
const TAB_FROM_GROUP_ID = "form-editor-tab-from-group";

/**
 * The tab picker both strips carry (`studio-form-editor`: "A selected
 * entry's strip assigns it to a tab"). The note strip carries it beside its
 * group picker; a field's group follows its catalog parent, so the field
 * strip carries no group picker. An untabbed form draws none — there is no
 * tab to assign.
 *
 * It offers no empty choice: on a tabbed form a root entry always names a
 * tab, so an empty option would be a selectable state the definition
 * contract rejects. For an entry naming a group the picker is disabled and
 * says why, rather than sitting inert with no reason: rule 4 of the tab
 * hierarchy makes the group's own tab the entry's, and `value` is that
 * group's tab.
 */
function TabPicker({
  options,
  value,
  inGroup,
  onChange,
}: {
  options: TabOption[];
  value: string | undefined;
  inGroup: boolean;
  onChange: (tab: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div {...stylex.props(styles.formStripOverride)}>
      <label {...stylex.props(styles.formStripField)}>
        {t("formEditor.tab")}
        <select
          value={value ?? ""}
          disabled={inGroup}
          aria-describedby={inGroup ? TAB_FROM_GROUP_ID : undefined}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {inGroup && (
        <p id={TAB_FROM_GROUP_ID} {...stylex.props(styles.studioDialogNote)}>
          {t("formEditor.tabFromGroup")}
        </p>
      )}
    </div>
  );
}

export interface FormEditorStripProps {
  row: DraftViewField;
  /** The heading: the field's label resolved for the content locale, or
   * `formEditor.unnamedField`. */
  label: string;
  /** The field's whole label, which the Name control edits and its
   * translation warning reads. */
  fieldLabel: DraftLocalizedText;
  ownStepIndex: number;
  written: WrittenAccessor;
  technicalFieldIds: Set<string>;
  isGroup: boolean;
  /** The form's tabs, empty on an untabbed form. */
  tabOptions: TabOption[];
  /** The tab this entry draws on: its own on a root entry, its group's on a
   * member of one. */
  tabValue: string | undefined;
  onChangeLabel: (label: DraftLocalizedText) => void;
  onChangeFlag: (key: FlagKey, next: BoolOrExpr) => void;
  onChangeSpan: (span: 1 | 2) => void;
  onChangeTab: (tab: string) => void;
}

/** The Width select both strips carry: values 1 and 2, printed in words. */
function SpanSelect({ value, onChange }: { value: 1 | 2 | undefined; onChange: (span: 1 | 2) => void }) {
  return (
    <label {...stylex.props(styles.formStripField)}>
      {t("formEditor.span")}
      <select value={String(value ?? 1)} onChange={(e) => onChange(Number(e.target.value) as 1 | 2)}>
        <option value="1">{t("formEditor.spanOne")}</option>
        <option value="2">{t("formEditor.spanBoth")}</option>
      </select>
    </label>
  );
}

/**
 * The selected field's name and overrides — pulled out of `FormEditorScreen` so a
 * server render can exercise it directly with an arbitrary `row`, without
 * simulating the click that selects one (`renderToStaticMarkup` fires no DOM
 * events). Purely presentational: every write goes back through its
 * callback props, `FormEditorScreen`'s own `writeLabel`, `setViewFlag` and
 * `updateRow`.
 */
export function FormEditorStrip({
  row,
  label,
  fieldLabel,
  ownStepIndex,
  written,
  technicalFieldIds,
  isGroup,
  tabOptions,
  tabValue,
  onChangeLabel,
  onChangeFlag,
  onChangeSpan,
  onChangeTab,
}: FormEditorStripProps) {
  const { draft, contentLocale } = useDraft();
  const warning = missingTranslationWarning(fieldLabel, contentLocale, draft.baseLocale);
  // A technical field's view entry may declare neither key at all (the
  // definition contract rejects both) — the strip removes the `required`/
  // `readonly` controls entirely rather than disabling them, since a
  // settable-but-doomed control would only invite the rejected publish this
  // change exists to prevent (design.md). `visible` and `span` stay offered
  // unchanged. The strip offers no `group` control: the field catalog owns a
  // field's parentage.
  const isTechnical = row.ref !== undefined && technicalFieldIds.has(row.ref);
  return (
    <section {...stylex.props(styles.formStrip)} aria-label={t("formEditor.stripLabel")}>
      <h3 {...stylex.props(styles.formStripHeading)}>{label}</h3>
      <label {...stylex.props(styles.formStripField)}>
        {t("formEditor.nameLabel")}
        <LocalizedTextInput value={fieldLabel} onChange={onChangeLabel} />
      </label>
      {warning && <p {...stylex.props(styles.studioWarning)}>{warning}</p>}
      <OverrideField
        label={t("formEditor.visible")}
        flagKey="visible"
        value={row.visible}
        onChange={(visible) => onChangeFlag("visible", visible)}
      />
      {!isTechnical && (
        <OverrideField
          label={t("formEditor.required")}
          flagKey="required"
          disabled={gatedKeys(row, written, technicalFieldIds, ownStepIndex).includes("required")}
          value={row.required}
          onChange={(required) => onChangeFlag("required", required)}
        />
      )}
      {!isTechnical && (
        <OverrideField
          label={t("formEditor.readonly")}
          flagKey="readonly"
          disabled={gatedKeys(row, written, technicalFieldIds, ownStepIndex).includes("readonly")}
          value={row.readonly}
          onChange={(readonly) => onChangeFlag("readonly", readonly)}
        />
      )}
      {/* No span control on a group: it draws at the form's full width and
          `form-ui` reads no span on it, so the control would write a value
          nothing renders. */}
      {!isGroup && <SpanSelect value={row.span} onChange={onChangeSpan} />}
      <TabPicker options={tabOptions} value={tabValue} inGroup={!!row.group} onChange={onChangeTab} />
    </section>
  );
}

/** A selected note's strip props. `groupOptions` lists the group cards this
 * step's view carries, each as the group's `key` and its label resolved for
 * the content locale: a note has no catalog parent, so its group is a
 * per-step choice among those cards. */
export interface NoteEditorStripProps {
  row: DraftOf<ViewNote>;
  baseLocale: string | undefined;
  groupOptions: { key: string; label: string }[];
  /** The same two the field strip takes: a note takes a tab the same way a
   * field does (`studio-form-editor`: "This requirement covers both entry
   * kinds"). */
  tabOptions: TabOption[];
  tabValue: string | undefined;
  onChangeText: (text: DraftLocalizedText) => void;
  onChangeVisible: (visible: BoolOrExpr) => void;
  onChangeSpan: (span: 1 | 2) => void;
  onChangeGroup: (group: string | undefined) => void;
  onChangeTab: (tab: string) => void;
}

/**
 * A selected note's strip (`studio-form-editor`'s "A note's strip sets its
 * text, its span, its group and its visibility"): the note's text, its
 * `visible` condition (the same input a field card's strip offers), its
 * span and its group. No requiredness, no readonly state, no validation —
 * a note carries none of those.
 */
export function NoteEditorStrip({
  row,
  baseLocale,
  groupOptions,
  tabOptions,
  tabValue,
  onChangeText,
  onChangeVisible,
  onChangeSpan,
  onChangeGroup,
  onChangeTab,
}: NoteEditorStripProps) {
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
      <OverrideField label={t("formEditor.visible")} flagKey="visible" value={row.visible} onChange={onChangeVisible} />
      <SpanSelect value={row.span} onChange={onChangeSpan} />
      <label {...stylex.props(styles.formStripField)}>
        {t("formEditor.group")}
        <select value={row.group ?? ""} onChange={(e) => onChangeGroup(e.target.value === "" ? undefined : e.target.value)}>
          <option value="">{t("formEditor.noGroup")}</option>
          {groupOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <TabPicker options={tabOptions} value={tabValue} inGroup={!!row.group} onChange={onChangeTab} />
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
  /** Returns to the tab that opened the editor: the breadcrumb's first crumb. */
  onBack: () => void;
  /** The tab that opened the editor, which the first crumb names. */
  originTab: ProcessTab;
  /** Opens the step's page on the Steps tab: the breadcrumb's step crumb. */
  onOpenStep: () => void;
}

/**
 * The visual form editor (`studio-form-editor` capability): a breadcrumb out,
 * a palette of unplaced catalog fields plus an "add a field to the process"
 * mint section, a canvas that draws the form at its declared column count,
 * and a strip editing the selected field's name and overrides.
 *
 * No Save. Every change writes straight into the in-browser draft through
 * `mutate()`. The header bar's Save and Publish and its menu's Discard draft
 * stay the only controls that persist.
 */
export function FormEditorScreen({ step, index, fields, onBack, originTab, onOpenStep }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const published = usePublishedFieldIds();
  const processLabel =
    resolveDraftLocalizedText(draft.label, contentLocale, draft.baseLocale ?? "en") || t("headerBar.unnamedProcess");
  const written = useMemo(() => writtenFieldCounts(draft), [draft]);
  // Threaded into both gatedKeys calls below and this screen's own
  // control-omission logic — computed once, from the already-flat
  // catalog this screen receives, rather than twice.
  const technicalIds = useMemo(
    () => new Set(fields.filter((f) => f.technical === true && f.id !== undefined).map((f) => f.id!)),
    [fields],
  );
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [dragging, setDragging] = useState<Dragging | undefined>(undefined);
  /** The one selected-tab value, driving the canvas AND the preview beside it
   * (`studio-form-editor`: "One selected-tab value SHALL drive both halves").
   * The tab actually shown is derived from it on every render by `shownTab`,
   * so removing the open tab or opening another step needs no repair here. */
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  /** The field whose card shows its name input after a mint, until Enter,
   * Escape or a blur ends the naming. */
  const [naming, setNaming] = useState<FieldId | undefined>(undefined);

  // The selection belongs to the step this page was opened for, and so does
  // the open tab: another step's tab keys name nothing here.
  // The heading takes the focus on every open, whatever route opened the
  // editor: the control that opened it sits in a body the editor hides.
  useEffect(() => {
    setSelected(undefined);
    setActiveTab(undefined);
    setNaming(undefined);
    document.getElementById(FORM_EDITOR_HEADING_ID)?.focus();
  }, [step.id]);

  // A minted card's input takes the focus at once, its seeded kind name
  // selected, so the first keystroke replaces the name. An input that already
  // holds the focus set `naming` itself and keeps its caret.
  useEffect(() => {
    if (naming === undefined) return;
    const input = document.getElementById(formCardNameInputId(naming));
    if (!(input instanceof HTMLInputElement) || document.activeElement === input) return;
    input.focus();
    input.select();
  }, [naming]);

  const rows: DraftViewEntry[] = step.view?.fields ?? [];
  const baseLocale = draft.baseLocale ?? "en";
  // Absent means one column, which is the width every view had before
  // `view.columns` existed. A form built before this editor therefore opens
  // one-column with every card full width, in its existing array order.
  const columns: 1 | 2 = step.view?.columns === 2 ? 2 : 1;

  const writeView = (next: DraftView) => {
    updateInDraftArray<DraftStep>(mutate, (d) => d.workflow?.steps?.[index], { view: next });
  };

  const setRows = (next: DraftViewEntry[]) => {
    if (next === rows) return;
    writeView({ ...step.view, fields: next });
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

  /** The one writer for a note's group (`studio-form-editor`: assigning a
   * group clears the entry's own `tab`, and clearing it on a tabbed form
   * writes the tab the canvas is showing). `updateRow`'s plain spread cannot
   * delete a key, and both halves of the rule are a deletion. A field's group
   * follows its catalog parent, so the note strip is the one caller. */
  const changeGroup = (rowIndex: number, group: string | undefined) => {
    setRows(rows.map((r, i) => (i === rowIndex ? setEntryGroup(r, group, shown) : r)));
  };

  /** Cascades through `removeViewEntry` (`draft/view-tree.ts`): removing a
   * group card takes every entry placed inside it along, field and note
   * members alike and a nested group's members too, in the one change (the
   * "Removing a group card removes the members placed inside it"
   * requirement). Removing anything else removes that one entry. A member
   * carries no `tab`, so a tabbed form needs nothing more. */
  const removeRow = (rowIndex: number) => {
    setRows(removeViewEntry(rows, rowIndex, fields));
    setSelected(undefined);
  };

  /** Places a palette field through `insertGroupedField`, then shows the tab
   * its entry landed on (`tabAfterPlacement`). A member joining a group card
   * another tab draws lands on that card's tab, and a drop that left the
   * shown canvas as it was would hide where the member went. */
  const placeFromPalette = (ref: FieldId, slot: number) => {
    const next = insertGroupedField(rows, ref, slot, fields, shown);
    if (next === rows) return;
    setRows(next);
    const landedTab = tabAfterPlacement(next, ref, tabs, shown, groupKeyOf);
    if (landedTab !== shown) setActiveTab(landedTab);
  };

  /** Mints a catalog field and places it on this step's view, in one Draft
   * mutation: both the new `fields` entry and the new `view`
   * row commit together, so a mid-mutation reader never sees one without
   * the other. The field is minted outside the recipe, so its id is the one
   * `naming` holds. The selection clears: it is an array index the insert
   * shifts. The key steps past the Fields tab's taken set (`takenFieldKeys`),
   * so a key only an expression reads, or a CEL literal word, takes a number. */
  const mintAndPlace = (kind: FieldKindName, slot: number) => {
    const taken = takenFieldKeys(draft, undefined, kind === "group");
    const field = mintCatalogField(kind, seedLocalizedText(contentLocale), baseLocale, taken);
    const fieldId = field.id as FieldId;
    mutate((d) => {
      d.fields ??= [];
      d.fields.push(structuredClone(field));
      const s = d.workflow?.steps?.[index];
      if (!s) return;
      s.view ??= { fields: [] };
      s.view.fields = fillMissingTabs(insertViewField(s.view.fields ?? [], fieldId, slot), shown);
    });
    setSelected(undefined);
    setNaming(fieldId);
  };

  /** The one label writer for the card input and the strip's Name control:
   * `writeFieldLabel` sets the key by the Fields tab's rule, for a field at
   * any depth (`studio-form-editor`: "A name given in the form editor sets
   * the key"). */
  const writeLabel = (fieldId: FieldId, label: DraftLocalizedText) => {
    mutate((d) => writeFieldLabel(d, fieldId, label, baseLocale, published));
  };

  /** Enter or Escape ends the naming, and the focus moves onto the card's own
   * control on the next frame, once the card has drawn it. A card still
   * without a label keeps its input and its naming (`namingAfterKey`), so the
   * focus stays in the input and the next keystroke lands there too. */
  const nameKeyDown = (fieldId: FieldId) => (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== "Escape") return;
    e.preventDefault();
    const next = namingAfterKey(e.key, fieldId, naming, fieldFor(fieldId)?.label, contentLocale, baseLocale);
    setNaming(next);
    if (next !== undefined) return;
    requestAnimationFrame(() => document.getElementById(formCardBodyId(fieldId))?.focus());
  };
  /** Focus on a card's name input starts the naming, so a card whose label is
   * empty keeps its input while the author types into it on a second visit.
   * Without it the first keystroke gives the label text, the card draws its
   * body, and the input unmounts under the focus. */
  const nameFocus = (fieldId: FieldId) => () => setNaming(fieldId);
  const nameBlur = () => setNaming(undefined);

  /** Places a note at the end of the view, seeded with a non-empty entry for
   * the body's `baseLocale`. A note inserted with no text at all
   * would parse against neither union member, failing the draft's whole
   * `authoredProcessBody.safeParse` and blanking every checks-rail dimension
   * after `zod` (design.md Risks: "A half-typed note card blanks the whole
   * checks rail"). */
  const insertNote = () => {
    setRows(fillMissingTabs(insertViewNote(rows, { [baseLocale]: t("formEditor.newNoteText") }, rows.length), shown));
    setSelected(rows.length);
  };

  /** One drop handler for all three payloads: a palette field is inserted at
   * the slot, a mint entry is minted and inserted there, a card is moved to
   * it. */
  const dropAt = (slot: number) => {
    if (!dragging) return;
    if (dragging.kind === "palette") {
      // A field the catalog nests inside a group lands among that group's
      // members (and brings the group's own card too, when it is missing)
      // wherever the drop named — `insertGroupedField` owns that slot
      // decision (the MODIFIED "A left palette lists..." requirement). On a
      // tabbed form the root entry it places takes the shown tab.
      placeFromPalette(dragging.ref, slot);
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
    const next = nudgeViewField(rows, rowIndex, delta, fields, drawn);
    if (next === rows) return;
    setRows(next);
    // The landed index, read off the array the move returned (`view-tree.ts`'s
    // `landedIndex`) rather than assumed as `rowIndex + delta`: a root
    // entry's move can step over a whole group's footprint, and on a tabbed
    // form over entries another tab draws, landing more than one position
    // away.
    setSelected(landedIndex(rows, next, rowIndex));
  };

  const fieldFor = (ref_: FieldId | undefined) => fields.find((f) => f.id === ref_);
  /** A field's label for display, never its key. */
  const labelFor = (ref_: FieldId | undefined) =>
    displayLabel(fieldFor(ref_)?.label, contentLocale, baseLocale) ?? t("formEditor.unnamedField");
  /** `cardShowsNameInput` for a card's field, if it has an id. */
  const showsNameInput = (field: DraftField | undefined): field is DraftField & { id: string } =>
    field?.id !== undefined && cardShowsNameInput(field.id, naming, field.label, contentLocale, baseLocale);
  /** A group's card always draws at the form's full width and `form-ui` reads
   * no `span` on it, so the canvas draws it that way and the strip offers no
   * span control for it. A note names no catalog field, so it is never a
   * group row. */
  const isGroupRow = (row: DraftViewEntry) => isDraftViewField(row) && fieldFor(row.ref)?.type === "group";

  const catalogIds = fields.map((f) => f.id).filter((id): id is FieldId => id !== undefined);
  const unplacedIds = new Set(unplacedRefs(catalogIds, rows));
  const palette = flattenRailFields(draft.fields).filter((row) => unplacedIds.has(row.id as FieldId));

  const groupOptions = rows
    .filter(isDraftViewField)
    .map((r) => fieldFor(r.ref))
    .filter((f): f is DraftField & { key: string } => f?.type === "group" && !!f.key)
    .map((f) => ({ key: f.key, label: labelFor(f.id as FieldId) }));

  /** The group an entry DECLARES, as `owningTab` and `drawnRows` read it: a
   * group card's catalog `key`, which is the value another entry's `group`
   * names, read by the same test `viewTree` draws a card by. Everything else
   * answers `undefined`. */
  const groupKeyOf = useMemo(() => cardGroupKey(fields), [fields]);

  const tabs = step.view?.tabs ?? [];
  /** The tab the canvas draws. Derived, never stored: `activeTab` while it
   * still names a tab, the first tab otherwise, and `undefined` on a form
   * declaring none. */
  const shown = shownTab(tabs, activeTab);
  /** The entry indices the shown tab draws, in view order: a root on its own
   * tab, a member on its group's (`drawnRows`). The canvas below draws the
   * tree's roots this holds, and a root's keyboard move steps among them. */
  const drawn = drawnRows(rows, tabs, shown, groupKeyOf);
  const tabOptions = tabs
    .filter((tab): tab is DraftViewTab & { key: string } => !!tab.key)
    .map((tab) => ({ key: tab.key, label: resolveDraftLocalizedText(tab.label, contentLocale, baseLocale) || t("formEditor.unnamedTab") }));

  const addTab = () => {
    // A non-empty base-locale entry, not `seedLocalizedText`'s empty one: a
    // tab with no base-locale text fails the authored-content-localization
    // invariant on the spot, the same reason `insertNote` seeds its text
    // (`studio-form-editor`: "Adding a tab SHALL seed its `label` with a
    // non-empty base-locale entry").
    const next = addViewTab(step.view ?? { fields: [] }, { [baseLocale]: t("formEditor.newTabName") });
    writeView(next);
    setActiveTab(next.tabs?.[next.tabs.length - 1]?.key);
    setSelected(undefined);
  };

  const renameTab = (key: string, label: DraftLocalizedText) => {
    writeView(renameViewTab(step.view ?? { fields: [] }, key, label));
  };

  // `from` is the strip's own index into this same `tabs` array, so the
  // strip's Move-left/right end guards and this splice act on one set of
  // positions. `moveViewTab` holds the range guard.
  const moveTab = (from: number, delta: -1 | 1) => {
    const target = from + delta;
    writeView({ ...(step.view ?? { fields: [] }), tabs: moveViewTab(tabs, from, delta === 1 ? target + 1 : target) });
  };

  const removeTab = (key: string) => {
    const index = tabs.findIndex((tab) => tab.key === key);
    if (index === -1) return;
    writeView(removeViewTab(step.view ?? { fields: [] }, key));
    // The tab that took the removed tab's entries, which is where the
    // author's work went. `removeViewTab` picks the same neighbour.
    setActiveTab(tabs[index === 0 ? 1 : index - 1]?.key);
    setSelected(undefined);
  };

  // The canvas's nested read of `rows` (`draft/view-tree.ts`): the
  // roots, and per group entry its members, each node carrying that entry's
  // own index into `rows`. The renderer below walks this; every handler
  // still addresses `rows[i]`.
  const tree = useMemo(() => viewTree(rows, fields), [rows, fields]);
  // The roots the shown tab draws, each still nesting its whole subtree.
  // `drawnRows` puts a member on its group card's own tab, so a card and its
  // members show together or not at all.
  const drawnSet = new Set(drawn);
  const drawnRoots = tree.filter((node) => drawnSet.has(node.index));

  // Every row's own drag scope: a member's is its group, and a root's is the
  // roots its own tab draws (`view-tree.ts`'s `dragScopeByIndex`). Built once
  // per render so a dragover handler can compare the dragged entry's own
  // scope against the target's (design.md: "A refused drop uses the
  // browser's own no-drop cursor").
  const scopeByIndex = useMemo(() => dragScopeByIndex(rows, fields, step.view?.tabs), [rows, fields, step.view?.tabs]);
  /** The scope of every slot the canvas draws at its own root level. */
  const rootScope: DragScope = { tab: shown };

  /** Whether a dragover at `scope` should call `preventDefault` — the whole
   * refusal mechanism: the browser draws its own no-drop
   * cursor and fires no `drop` where this says no, so no new visual state is
   * ever painted. A palette or mint payload is always welcome, wherever it
   * lands (`insertGroupedField` and the group-less mint rule each resolve
   * their own placement); a card payload is welcome only at the scope it
   * already occupies, `view-tree.ts`'s `isLawfulCardDrop`. */
  const lawfulDrop = (scope: DragScope) => {
    if (!dragging) return false;
    if (dragging.kind !== "card") return true;
    return isLawfulCardDrop(scopeByIndex, dragging.index, scope);
  };

  /** One placed card, leaf or group, at its own nesting level. `scope` names
   * the sibling list this level renders: the group whose `<ol>` holds it, or
   * the roots the shown tab draws — every drop target here compares a
   * dragged card's own scope against it. `isFirst`/`isLast` are this node's
   * position among the array it was mapped over (the shown tab's roots, or a
   * group node's own `members`) — not `rowIndex === 0`, wrong once a group
   * can sit among the roots. */
  const renderEntry = (node: ViewTreeNode, isFirst: boolean, isLast: boolean, scope: DragScope) => {
    const row = node.entry;
    const rowIndex = node.index;
    const isField = isDraftViewField(row);
    // `row` stays the union type outside a narrowed branch, so `.ref` is
    // read once here (where `isField` still narrows it) rather than at each
    // site below, including the group branch, which never re-checks
    // `isField` itself (a group's card is always a field entry, never a
    // note, but TS has no way to know that from `node.members` alone).
    const fieldRef = isField ? row.ref : undefined;
    const field = fieldFor(fieldRef);
    const hiddenByExpression = isExpression(row.visible);

    // `stopPropagation` on every dragover handler, lawful or not: nesting
    // means a member's edge sits inside its group's own `<li>`, and without
    // it an outer, looser-scoped handler would get a second, wrong-scoped
    // opinion once the event bubbles.
    const allowDrop = (dropScope: DragScope) => (e: DragEvent) => {
      e.stopPropagation();
      if (lawfulDrop(dropScope)) e.preventDefault();
    };
    const dropOn = (side: DropSide) => (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dropAt(dropSlot(rowIndex, side));
    };

    // A group with no key yet draws no members (`view-tree.ts`'s
    // `isGroupCard`), but it still draws as a group card: a minted group
    // takes its name on its legend, and its first keystroke derives the key
    // without moving the input to another element.
    const members = node.members ?? (isGroupRow(row) ? [] : undefined);
    if (members) {
      // A group's card is always a field entry (never a note), so `field` is
      // defined here.
      const groupKey = field?.key;
      const groupNaming = showsNameInput(field);
      const groupName = labelFor(fieldRef);
      const memberScope: DragScope = { group: groupKey ?? "" };
      const memberCount = members.length;
      // A drop on the group's own box and a drop on its tail row both name
      // this slot (`view-tree.ts::groupTailSlot`). A palette field lands after
      // the last member, a root card dropped on the box lands after the
      // group, and a member dropped on the tail row becomes the last member.
      const tailSlot = groupTailSlot(node);
      const dropOnTail = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dropAt(tailSlot);
      };
      // The entries the remove click takes besides the card itself: the whole
      // cascade `removeViewEntry` performs, a nested group's members included.
      const removalCount = rows.length - removeViewEntry(rows, rowIndex, fields).length - 1;
      const fieldsetProps = stylex.props(
        styles.formGroupFieldset,
        selected === rowIndex && styles.formCardSelected,
        hiddenByExpression && styles.formCardConditional,
      );
      return (
        <li key={`field:${fieldRef}`} {...stylex.props(styles.formGroupLi)} onDragOver={allowDrop(scope)} onDrop={dropOnTail}>
          <span {...stylex.props(styles.formCardEdge)} onDragOver={allowDrop(scope)} onDrop={dropOn("before")} aria-hidden="true" />
          <fieldset className={fieldsetProps.className} style={fieldsetProps.style} data-selected={selected === rowIndex || undefined}>
            <legend {...stylex.props(styles.formGroupLegend, groupNaming && styles.formGroupLegendNaming)}>
              {groupNaming ? (
                <CardNameInput
                  field={field}
                  fieldId={field.id}
                  onChange={(label) => writeLabel(field.id as FieldId, label)}
                  onKeyDown={nameKeyDown(field.id as FieldId)}
                  onFocus={nameFocus(field.id as FieldId)}
                  onBlur={nameBlur}
                />
              ) : (
                <button
                  type="button"
                  id={fieldRef ? formCardBodyId(fieldRef) : undefined}
                  {...stylex.props(styles.formGroupLegendName)}
                  draggable
                  onDragStart={() => setDragging({ kind: "card", index: rowIndex })}
                  onDragEnd={() => setDragging(undefined)}
                  aria-pressed={selected === rowIndex}
                  onClick={() => setSelected(selected === rowIndex ? undefined : rowIndex)}
                >
                  {labelFor(fieldRef)}
                </button>
              )}
              <span {...stylex.props(styles.formCardMoves)}>
                <button
                  type="button"
                  {...ghost(styles.authoringCommand, isFirst && styles.authoringCommandDisabled)}
                  disabled={isFirst}
                  aria-label={named("formEditor.moveUpNamed", groupName)}
                  onClick={() => move(rowIndex, -1)}
                >
                  {t("formEditor.moveUp")}
                </button>
                <button
                  type="button"
                  {...ghost(styles.authoringCommand, isLast && styles.authoringCommandDisabled)}
                  disabled={isLast}
                  aria-label={named("formEditor.moveDownNamed", groupName)}
                  onClick={() => move(rowIndex, 1)}
                >
                  {t("formEditor.moveDown")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-destructive"
                  aria-label={t("formEditor.removeGroupNamed")
                    .replace("{count}", () => String(removalCount))
                    .replace("{field}", () => groupName)}
                  onClick={() => removeRow(rowIndex)}
                >
                  {t("formEditor.removeGroup").replace("{count}", String(removalCount))}
                </button>
              </span>
            </legend>
            <ol
              {...stylex.props(columns === 2 ? styles.formCanvasTwoCol : styles.formCanvasOneCol, styles.formGroupMembersSpacing)}
              data-columns={columns}
            >
              {members.map((member, i) => renderEntry(member, i === 0, i === memberCount - 1, memberScope))}
              {/* The group's own tail slot: a group with no members yet
                  still has to offer a target, and a member's own
                  reorder-to-the-end has nowhere else to land either. */}
              <li {...stylex.props(styles.formCanvasTail)} onDragOver={allowDrop(memberScope)} onDrop={dropOnTail}>
                {t("formEditor.dropHere")}
              </li>
            </ol>
          </fieldset>
        </li>
      );
    }

    const span = clampSpan(row.span, columns);
    const conditionMarked = isField && (isExpression(row.visible) || isExpression(row.required) || isExpression(row.readonly));
    const cardKey = isField ? `field:${row.ref}` : `note:${rowIndex}`;
    const leafNaming = isField && showsNameInput(field);
    const cardProps = stylex.props(
      styles.formCard,
      selected === rowIndex && styles.formCardSelected,
      hiddenByExpression && styles.formCardConditional,
      columns === 2 && span === 2 && styles.formCardSpanTwo,
      leafNaming && styles.formCardNaming,
    );
    return (
      <li
        key={cardKey}
        className={isField ? cardProps.className : `studio-form-card-note ${cardProps.className}`}
        style={cardProps.style}
        data-span={span}
        data-selected={selected === rowIndex || undefined}
        data-conditional={hiddenByExpression || undefined}
        onDragOver={allowDrop(scope)}
        onDrop={dropOn("after")}
      >
        {/* Two thin edges rather than one whole-card target: a drop names a
            side, and the side is what decides the slot. A span-2 card owns
            its row, so both of its halves are the same card and only these
            edges split it. */}
        <span {...stylex.props(styles.formCardEdge)} onDragOver={allowDrop(scope)} onDrop={dropOn("before")} aria-hidden="true" />
        {leafNaming && field ? (
          <CardNameInput
            field={field}
            fieldId={field.id!}
            onChange={(label) => writeLabel(field.id as FieldId, label)}
            onKeyDown={nameKeyDown(field.id as FieldId)}
            onFocus={nameFocus(field.id as FieldId)}
            onBlur={nameBlur}
          />
        ) : (
          <button
            type="button"
            id={isField && row.ref ? formCardBodyId(row.ref) : undefined}
            {...stylex.props(styles.formCardBody)}
            draggable
            onDragStart={() => setDragging({ kind: "card", index: rowIndex })}
            onDragEnd={() => setDragging(undefined)}
            aria-pressed={selected === rowIndex}
            onClick={() => setSelected(selected === rowIndex ? undefined : rowIndex)}
          >
            <span {...stylex.props(styles.formCardLabel)}>
              {isField
                ? labelFor(row.ref)
                : resolveDraftLocalizedText(row.text, contentLocale, baseLocale) || t("formEditor.emptyNote")}
            </span>
            {/* The second line: the kind, then the marks after it. */}
            <span {...stylex.props(styles.formCardKindRow)}>
              {isField ? (
                field && <CardKindLine field={field} />
              ) : (
                <span {...stylex.props(styles.formCardLabelRole, styles.formCardKind)}>{t("formEditor.noteKind")}</span>
              )}
              {isField && row.required === true && <span {...stylex.props(styles.formCardLabelRole)}>{t("formEditor.markRequired")}</span>}
              {isField && row.readonly === true && <span {...stylex.props(styles.formCardLabelRole)}>{t("formEditor.markReadonly")}</span>}
              {conditionMarked && <span {...stylex.props(styles.formCondition)}>{t("formEditor.markCondition")}</span>}
            </span>
          </button>
        )}
        {/* The keyboard route to the same array change a drag makes. A drag
            handle alone leaves reordering unreachable without a pointer. */}
        <span {...stylex.props(styles.formCardMoves, leafNaming && styles.formCardMovesWrapped)}>
          <button
            type="button"
            {...ghost(styles.authoringCommand, isFirst && styles.authoringCommandDisabled)}
            disabled={isFirst}
            aria-label={isField ? named("formEditor.moveUpNamed", labelFor(row.ref)) : t("formEditor.moveNoteUp")}
            onClick={() => move(rowIndex, -1)}
          >
            {t("formEditor.moveUp")}
          </button>
          <button
            type="button"
            {...ghost(styles.authoringCommand, isLast && styles.authoringCommandDisabled)}
            disabled={isLast}
            aria-label={isField ? named("formEditor.moveDownNamed", labelFor(row.ref)) : t("formEditor.moveNoteDown")}
            onClick={() => move(rowIndex, 1)}
          >
            {t("formEditor.moveDown")}
          </button>
          <button
            type="button"
            {...ghost(styles.authoringCommand)}
            aria-label={isField ? named("formEditor.removeNamed", labelFor(row.ref)) : t("formEditor.removeNote")}
            onClick={() => removeRow(rowIndex)}
          >
            {t("formEditor.remove")}
          </button>
        </span>
      </li>
    );
  };

  const selectedRow = selected !== undefined ? rows[selected] : undefined;
  const stepLabel = displayLabel(step.label, contentLocale, baseLocale) ?? t("steps.unnamedStep");

  return (
    // ponytail: same shortcut as `EditScreen.tsx`'s tab body, and the same
    // ceiling: a window refocus after a keyboard interaction still re-runs
    // this handler, since `lastInputModality` (`focusScroll.ts`) still
    // reads "keyboard" with no fresh keypress. Leaving by Alt+Tab hits a
    // pointer-focused control too: its Alt keydown sets the flag to
    // "keyboard" before the refocus fires. Upgrade: `ProcessTabRow.tsx`'s
    // own `windowBlurred` guard (`focusScrollsRow`).
    <div onFocusCapture={scrollKeyboardFocusIntoView} {...stylex.props(styles.formEditorPage)}>
      <header {...stylex.props(styles.formEditorHeader)}>
        {/* The way out (`studio-form-editor`: "A breadcrumb leads out of the
            form editor"): the tab that opened the editor, the step's page,
            then this form, which takes no press. */}
        <nav aria-label={t("formEditor.breadcrumb")}>
          <ol {...stylex.props(styles.crumbs)}>
            <li {...stylex.props(styles.crumb)}>
              <button type="button" {...stylex.props(styles.crumbControl)} onClick={onBack}>
                {t(`tabs.${originTab}` as const)}
              </button>
            </li>
            <li {...stylex.props(styles.crumb)}>
              <span aria-hidden="true" {...stylex.props(styles.crumbSeparator)}>
                ›
              </span>
              <button type="button" {...stylex.props(styles.crumbControl)} onClick={onOpenStep}>
                {stepLabel}
              </button>
            </li>
            <li {...stylex.props(styles.crumb)}>
              <span aria-hidden="true" {...stylex.props(styles.crumbSeparator)}>
                ›
              </span>
              <span aria-current="page" {...stylex.props(styles.crumbCurrent)}>
                {t("formEditor.crumbForm")}
              </span>
            </li>
          </ol>
        </nav>
        <h2 id={FORM_EDITOR_HEADING_ID} tabIndex={-1} {...stylex.props(styles.formEditorHeading)}>
          {t("formEditor.heading").replace("{step}", () => stepLabel)}
        </h2>
      </header>

      <div {...stylex.props(styles.formEditorBody)}>
        <nav {...stylex.props(styles.formPalette)} aria-label={t("formEditor.paletteLabel")}>
          <h3 {...stylex.props(styles.formPaletteHeading)}>{t("formEditor.paletteHeading")}</h3>
          {palette.length === 0 ? (
            <p className="empty">{t("formEditor.paletteEmpty")}</p>
          ) : (
            <ul {...stylex.props(styles.formPaletteList)}>
              {palette.map((row) => {
                const id = row.id as FieldId;
                const field = fieldFor(id);
                const label = labelFor(id);
                return (
                  <li key={id}>
                    <PanelsRailFieldRow
                      label={label}
                      typeLabel={field ? fieldKindWord(field) : undefined}
                      groupLabel={undefined}
                      kindIcon={field ? fieldKindIcon(field) : undefined}
                      depth={row.depth}
                      issues={0}
                      selected={false}
                      onClick={() => placeFromPalette(id, rows.length)}
                      onDragStart={() => setDragging({ kind: "palette", ref: id })}
                      onDragEnd={() => setDragging(undefined)}
                      onDrop={() => {}}
                      dragging={false}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          <h3 {...stylex.props(styles.formPaletteHeading, palette.length > 0 && styles.formPaletteHeadingBordered)}>
            {t("formEditor.mintHeading")}
          </h3>
          <ul {...stylex.props(styles.formPaletteList)}>
            {PALETTE_FIELD_KINDS.map((kind) => {
              const KindIcon = fieldKindIcon(FIELD_KINDS[kind]);
              return (
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
                  <span aria-hidden="true" {...stylex.props(styles.formPaletteKindIcon)}>
                    <KindIcon size={18} strokeWidth={1.75} />
                  </span>
                  <span {...stylex.props(styles.formPaletteKindName)}>{fieldKindLabel(kind).name}</span>
                </button>
              </li>
              );
            })}
          </ul>

          {/* A note belongs to no catalog, so it sits beside the palette
              rather than inside it (studio-form-editor: "An author places a
              note on the form canvas"). */}
          <h3 {...stylex.props(styles.formPaletteHeading, styles.formPaletteHeadingBordered)}>{t("formEditor.noteSectionHeading")}</h3>
          <button type="button" {...btn("btn btn-secondary", styles.formAddNote)} onClick={insertNote}>
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
                {...btn("btn btn-secondary", columns === n && styles.formColumnsOptionPressed)}
                aria-pressed={columns === n}
                onClick={() => setColumns(n)}
              >
                {n === 1 ? t("formEditor.oneColumn") : t("formEditor.twoColumns")}
              </button>
            ))}
          </div>

          {/* Directly above the canvas, so the accent rule under the open
              tab meets the entries it draws — the process tab row's own
              relation to its body (design.md "Visual direction"). */}
          <FormTabStrip
            tabs={tabs}
            open={shown}
            contentLocale={contentLocale}
            baseLocale={baseLocale}
            onOpen={(key) => {
              setActiveTab(key);
              // The selection is an array index into the whole view, and the
              // entry it names may sit on the tab just closed.
              setSelected(undefined);
            }}
            onAdd={addTab}
            onRename={renameTab}
            onMove={moveTab}
            onRemove={removeTab}
          />

          {/* The canvas is the open tab's one panel. An untabbed form draws
              no strip, so it stands as the plain region it always was. */}
          <div {...(shown === undefined ? {} : { role: "tabpanel", id: formTabPanelDomId(shown), "aria-labelledby": formTabDomId(shown) })}>
            <ol
              {...stylex.props(columns === 2 ? styles.formCanvasTwoCol : styles.formCanvasOneCol)}
              data-columns={columns}
              aria-label={t("formEditor.canvasLabel")}
            >
              {drawnRoots.length === 0 && <li {...stylex.props(styles.formCanvasEmpty)}>{t("formEditor.canvasEmpty")}</li>}
              {drawnRoots.map((node, i) => renderEntry(node, i === 0, i === drawnRoots.length - 1, rootScope))}
              {/* The tail slot, so a card can be dropped past the last one. */}
              <li
                {...stylex.props(styles.formCanvasTail)}
                onDragOver={(e) => {
                  e.stopPropagation();
                  if (lawfulDrop(rootScope)) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropAt(rows.length);
                }}
              >
                {t("formEditor.dropHere")}
              </li>
            </ol>
          </div>

          {selectedRow && isDraftViewField(selectedRow) ? (
            <FormEditorStrip
              row={selectedRow}
              label={labelFor(selectedRow.ref)}
              fieldLabel={fieldFor(selectedRow.ref)?.label}
              ownStepIndex={index}
              written={written}
              technicalFieldIds={technicalIds}
              isGroup={isGroupRow(selectedRow)}
              tabOptions={tabOptions}
              tabValue={owningTab(selectedRow, rows, groupKeyOf)}
              onChangeLabel={(label) => {
                if (selectedRow.ref) writeLabel(selectedRow.ref, label);
              }}
              onChangeFlag={(key, next) => setViewFlag(selected!, key, next)}
              onChangeSpan={(span) => updateRow(selected!, { span })}
              onChangeTab={(tab) => updateRow(selected!, { tab })}
            />
          ) : selectedRow ? (
            <NoteEditorStrip
              row={selectedRow}
              baseLocale={draft.baseLocale}
              groupOptions={groupOptions}
              tabOptions={tabOptions}
              tabValue={owningTab(selectedRow, rows, groupKeyOf)}
              onChangeText={(text) => updateRow(selected!, { text })}
              onChangeVisible={(visible) => setViewFlag(selected!, "visible", visible)}
              onChangeSpan={(span) => updateRow(selected!, { span })}
              onChangeGroup={(group) => changeGroup(selected!, group)}
              onChangeTab={(tab) => updateRow(selected!, { tab })}
            />
          ) : (
            <p {...stylex.props(styles.formStripEmpty)}>{t("formEditor.selectAField")}</p>
          )}
        </div>

        {/* The trailing pane. It reads the same `step` the canvas beside it
            writes, so every change lands in the preview on the same render
            (`studio-form-editor`). */}
        <FormPreview
          step={step}
          fields={fields}
          processLabel={processLabel}
          contentLocale={contentLocale}
          baseLocale={baseLocale}
          activeTab={shown}
          onTabChange={setActiveTab}
          style={styles.formEditorPreview}
        />
      </div>

      <footer {...stylex.props(styles.formEditorFooter)}>
        <p {...stylex.props(styles.studioDialogNote, styles.studioDialogNoteInFooter)}>{t("formEditor.navigateAwayKeepsChanges")}</p>
      </footer>
    </div>
  );
}

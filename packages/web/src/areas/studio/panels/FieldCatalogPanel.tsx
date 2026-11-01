import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  FIELD_KINDS,
  fieldKindOf,
  type DataSourceDef,
  type Expression,
  type FieldDef,
  type FieldKindName,
  type FieldOption,
} from "workflow-engine/schema";
import { FieldForm } from "form-ui";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Draft, DraftOf } from "../draft/types";
import { useDraft, type Mutate } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { removeAt } from "../draft/list-ops";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useDataLists } from "./shared/useDataLists.js";
import { columnMappingRows, declaredColumns, mappableTargets, showsColumnMapping } from "./columnMappingLogic.js";
import type { StudioDataList } from "../api/types.js";
import { IssueItems } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { FieldValidationEditor } from "./shared/FieldValidationEditor";
import { DefaultValueEditor } from "./shared/DefaultValueEditor";
import { fieldLocaleGaps, missingTranslationWarning, resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { flattenDraftFields } from "../draft/fields";
import { firstWorkedStepId } from "../draft/performedBy.js";
import { usePublishedFieldIds, usePublishedOptionValues } from "../draft/publishedFields.js";
import { applyChoiceName, applyChoiceValue } from "../draft/choiceValue.js";
import { countKeyRewrites } from "../draft/key-readers.js";
import { writeFieldKey } from "../draft/fieldKey.js";
import { writeFieldLabel } from "../draft/fieldLabel.js";
import {
  ADD_FIRST_FIELD_ID,
  droppedByKindChange,
  fieldKeyNoticeId,
  fieldKeyRefusalId,
  fieldLabelInputId,
  keyCommitProblem,
  keyFollowsLabel,
  keyHolderName,
  keyInputStep,
  keyNoticeFor,
  keyRefusalFor,
  labelChangePatch,
  moveControlId,
  moveTargetsFor,
  nextRewriteLine,
  removeControlId,
  rewriteLineFor,
  showsChoices,
  type KeyCommitProblem,
  type RewriteLineState,
} from "./fieldCatalogLogic.js";
import { fieldCheckZone, namesFieldKey, namesFieldTechnical, type FieldCheckZone } from "./fieldCheckZone.js";
import { fieldKindLabel } from "../draft/field-type-labels";
import {
  applyRequiredOverride,
  applyTechnicalMarker,
  applyVisibleOverride,
  clearConditionLabel,
  countTechnicalClearKeys,
  fieldRequiredOverrides,
  fieldVisibleOverrides,
  needsTechnicalToggleConfirm,
  visibleClearSteps,
} from "../draft/field-usage";
import { previewViewFields } from "../draft/field-preview";
import { ConditionInput } from "./shared/ConditionInput";
import { fill } from "./shared/optionText";
import { readByRows, type ReadByTarget } from "./readByRows";
import { askedOnRows, type AskedOnMark } from "./askedOnRows";
import type { EditorIssue } from "../draft/issues";

type DraftField = DraftOf<FieldDef>;
type DraftDataSource = DraftOf<DataSourceDef>;
type DraftOption = DraftOf<FieldOption>;

/** The word each Asked on mark prints, in the body face. */
const MARK_KEY: Record<AskedOnMark, CatalogKey> = {
  required: "formEditor.required",
  readonly: "formEditor.readonly",
  hidden: "fieldCard.hiddenMark",
};

/** Every style this file's own markup renders. The card follows the step
 * page's reading column (`StepPage.tsx`'s `column`): one column, flush left,
 * capped at 52rem. */
const styles = stylex.create({
  // The card: the field's name line, its inputs, its sections, then More and
  // Remove field, top to bottom in one column.
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
    width: "100%",
    maxWidth: "52rem",
    minWidth: 0,
  },
  panelHeading: {
    alignSelf: "stretch",
    marginBlockEnd: space.s1,
    marginBlockStart: 0,
    marginInline: 0,
    paddingBottom: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    overflowWrap: "anywhere",
  },
  // A field's own label: the label above its control, both flush left.
  fieldRowLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
    width: "100%",
  },
  // A checkbox IS its own label's control, so it sits beside the words
  // rather than under them. Applied after `fieldRowLabel`, so it wins.
  checkboxLabel: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.s2,
  },
  studioMono: {
    fontFamily: fonts.mono,
  },
  // One section of the card. Every section but Kind stands under a 1px
  // hairline (design.md D1).
  section: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
    width: "100%",
    minWidth: 0,
  },
  sectionRuled: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    marginBlockStart: space.s3,
    paddingBlockStart: space.s3,
  },
  // The Title style (`DESIGN.md`'s Typography): 800, 0.85rem, uppercase,
  // tracked 0.08em, in slate. `shell/global.css` gives every heading a face,
  // a size and margins; the declarations here reset them.
  sectionHeading: {
    margin: 0,
    fontFamily: fonts.body,
    fontSize: "0.85rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
  // A section holding a check takes the refusal tone at its own heading, so
  // an author scanning the card sees which section is wrong with nothing to
  // open.
  headingFailed: {
    color: colors.refusal,
  },
  // More: a native disclosure, kept a block box, since a `<details>` makes a
  // poor flex container. Its body below lays the parts out.
  more: {
    width: "100%",
  },
  // More's summary carries its heading inline, beside the disclosure marker.
  moreSummary: {
    cursor: "pointer",
  },
  moreHeadingInline: {
    display: "inline",
  },
  // More's body: its parts in one column under the summary.
  moreBody: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
    width: "100%",
    paddingBlockStart: space.s3,
  },
  morePart: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
    width: "100%",
    minWidth: 0,
  },
  // The Legend style (`DESIGN.md`'s Typography): a sub-heading inside a
  // section.
  subHeading: {
    margin: 0,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  // A register: hairline-divided rows, flush left.
  register: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    width: "100%",
  },
  // One register row: what it names on the leading edge, its authoring
  // commands at the trailing edge. Both wrap, since a German label runs up to
  // forty percent longer than its English one.
  registerRow: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "baseline",
    columnGap: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  registerMain: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: space.s3,
    rowGap: space.s1,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // The sentence under a row's name, on its own line, in slate.
  registerSentence: {
    flexBasis: "100%",
    color: colors.textMuted,
  },
  registerCommands: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: space.s1,
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate,
  // mono at 11px. It composes over `btn btn-ghost`, whose accent it replaces.
  // Under the pointer and while pressed its text turns to ink.
  command: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    textAlign: "left",
    overflowWrap: "anywhere",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  // A choice row: the name input, then Remove. It wraps rather than
  // overflowing, for a German Remove.
  choiceRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    paddingBlock: space.s1,
  },
  // `minWidth: 0` overrides an input's own intrinsic minimum, which flex
  // otherwise honours, so the input shrinks with the row.
  choiceName: {
    flex: "1 1 12rem",
    minWidth: 0,
  },
  choiceValueRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    paddingBlock: space.s1,
  },
  choiceValueName: {
    flex: "1 1 8rem",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  choiceValueLabel: {
    flex: "1 1 12rem",
  },
  // The preview is a native `<details>`: the browser tracks open/closed as
  // DOM state, so no component state exists for it.
  fieldPreview: {
    width: "100%",
  },
  fieldPreviewSummary: {
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 800,
  },
  fieldPreviewBody: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    padding: space.s3,
    width: "100%",
    marginTop: space.s2,
  },
  fieldLabelRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: space.s2,
    width: "100%",
  },
  fieldLabelRowLabel: {
    flex: 1,
  },
  fieldTranslationBadge: {
    flex: "none",
    fontSize: "0.8rem",
    color: colors.textMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: 2,
    paddingInline: space.s2,
  },
  // The check list in a section: flush left, no marker, the refusal tone the
  // heading above it takes. Handed to `IssueItems`, so the checks rail's own
  // list keeps whatever it has.
  zoneIssueList: {
    listStyle: "none",
    marginBlock: 0,
    marginInline: 0,
    padding: 0,
    width: "100%",
    color: colors.refusal,
    fontSize: "0.9rem",
  },
  // Remove field: below a hairline of its own, de-emphasized (`.btn-ghost`),
  // the card's least frequent action.
  removeRow: {
    width: "100%",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    marginTop: space.s3,
    paddingTop: space.s3,
  },
  // Asked on's empty state and the empty catalog's start state. Both say why
  // they are empty and offer the way on, and both take the empty tone —
  // neither is a failure.
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
  },
  studioEmpty: {
    color: colors.textMuted,
    margin: 0,
  },
  startState: {
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  // No font-size of its own: the heading takes the browser's own `h4` step,
  // which sits below the panel heading above it.
  fieldCatalogStartHeading: {
    margin: 0,
    fontWeight: 800,
  },
  // The start state carries the screen's only prose, and body copy sits in
  // one measure.
  fieldCatalogStartBody: {
    maxWidth: "60ch",
    padding: 0,
  },
  studioColumnMappingRow: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flexWrap: "wrap",
    width: "100%",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  // A column key is a value the engine matches, so it takes mono. The target
  // picker prints field labels in the body face.
  studioColumnMappingRowSelect: {
    fontFamily: fonts.mono,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
  },
  // A refused key commit's sentence, close under the Key input.
  studioRefusalAtInput: {
    marginBlockStart: space.s1,
    marginBlockEnd: 0,
  },
  // The rewrite line prints in ink, the way a success confirmation prints.
  // The region always renders, so it takes no space until it holds text.
  rewriteLine: {
    margin: 0,
  },
  rewriteLineShown: {
    marginBlockStart: space.s1,
    marginBlockEnd: space.s2,
  },
  // The stale-column warning takes the whole line under the row instead of
  // squeezing beside three controls.
  studioWarningInMappingRow: {
    flexBasis: "100%",
    margin: 0,
  },
  studioNote: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
  // A standalone note (`DESIGN.md` Inputs / Fields): no box, a 2px hairline
  // rule on its left, 12px from the text, in slate.
  studioNoteRuled: {
    paddingLeft: space.s3,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
  },
  // The condition input's Developer view (`shared/ConditionInput.tsx`),
  // duplicated: an area's component never reads another component's style
  // object. One look for every Developer view on the card.
  studioDevview: {
    width: "100%",
    paddingBlock: space.s2,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  studioDevviewSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
});

/** An authoring command's props: the `.btn` family plus the compiled style,
 * joined in one `className`, since a `className` written after a spread of
 * `stylex.props` would replace it. */
function commandProps() {
  const compiled = stylex.props(styles.command);
  return { ...compiled, className: `btn btn-ghost ${compiled.className ?? ""}`.trim() };
}

/** The picker's own value for the plugin envelope — a kind name the engine's
 * table never carries, so it cannot collide with one. */
const CUSTOM_KIND = "__custom__";
const KIND_NAMES = Object.keys(FIELD_KINDS) as FieldKindName[];

function isCustomType(type: DraftField["type"]): type is DraftOf<FieldDef>["type"] & object {
  return typeof type === "object" && type !== null;
}

/** What one key commit did: the text the input keeps, the refusal it shows,
 * whether it wrote the draft, and how many expressions that write rewrote. */
export interface KeyCommitResult {
  typed: string | undefined;
  problem?: KeyCommitProblem;
  wrote: boolean;
  rewrote: number;
}

/**
 * One commit of a field's key input, at any nesting depth. A commit with no
 * typed text, or the field's own key, writes nothing. A commit
 * `keyCommitProblem` refuses keeps the typed text and writes nothing. Any
 * other commit writes through `writeFieldKey`, which moves the expressions
 * reading the old key in the same write, or the view entries naming a
 * group's key. The count comes from the draft before the write
 * (`countKeyRewrites`), since a `mutate` recipe's return never reaches here.
 */
export function commitKeyInput(draft: Draft, mutate: Mutate, field: DraftField, typed: string | undefined): KeyCommitResult {
  const current = field.key ?? "";
  const next = keyInputStep(typed, { kind: "commit" }, current).write;
  const fieldId = field.id;
  if (next === undefined || fieldId === undefined) return { typed: undefined, wrote: false, rewrote: 0 };
  const problem = keyCommitProblem(draft, field, next);
  if (problem !== undefined) return { typed, problem, wrote: false, rewrote: 0 };
  const rewrote = field.type === "group" ? 0 : countKeyRewrites(draft, fieldId, current, next);
  mutate((d) => writeFieldKey(d, fieldId, next));
  return { typed: undefined, wrote: true, rewrote };
}

/**
 * One label write from the field catalog, at any nesting depth, through
 * `writeFieldLabel`: the form editor's write, so a key the label moves takes
 * its readers along. Answers how many expressions the write rewrote, counted
 * from the draft before the write. A group's label rewrites view entries and
 * no expression, so it answers 0.
 */
export function writeLabelFromCatalog(
  draft: Draft,
  mutate: Mutate,
  field: DraftField,
  label: DraftField["label"],
  baseLocale: string,
  published: ReadonlySet<string> | undefined,
): number {
  const fieldId = field.id;
  if (fieldId === undefined) return 0;
  const key = field.type === "group" ? undefined : labelChangePatch(draft, field, label, baseLocale, published).key;
  const current = field.key ?? "";
  const rewrote = key === undefined || key === current ? 0 : countKeyRewrites(draft, fieldId, current, key);
  mutate((d) => writeFieldLabel(d, fieldId, label, baseLocale, published));
  return rewrote;
}

interface FieldKeyInputProps {
  field: DraftField;
  /** The sentence on where the key comes from (`keyNoticeFor`), or none. */
  notice: string | undefined;
  /** Fires after a commit that wrote the draft, with its rewrite count.
   * `FieldEditor` sets its rewrite line from it. */
  onCommitted: (rewrote: number) => void;
}

/**
 * The key input inside the Developer view that closes the card's More, for
 * the selected field at any nesting depth. It holds the typed text
 * locally and commits it on blur or Enter, in one write, so typing writes
 * nothing and a half-typed key never reaches the draft. Escape drops the
 * typed text. A refused commit keeps the text and shows its sentence under
 * the input until the next keystroke. The notice follows the refusal, and the
 * input names both in `aria-describedby`.
 */
function FieldKeyInput({ field, notice, onCommitted }: FieldKeyInputProps) {
  const { draft, mutate, contentLocale } = useDraft();
  const [typed, setTyped] = useState<string | undefined>(undefined);
  // The refused commit's sentence, fixed at the commit, so the field it names
  // stays the one that held the key then.
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const currentKey = field.key ?? "";
  const fieldId = field.id;
  const commit = () => {
    const result = commitKeyInput(draft, mutate, field, typed);
    setTyped(result.typed);
    setRefusal(
      result.problem === undefined
        ? undefined
        : keyRefusalFor(result.problem, keyHolderName(draft, field, result.typed ?? "", contentLocale)),
    );
    if (result.wrote) onCommitted(result.rewrote);
  };
  const refusalId = refusal !== undefined && fieldId !== undefined ? fieldKeyRefusalId(fieldId) : undefined;
  const noticeId = notice !== undefined && fieldId !== undefined ? fieldKeyNoticeId(fieldId) : undefined;
  const describedBy = [refusalId, noticeId].filter((id) => id !== undefined).join(" ");
  return (
    <>
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.keyLabel")}
        <input
          type="text"
          spellCheck={false}
          autoComplete="off"
          translate="no"
          {...stylex.props(styles.studioMono)}
          value={typed ?? currentKey}
          aria-invalid={refusal !== undefined ? true : undefined}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          onChange={(e) => {
            setRefusal(undefined);
            setTyped(keyInputStep(typed, { kind: "type", text: e.target.value }, currentKey).typed);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setRefusal(undefined);
              setTyped(keyInputStep(typed, { kind: "escape" }, currentKey).typed);
            }
          }}
        />
      </label>
      {/* `role="alert"`: a refusal shows on Enter or on a blur commit, after
          focus may have left the input, so it announces itself. */}
      {refusal !== undefined && (
        <p id={refusalId} role="alert" {...stylex.props(styles.studioWarning, styles.studioRefusalAtInput)}>
          {refusal}
        </p>
      )}
      {notice !== undefined && (
        <p id={noticeId} {...stylex.props(styles.studioNote)}>
          {notice}
        </p>
      )}
    </>
  );
}

/**
 * Applies a kind switch, dropping the `format` or `control` the new kind does
 * not name and saying so before it happens.
 *
 * A kind names one `{type, format, control}` triple, so the switch writes all
 * three at once. A key the entry omits is written as `undefined`, which
 * serializes as absent — the definition keeps exactly the keys it carries
 * today. Leaving a key in place would let the developer publish a body
 * `checkFieldFormatControl` rejects, and the picker would offer nothing that
 * says why.
 */
function changeKind(field: DraftField, raw: string, onChange: (patch: Partial<DraftField>) => void): void {
  if (raw === CUSTOM_KIND) {
    if (!confirmDrops(droppedByKindChange(field, undefined))) return;
    onChange({ type: { type: "", config: {} }, format: undefined, control: undefined });
    return;
  }
  const entry = FIELD_KINDS[raw as FieldKindName];
  if (entry === undefined) return;
  if (!confirmDrops(droppedByKindChange(field, entry))) return;
  onChange({ type: entry.type, format: entry.format, control: entry.control });
}

/** One key per whole sentence: a translator reads the sentence, never two
 * halves glued around a key name. */
function confirmDrops(dropped: ("format" | "control")[]): boolean {
  if (dropped.length === 0) return true;
  const message =
    dropped.length === 2
      ? t("fieldCatalog.typeDropsBothConfirm")
      : dropped[0] === "format"
        ? t("fieldCatalog.typeDropsFormatConfirm")
        : t("fieldCatalog.typeDropsControlConfirm");
  return confirm(message);
}

/**
 * The one picker that says what kind of field this is, wherever
 * `FieldEditor` renders it — the selected field, at any nesting depth. It
 * reads the engine package's own `FIELD_KINDS` table over the exports map,
 * so the studio declares no second table to drift from it.
 *
 * A field whose triple the curated table names no kind for keeps its own
 * entry, printing the raw triple in the mono face. That entry is a machine
 * value, so no catalog key translates it. Picking any other entry replaces
 * the triple; the JSON view stays the route back to an unnamed one.
 */
function KindPicker({ field, onChange }: { field: DraftField; onChange: (patch: Partial<DraftField>) => void }) {
  const custom = isCustomType(field.type);
  const kind = custom ? undefined : fieldKindOf(field);
  const unnamed = !custom && kind === undefined;
  const rawTriple = [field.type, field.format, field.control].filter((m) => typeof m === "string").join(" / ");
  // A Text field with choices asks for one of them, not a free line.
  const withChoices = (field.options?.length ?? 0) > 0 || field.dataSource !== undefined;
  const kindNote =
    kind === undefined ? undefined : kind === "text" && withChoices ? t("fieldCard.kindNoteWithChoices") : fieldKindLabel(kind).note;
  return (
    <>
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.kindLabel")}
        {/* The written face, not mono: a kind name is a word an author reads,
            not a value the engine matches. The one exception is the raw
            triple below, which is exactly such a value. */}
        <select value={custom ? CUSTOM_KIND : (kind ?? "")} onChange={(e) => changeKind(field, e.target.value, onChange)}>
          {unnamed && (
            <option {...stylex.props(styles.studioMono)} value="">
              {rawTriple}
            </option>
          )}
          {KIND_NAMES.map((name) => (
            <option key={name} value={name}>
              {fieldKindLabel(name).name}
            </option>
          ))}
          <option value={CUSTOM_KIND}>{t("fieldCatalog.customTypeOption")}</option>
        </select>
      </label>
      {kind !== undefined && <p {...stylex.props(styles.studioNote)}>{kindNote}</p>}
    </>
  );
}

interface MoveFieldControlProps {
  fieldId: string;
  /** The catalog's own top-level array, `draft.fields ?? []`. `moveTargetsFor`
   * walks the whole tree from there, regardless of `fieldId`'s own depth. */
  fields: DraftField[];
  contentLocale: string;
  baseLocale: string;
  onMoveField: (fieldId: string, targetGroupId: string | undefined) => void;
}

/**
 * The keyboard half of the move (`spa-accessibility`): the field's own
 * editor names every destination the rail's drag reaches, the top level
 * included, and writes through the one function the drag also calls
 * (`EntityTabs.tsx`'s `FieldsTab::moveField`, threaded here as
 * `onMoveField`). Rendered like the key beside it, a `fieldRowLabel` label
 * around the control (design.md, decision: "The move control leaves the
 * rail for the editor").
 *
 * Disabled with fewer than two destinations: a field with nowhere else to go
 * has nothing for the control to offer.
 */
export function MoveFieldControl({ fieldId, fields, contentLocale, baseLocale, onMoveField }: MoveFieldControlProps) {
  const { currentId, targetIds } = moveTargetsFor(fields, fieldId);
  const flat = flattenDraftFields(fields);
  const targetLabel = (targetId: string | undefined) => {
    if (targetId === undefined) return t("panelsScreen.moveTargetTopLevel");
    const target = flat.find((f) => f.id === targetId);
    return resolveDraftLocalizedText(target?.label, contentLocale, baseLocale) || t("panelsScreen.unnamedField");
  };
  return (
    <label {...stylex.props(styles.fieldRowLabel)}>
      {t("panelsScreen.moveTargetLabel")}
      <select
        id={moveControlId(fieldId)}
        disabled={targetIds.length < 2}
        value={currentId ?? ""}
        onChange={(e) => onMoveField(fieldId, e.target.value === "" ? undefined : e.target.value)}
      >
        {targetIds.map((targetId) => (
          <option key={targetId ?? ""} value={targetId ?? ""}>
            {targetLabel(targetId)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One section of the card: a heading in the Title style, the checks the
 * section owns, then its controls. Every section but Kind stands under a 1px
 * hairline. The heading takes the refusal tone while the section holds a
 * check.
 */
function CardSection({
  heading,
  issues,
  ruled = true,
  children,
}: {
  heading: string;
  issues: EditorIssue[];
  /** False for Kind alone, which follows the Name inputs with no rule. */
  ruled?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  const failed = issues.length > 0;
  return (
    <section aria-labelledby={headingId} {...stylex.props(styles.section, ruled && styles.sectionRuled)}>
      <FlaggedHeading as="h4" id={headingId} failed={failed}>
        {heading}
      </FlaggedHeading>
      <IssueItems issues={issues} style={styles.zoneIssueList} />
      {children}
    </section>
  );
}

/** A heading that takes the refusal tone while `failed`. The flag arrives as
 * a prop: the StyleX compiler evaluates a `stylex.props` argument's bindings,
 * and a local computed from a call stops it. */
function FlaggedHeading({
  as: Tag,
  id,
  failed,
  inline = false,
  children,
}: {
  as: "h3" | "h4";
  id?: string;
  failed: boolean;
  inline?: boolean;
  children: ReactNode;
}) {
  const base = Tag === "h3" ? styles.panelHeading : styles.sectionHeading;
  return (
    <Tag
      id={id}
      {...stylex.props(base, inline && styles.moreHeadingInline, failed && styles.headingFailed)}
      data-checked={failed ? "failed" : undefined}
    >
      {children}
    </Tag>
  );
}

/** One part of More: a sub-heading in the Legend style, its checks, then its
 * controls. */
function MorePart({ heading, issues, children }: { heading: string; issues: EditorIssue[]; children: ReactNode }) {
  const failed = issues.length > 0;
  return (
    <div {...stylex.props(styles.morePart)}>
      <h5 {...stylex.props(styles.subHeading, failed && styles.headingFailed)} data-checked={failed ? "failed" : undefined}>
        {heading}
      </h5>
      <IssueItems issues={issues} style={styles.zoneIssueList} />
      {children}
    </div>
  );
}

interface FieldEditorProps {
  field: DraftField;
  dataSources: DraftDataSource[];
  lists: StudioDataList[] | undefined;
  /** The step Asked on's empty state routes to (`firstWorkedStepId`), or
   * `undefined` while no step a person works exists. */
  routeStepId: string | undefined;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
  onShowStep: (stepId: string) => void;
  /** Opens the form editor for one step: an Asked on row's "Open the form"
   * and the empty state's route. */
  onOpenForm: (stepId: string) => void;
  /** A Read by row's "Open" (design.md D4). */
  onOpenPlace: (target: ReadByTarget) => void;
  /** The move's one write (`EntityTabs.tsx`'s `FieldsTab::moveField`). */
  onMoveField: (fieldId: string, targetGroupId: string | undefined) => void;
  /** Adds a field at the end of this group and selects it, from the "Fields
   * inside this group" section of a group's card. */
  onAdd: (groupId: string) => void;
  /** True while `FieldsTab` asks this card to open More: a Read by row of
   * another field, or of this one, named this field's rule or default. */
  openMore: boolean;
  /** Tells `FieldsTab` the card opened More, so it clears the request and a
   * later manual close holds. */
  onMoreOpened: () => void;
}

/**
 * The card over the SELECTED field alone, at any nesting depth (design.md
 * D1). It reads top to bottom: the name line, the Name and Description
 * inputs, then Kind, Choices, Asked on, Read by, a group's "Fields inside this
 * group", More, and Remove field.
 *
 * Every section stays mounted while the field stays selected. Each builder
 * holds an incomplete row the draft does not carry, and the Developer view
 * holds a half-typed config in component state; unmounting would drop both.
 * `FieldCatalogPanel` keys the card on the field's id, so another field opens
 * with none of that state.
 */
function FieldEditor({
  field,
  dataSources,
  lists,
  routeStepId,
  onChange,
  onRemove,
  onShowStep,
  onOpenForm,
  onOpenPlace,
  onMoveField,
  onAdd,
  openMore,
  onMoreOpened,
}: FieldEditorProps) {
  const { draft, mutate, contentLocale, validation } = useDraft();
  const published = usePublishedFieldIds();
  const publishedValues = usePublishedOptionValues();

  // How many expressions the last key change rewrote, while one rewrote any,
  // and how many writes rewrote one (`nextRewriteLine`).
  const [rewriteLine, setRewriteLine] = useState<RewriteLineState>({ count: undefined, write: 0 });
  const noteRewrites = (rewrote: number) => setRewriteLine((state) => nextRewriteLine(state, rewrote));

  const custom = isCustomType(field.type);
  const options = field.options ?? [];
  const hasOptions = options.length > 0;
  const hasDataSource = field.dataSource !== undefined;
  const baseLocale = draft.baseLocale ?? "en";
  const fieldId = field.id;
  const isGroup = field.type === "group";
  const fieldKey = field.key ?? "";

  const setOptions = (next: DraftOption[]) => onChange({ options: next, dataSource: next.length > 0 ? undefined : field.dataSource });

  // A choice's value is locked once the base version holds it. While the base
  // version loads, or after its fetch failed, every non-empty value counts as
  // locked, the safe side.
  const isLocked = (option: DraftOption): boolean => {
    const value = option.value ?? "";
    if (value === "") return false;
    if (publishedValues === undefined) return true;
    return fieldId !== undefined && (publishedValues.get(fieldId)?.has(value) ?? false);
  };
  const anyLocked = options.some(isLocked);

  /** A choice's name write: the label, the value that follows it, and the
   * field's own default, in one draft change (`applyChoiceName`). */
  const nameChoice = (index: number, label: DraftOption["label"]) => {
    const option = options[index];
    if (fieldId === undefined || option === undefined) return;
    const locked = isLocked(option);
    mutate((d) => {
      const target = flattenDraftFields(d.fields).find((f) => f.id === fieldId);
      if (target) applyChoiceName(target, index, label, baseLocale, locked);
    });
  };
  const addChoice = () => setOptions([...options, { value: "", label: seedLocalizedText(contentLocale) }]);
  /** A hand edit of a stored value carries the field's own default along,
   * as the name-driven move does (`applyChoiceValue`). */
  const updateChoiceValue = (index: number, value: string) => {
    if (fieldId === undefined) return;
    mutate((d) => {
      const target = flattenDraftFields(d.fields).find((f) => f.id === fieldId);
      if (target) applyChoiceValue(target, index, value);
    });
  };
  const removeChoice = (index: number) => setOptions(removeAt(options, index));

  const mappingRows = columnMappingRows(field, dataSources, lists);
  const columns = declaredColumns(field, dataSources, lists);
  const targets = mappableTargets(field, draft.fields ?? []);
  const unmapped = columns.find((c) => !mappingRows.some((r) => r.column === c));

  const writeMapping = (next: Record<string, string>) =>
    onChange({ columnMapping: (Object.keys(next).length === 0 ? undefined : next) as DraftField["columnMapping"] });
  const setMapping = (column: string, target: string) => {
    const next = { ...((field.columnMapping ?? {}) as Record<string, string>) };
    next[column] = target;
    writeMapping(next);
  };
  const renameMapping = (from: string, to: string) => {
    const current = (field.columnMapping ?? {}) as Record<string, string>;
    writeMapping(Object.fromEntries(Object.entries(current).map(([k, v]) => (k === from ? [to, v] : [k, v]))));
  };
  const removeMapping = (column: string) => {
    const next = { ...((field.columnMapping ?? {}) as Record<string, string>) };
    delete next[column];
    writeMapping(next);
  };
  const addMapping = () => unmapped !== undefined && setMapping(unmapped, "");

  const fieldName = (f: DraftField) => resolveDraftLocalizedText(f.label, contentLocale, baseLocale) || t("panelsScreen.unnamedField");
  const sourceName = (ds: DraftDataSource | undefined) => (ds?.key ? ds.key : t("panelsScreen.unnamedDataSource"));
  const boundSource = hasDataSource ? dataSources.find((ds) => ds.id === field.dataSource) : undefined;

  /** The label write the form editor shares (`writeFieldLabel`). A key the
   * label still derives follows it until the base version holds the field
   * (`fieldCatalogLogic.ts::isFieldKeyLocked`), and takes the expressions
   * reading the old key along. */
  const updateLabel = (label: DraftField["label"]) => {
    noteRewrites(writeLabelFromCatalog(draft, mutate, field, label, baseLocale, published));
  };
  const keyNotice = isGroup
    ? undefined
    : keyNoticeFor(
        fieldKey,
        published === undefined ? undefined : fieldId !== undefined && published.has(fieldId),
        keyFollowsLabel(draft, field),
      );

  const asked = useMemo(
    () => (fieldId === undefined ? [] : askedOnRows(draft, fieldId, contentLocale)),
    [draft, fieldId, contentLocale],
  );
  const readBy = useMemo(
    () => (isGroup ? [] : readByRows(draft, fieldKey, contentLocale)),
    [draft, fieldKey, contentLocale, isGroup],
  );
  const stepLabel = (stepId: string) => asked.find((row) => row.stepId === stepId)?.stepLabel ?? t("steps.unnamedStep");
  const stepLabels = (stepIds: string[]) => stepIds.map(stepLabel).join(", ");

  const visibleState = fieldId ? fieldVisibleOverrides(draft, fieldId) : ({ kind: "none" } as const);
  const requiredState = fieldId ? fieldRequiredOverrides(draft, fieldId) : ({ kind: "none" } as const);
  const clearSteps = visibleClearSteps(visibleState);
  const preview = previewViewFields(field, contentLocale, baseLocale);
  // Two fields preview with no option list, and the row names which one. A
  // bare person field declares no data source, so it takes its own wording.
  const previewNote: CatalogKey | undefined =
    hasDataSource
      ? "fieldCatalog.previewResolvesAtRuntime"
      : field.format === "person" && options.length === 0
        ? "fieldCatalog.previewPersonResolvesAtRuntime"
        : undefined;

  const writeVisible = (next: DraftOf<Expression> | undefined) => {
    if (fieldId === undefined) return;
    mutate((d) => applyVisibleOverride(d, fieldId, next));
  };

  const technicalChecked = field.technical === true;
  const toggleTechnical = (next: boolean) => {
    if (fieldId === undefined) return;
    const clearCount = countTechnicalClearKeys(draft, fieldId);
    if (needsTechnicalToggleConfirm(next, clearCount) && !confirm(t("fieldCatalog.technicalClearConfirm").replace("{count}", String(clearCount)))) return;
    mutate((d) => applyTechnicalMarker(d, fieldId, next));
  };

  const writeRequired = (next: boolean) => {
    if (fieldId === undefined) return;
    mutate((d) => applyRequiredOverride(d, fieldId, next));
  };

  // Each section owns the checks whose `loc` names its zone (design.md D5).
  // A `loc` naming no zone stands at the card's top, beside the name line, so
  // no check goes unshown for want of a matching section.
  const fieldIssues = validation.issues.filter((i) => i.entityId === fieldId);
  const zoned = (zone: FieldCheckZone) => fieldIssues.filter((i) => fieldCheckZone(i.loc) === zone);
  // A check on an option or the source stands under Choices; a card with no
  // Choices section stands it at the top with the rest.
  const choicesShown = showsChoices(field);
  const unplaced = fieldIssues.filter((i) => {
    const zone = fieldCheckZone(i.loc);
    return zone === undefined || (zone === "values" && !choicesShown);
  });
  const defaultIssues = zoned("default");
  const validationIssues = zoned("validation");
  const mappingIssues = zoned("columnMapping");
  // A check on the key opens More and its Developer view, so the key input
  // shows. A check on the Technical marker prints under Kind and opens More,
  // where the checkbox stands. The author's own toggle holds otherwise.
  const keyChecked = zoned("asks").some((i) => namesFieldKey(i.loc));
  const technicalCheckedIssue = zoned("kind").some((i) => namesFieldTechnical(i.loc));
  const moreFailed = defaultIssues.length + validationIssues.length + mappingIssues.length > 0;
  const moreChecked = moreFailed || keyChecked || technicalCheckedIssue;
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyViewOpen, setKeyViewOpen] = useState(false);

  // A Read by row's "Open" on this field's rule or default. The card may be
  // mounted already, so it reacts to the request rather than reading it once.
  useEffect(() => {
    if (!openMore) return;
    setMoreOpen(true);
    onMoreOpened();
  }, [openMore, onMoreOpened]);

  const requiredDisabled = technicalChecked || requiredState.kind === "none";
  // The box shows neither checked nor clear while the steps disagree.
  const requiredBox = useRef<HTMLInputElement>(null);
  const requiredMixed = requiredState.kind === "divergent";
  useEffect(() => {
    if (requiredBox.current) requiredBox.current.indeterminate = requiredMixed;
  }, [requiredMixed, isGroup, asked.length]);
  const nameFailed = unplaced.length + zoned("asks").length > 0;
  const label = resolveDraftLocalizedText(field.label, contentLocale, baseLocale) || t("panelsScreen.unnamedField");
  const nameLineId = useId();

  return (
    <article aria-labelledby={nameLineId} {...stylex.props(styles.card)}>
      {/* The field's name line. The screen heading already reads "Field
          catalog", and the label itself lives inside an editable input, which
          no heading and no rail row spells out. An author working a 22-field
          catalog would have nothing to read back but the selection mark. */}
      <FlaggedHeading as="h3" id={nameLineId} failed={nameFailed}>
        {label}
      </FlaggedHeading>
      <IssueItems issues={[...unplaced, ...zoned("asks")]} style={styles.zoneIssueList} />

      <div {...stylex.props(styles.fieldLabelRow)}>
        <label {...stylex.props(styles.fieldRowLabel, styles.fieldLabelRowLabel)}>
          {t("fieldCard.nameLabel")}
          <LocalizedTextInput id={fieldId === undefined ? undefined : fieldLabelInputId(fieldId)} value={field.label} onChange={updateLabel} />
        </label>
        {/* Names only the active contentLocale's own gap: the content-locale
            switcher carries the draft-wide per-locale count. */}
        <span {...stylex.props(styles.fieldTranslationBadge)}>
          {contentLocale === baseLocale
            ? t("fieldCatalog.baseLocaleMark")
            : fieldLocaleGaps(field, contentLocale, baseLocale) === 0
              ? t("fieldCatalog.translationComplete")
              : t("fieldCatalog.translationGap").replace("{count}", String(fieldLocaleGaps(field, contentLocale, baseLocale)))}
        </span>
      </div>
      {/* The region always stands; its text sits in a child keyed on the
          write, so each rewrite replaces the text node and announces, the
          same count again included. */}
      <p role="status" aria-live="polite" {...stylex.props(styles.rewriteLine, rewriteLine.count !== undefined && styles.rewriteLineShown)}>
        {rewriteLine.count !== undefined && <span key={rewriteLine.write}>{rewriteLineFor(rewriteLine.count)}</span>}
      </p>
      {missingTranslationWarning(field.label, contentLocale, draft.baseLocale) && (
        <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(field.label, contentLocale, draft.baseLocale)}</p>
      )}
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.descriptionLabel")}
        <LocalizedTextInput value={field.description} onChange={(description) => onChange({ description })} />
      </label>
      {missingTranslationWarning(field.description, contentLocale, draft.baseLocale) && (
        <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(field.description, contentLocale, draft.baseLocale)}</p>
      )}

      <CardSection heading={t("fieldCard.kindHeading")} issues={zoned("kind")} ruled={false}>
        <KindPicker field={field} onChange={onChange} />
      </CardSection>

      {choicesShown && (
        <CardSection heading={t("fieldCard.choicesHeading")} issues={zoned("values")}>
          {hasDataSource ? (
            <>
              <p {...stylex.props(styles.studioEmpty)}>{fill(t("fieldCard.choicesFromSource"), { source: sourceName(boundSource) })}</p>
              <p {...stylex.props(styles.studioEmpty)}>{t("fieldCard.choicesFromSourceNote")}</p>
            </>
          ) : (
            <>
              {!hasOptions && <p {...stylex.props(styles.studioEmpty)}>{t("fieldCard.choicesEmpty")}</p>}
              {hasOptions && (
                <ul {...stylex.props(styles.register)}>
                  {options.map((opt, i) => {
                    const optionWarning = missingTranslationWarning(opt.label, contentLocale, draft.baseLocale);
                    return (
                      // A choice carries no identity of its own; its position is its.
                      <li key={i}>
                        <div {...stylex.props(styles.choiceRow)}>
                          <LocalizedTextInput
                            {...stylex.props(styles.choiceName)}
                            ariaLabel={t("fieldCard.choiceNamePlaceholder")}
                            placeholder={t("fieldCard.choiceNamePlaceholder")}
                            value={opt.label}
                            onChange={(next) => nameChoice(i, next)}
                          />
                          <button type="button" {...commandProps()} onClick={() => removeChoice(i)}>
                            {t("fieldCard.removeChoice")}
                          </button>
                        </div>
                        {optionWarning && <p {...stylex.props(styles.studioWarning)}>{optionWarning}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" {...commandProps()} onClick={addChoice}>
                {t("fieldCard.addChoice")}
              </button>
              {hasOptions && (
                <details {...stylex.props(styles.studioDevview)}>
                  <summary {...stylex.props(styles.studioDevviewSummary)}>{t("fieldCatalog.developerView")}</summary>
                  {options.map((opt, i) => (
                    <div key={i} {...stylex.props(styles.choiceValueRow)}>
                      <span {...stylex.props(styles.choiceValueName)}>
                        {resolveDraftLocalizedText(opt.label, contentLocale, baseLocale) || t("fieldCard.unnamedChoice")}
                      </span>
                      <label {...stylex.props(styles.fieldRowLabel, styles.choiceValueLabel)}>
                        {t("fieldCard.choiceValueLabel")}
                        <input
                          type="text"
                          spellCheck={false}
                          autoComplete="off"
                          translate="no"
                          {...stylex.props(styles.studioMono)}
                          value={opt.value ?? ""}
                          onChange={(e) => updateChoiceValue(i, e.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                  <p {...stylex.props(styles.studioNote)}>{t(anyLocked ? "fieldCard.choiceValuePublished" : "fieldCard.choiceValueFollows")}</p>
                </details>
              )}
            </>
          )}
        </CardSection>
      )}

      <CardSection heading={t("fieldCard.askedOnHeading")} issues={[]}>
        {asked.length === 0 ? (
          // The empty tone, never the refusal tone: a field no step asks for
          // yet is an unfinished draft, not a broken one. The route opens the
          // form editor for the first step a person works, where this field
          // stands in the palette.
          <div {...stylex.props(styles.emptyState)}>
            <p {...stylex.props(styles.studioEmpty)}>{t("fieldCatalog.usedInEmpty")}</p>
            {routeStepId !== undefined && (
              <button type="button" className="btn btn-secondary" onClick={() => onOpenForm(routeStepId)}>
                {t("fieldCatalog.effectEmptyRoute")}
              </button>
            )}
          </div>
        ) : (
          <>
            <ul {...stylex.props(styles.register)}>
              {asked.map((row) => (
                <li key={row.stepId} {...stylex.props(styles.registerRow)}>
                  <div {...stylex.props(styles.registerMain)}>
                    <span>{row.stepLabel}</span>
                    {row.marks.map((mark) => (
                      <span key={mark}>{t(MARK_KEY[mark])}</span>
                    ))}
                    {row.sentence !== undefined && <span {...stylex.props(styles.registerSentence)}>{row.sentence}</span>}
                  </div>
                  <span {...stylex.props(styles.registerCommands)}>
                    <button type="button" {...commandProps()} onClick={() => onOpenForm(row.stepId)}>
                      {t("fieldCard.openForm")}
                    </button>
                    <button type="button" {...commandProps()} onClick={() => onShowStep(row.stepId)}>
                      {t("fieldCatalog.showOnCanvas")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {/* The catalog declares no `required` key of its own, so this
                writes the view and never the field. A technical field is
                written by the process, so it disables the checkbox. A group
                holds no value, so it takes neither the box nor a condition.
                A disagreement between the steps is a fact, not a conflict:
                the box writes one value to all of them. */}
            {!isGroup && requiredState.kind === "divergent" && (
              <p {...stylex.props(styles.studioNote, styles.studioNoteRuled)}>
                {t("fieldCatalog.requiredDivergentNote").replace("{steps}", stepLabels(requiredState.differingStepIds))}
              </p>
            )}
            {!isGroup && (
              <label {...stylex.props(styles.fieldRowLabel, styles.checkboxLabel)}>
                <input
                  ref={requiredBox}
                  type="checkbox"
                  checked={requiredState.kind === "uniform" && requiredState.value}
                  disabled={requiredDisabled}
                  onChange={(e) => writeRequired(e.target.checked)}
                />
                {t("fieldCard.requiredEverywhere")}
              </label>
            )}
            {!isGroup && technicalChecked && <p {...stylex.props(styles.studioNote)}>{t("fieldCatalog.requiredTechnicalNote")}</p>}

            {!isGroup && visibleState.kind !== "none" && (
              <div {...stylex.props(styles.morePart)}>
                <h5 {...stylex.props(styles.subHeading)}>{t("fieldCatalog.onlyAskWhenHeading")}</h5>
                {visibleState.kind === "divergent" && (
                  <p {...stylex.props(styles.studioWarning)}>
                    {t("fieldCatalog.conditionDivergentNote").replace("{steps}", stepLabels(visibleState.stepIds))}
                  </p>
                )}
                {visibleState.kind === "divergent" && visibleState.literalStepIds.length > 0 && (
                  <p {...stylex.props(styles.studioWarning)}>
                    {t("fieldCatalog.conditionLiteralNote").replace("{steps}", stepLabels(visibleState.literalStepIds))}
                  </p>
                )}
                <ConditionInput
                  value={visibleState.kind === "uniform" ? visibleState.value : undefined}
                  onChange={writeVisible}
                  clearLabel={clearSteps ? clearConditionLabel(clearSteps.map(stepLabel)) : undefined}
                  emptySentence={visibleState.kind === "divergent" ? t("condition.sentence.divergent") : undefined}
                />
              </div>
            )}
          </>
        )}
      </CardSection>

      {/* Every expression that reads the key, placed in the author's words.
          A group holds no value of its own, so it has none. */}
      {!isGroup && (
        <CardSection heading={t("fieldCatalog.readByHeading")} issues={[]}>
          {readBy.length === 0 ? (
            <p {...stylex.props(styles.studioEmpty)}>{t("fieldCatalog.readByEmpty")}</p>
          ) : (
            <ul {...stylex.props(styles.register)}>
              {readBy.map((row, i) => (
                // Rows carry no identity of their own; draft order is theirs.
                <li key={i} {...stylex.props(styles.registerRow)}>
                  <div {...stylex.props(styles.registerMain)}>
                    <span>{row.place}</span>
                    {row.sentence !== undefined && <span {...stylex.props(styles.registerSentence)}>{row.sentence}</span>}
                  </div>
                  {row.target !== undefined && (
                    <span {...stylex.props(styles.registerCommands)}>
                      <button type="button" {...commandProps()} onClick={() => row.target && onOpenPlace(row.target)}>
                        {t("fieldCard.openPlace")}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      )}

      {/* The rail lists a group's children. This section holds one control,
          which adds a field at the group's end and selects it. */}
      {isGroup && (
        <CardSection heading={t("fieldCatalog.groupChildrenHeading")} issues={[]}>
          <button type="button" {...commandProps()} onClick={() => fieldId !== undefined && onAdd(fieldId)}>
            {t("fieldCatalog.addSubField")}
          </button>
        </CardSection>
      )}

      <details
        {...stylex.props(styles.more, styles.sectionRuled)}
        open={moreOpen || moreChecked}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
      >
        <summary {...stylex.props(styles.moreSummary)}>
          <FlaggedHeading as="h4" failed={moreFailed} inline>
            {t("fieldCard.moreHeading")}
          </FlaggedHeading>
        </summary>
        <div {...stylex.props(styles.moreBody)}>
          {/* A column-mapping check on a field the mapping editor no longer
              shows (no source, or no string field) stands on this part, so
              no check goes unshown while More opens for it. */}
          <MorePart heading={t("fieldCatalog.whereValuesHeading")} issues={showsColumnMapping(field, dataSources) ? [] : mappingIssues}>
            <label {...stylex.props(styles.fieldRowLabel)}>
              {t("fieldCatalog.dataSourceLabel")}
              <select
                value={field.dataSource ?? ""}
                disabled={hasOptions}
                onChange={(e) => onChange({ dataSource: e.target.value === "" ? undefined : (e.target.value as DraftField["dataSource"]) })}
              >
                <option value="">{t("fieldCard.noSourceOption")}</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {sourceName(ds)}
                  </option>
                ))}
              </select>
            </label>
            {/* A column mapping writes into other fields, so it stands beside
                the source it reads. Its absence draws no rule of its own. */}
            {showsColumnMapping(field, dataSources) && (
              <MorePart heading={t("columnMapping.heading")} issues={mappingIssues}>
                {columns.length === 0 ? (
                  <p {...stylex.props(styles.studioNote)}>{t("columnMapping.noColumns")}</p>
                ) : (
                  <>
                    {mappingRows.map((row) => (
                      <div {...stylex.props(styles.studioColumnMappingRow)} key={row.column}>
                        <select
                          {...stylex.props(styles.studioColumnMappingRowSelect)}
                          aria-label={t("columnMapping.columnAria")}
                          value={row.column}
                          onChange={(e) => renameMapping(row.column, e.target.value)}
                        >
                          {row.stale && <option value={row.column}>{row.column}</option>}
                          {columns.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true">-&gt;</span>
                        <select aria-label={t("columnMapping.targetAria")} value={row.target} onChange={(e) => setMapping(row.column, e.target.value)}>
                          <option value="">{t("fieldCatalog.noneOption")}</option>
                          {targets.map((f) => (
                            <option key={f.id} value={f.id}>
                              {fieldName(f)}
                            </option>
                          ))}
                        </select>
                        <button type="button" {...commandProps()} onClick={() => removeMapping(row.column)}>
                          {t("columnMapping.removeRow")}
                        </button>
                        {row.stale && <p {...stylex.props(styles.studioWarning, styles.studioWarningInMappingRow)}>{t("columnMapping.staleColumn")}</p>}
                      </div>
                    ))}
                    <button type="button" {...commandProps()} onClick={addMapping} disabled={unmapped === undefined}>
                      {t("columnMapping.addRow")}
                    </button>
                  </>
                )}
              </MorePart>
            )}
          </MorePart>

          <MorePart heading={t("defaultValue.heading")} issues={defaultIssues}>
            <DefaultValueEditor field={field} onChange={(next) => onChange({ default: next })} />
          </MorePart>

          <MorePart heading={t("fieldCatalog.validationHeading")} issues={validationIssues}>
            <FieldValidationEditor field={field} validation={field.validation} onChange={(next) => onChange({ validation: next })} />
          </MorePart>

          <label {...stylex.props(styles.fieldRowLabel, styles.checkboxLabel)}>
            <input type="checkbox" checked={technicalChecked} disabled={isGroup} onChange={(e) => toggleTechnical(e.target.checked)} />
            {t("fieldCard.technicalLabel")}
          </label>

          {fieldId !== undefined && (
            <MoveFieldControl
              fieldId={fieldId}
              fields={draft.fields ?? []}
              contentLocale={contentLocale}
              baseLocale={baseLocale}
              onMoveField={onMoveField}
            />
          )}

          {preview && (
            <details {...stylex.props(styles.fieldPreview)}>
              <summary {...stylex.props(styles.fieldPreviewSummary)}>{t("fieldCatalog.previewHeading")}</summary>
              {previewNote !== undefined && <p {...stylex.props(styles.studioNote)}>{t(previewNote)}</p>}
              {/* Sample controls take no keyboard or pointer interaction: every
                  synthesized entry is already forced `readonly`, and `inert`
                  also takes the whole container out of the tab order and the
                  accessibility tree. */}
              <div {...stylex.props(styles.fieldPreviewBody)} inert>
                <FieldForm fields={preview.fields} values={preview.values} onChange={() => {}} locale={contentLocale} />
              </div>
            </details>
          )}

          <details
            {...stylex.props(styles.studioDevview)}
            open={keyViewOpen || keyChecked}
            onToggle={(e) => setKeyViewOpen(e.currentTarget.open)}
          >
            <summary {...stylex.props(styles.studioDevviewSummary)}>{t("fieldCatalog.developerView")}</summary>
            <FieldKeyInput field={field} notice={keyNotice} onCommitted={noteRewrites} />
            {custom && (
              <PluginEnvelopeEditor
                label={t("fieldCatalog.customTypeLabel")}
                value={field.type as DraftOf<FieldDef>["type"] & object}
                onChange={(type) => onChange({ type })}
              />
            )}
          </details>
        </div>
      </details>

      <div {...stylex.props(styles.removeRow)}>
        <button type="button" id={fieldId === undefined ? undefined : removeControlId(fieldId)} className="btn btn-ghost" onClick={onRemove}>
          {t("fieldCatalog.removeField")}
        </button>
      </div>
    </article>
  );
}

interface Props {
  token: string;
  /** The one field this panel renders, at any nesting depth. `undefined` only
   * while the catalog has no field carrying an id — the screen otherwise keeps
   * it resolved. */
  selectedId: string | undefined;
  onAdd: (groupId?: string) => void;
  /** Remove field's press for the selected field (`EntityTabs.tsx`'s
   * `FieldsTab::requestRemove`), which removes it at once or confirms first. */
  onRemove: (fieldId: string) => void;
  onShowStep: (stepId: string) => void;
  /** Opens the form editor for one step: an Asked on row's "Open the form"
   * and the empty state's route (`studio-app`). */
  onOpenForm: (stepId: string) => void;
  /** A Read by row's "Open" (`FieldsTab::openPlace`, design.md D4). */
  onOpenPlace: (target: ReadByTarget) => void;
  /** The move's one write (`EntityTabs.tsx`'s `FieldsTab::moveField`),
   * forwarded to the card as its own `onMoveField`. */
  onMoveField: (fieldId: string, targetGroupId: string | undefined) => void;
  /** The field whose card opens More by itself (`FieldsTab`'s `openMoreFor`). */
  openMoreFor?: string;
  /** Called once the card opened More for `openMoreFor`. */
  onMoreOpened?: () => void;
}

const NOOP = () => {};

export function FieldCatalogPanel({
  token,
  selectedId,
  onAdd,
  onRemove,
  onShowStep,
  onOpenForm,
  onOpenPlace,
  onMoveField,
  openMoreFor,
  onMoreOpened = NOOP,
}: Props) {
  const { draft, mutate } = useDraft();
  const fields = draft.fields ?? [];
  const dataSources = draft.dataSources ?? [];
  // The same hook `DataSourcesPanel` reads, so the key picker beside this one
  // and the column picker here cannot offer different lists.
  const lists = useDataLists(token);

  const field = selectedId === undefined ? undefined : flattenDraftFields(fields).find((f) => f.id === selectedId);

  const routeStepId = firstWorkedStepId(draft);

  const updateField = (patch: Partial<DraftField>) => {
    const fieldId = field?.id;
    if (fieldId === undefined) return;
    updateInDraftArray(mutate, (d) => flattenDraftFields(d.fields).find((f) => f.id === fieldId), patch);
  };

  // The start state replaces the card, since it has no field to describe. It
  // takes the empty tone: a draft with no field yet is a new draft, not a
  // broken one. Its control is the same call the rail's Add entry makes, so
  // the two cannot mint different fields.
  if (field === undefined) {
    return (
      <div {...stylex.props(styles.card)}>
        <h3 {...stylex.props(styles.panelHeading)}>{t("fieldCatalog.heading")}</h3>
        <div {...stylex.props(styles.emptyState, styles.startState)}>
          <h4 {...stylex.props(styles.fieldCatalogStartHeading)}>{t("fieldCatalog.startHeading")}</h4>
          <p {...stylex.props(styles.studioEmpty, styles.fieldCatalogStartBody)}>{t("fieldCatalog.startBody")}</p>
          <button type="button" id={ADD_FIRST_FIELD_ID} className="btn btn-primary" onClick={() => onAdd()}>
            {t("fieldCatalog.addFirstField")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Keyed on the field: a field switch resets everything the card holds
          in component state, each builder's incomplete row and the Developer
          view's half-typed config, the same way the selection change already
          resets the rest. */}
      <FieldEditor
        key={field.id}
        field={field}
        dataSources={dataSources}
        lists={lists}
        routeStepId={routeStepId}
        onChange={updateField}
        onRemove={() => {
          if (field.id === undefined) return;
          onRemove(field.id);
        }}
        onShowStep={onShowStep}
        onOpenForm={onOpenForm}
        onOpenPlace={onOpenPlace}
        onMoveField={onMoveField}
        onAdd={onAdd}
        openMore={openMoreFor !== undefined && openMoreFor === field.id}
        onMoreOpened={onMoreOpened}
      />
      <button type="button" className="btn btn-secondary" onClick={() => onAdd()}>
        {t("fieldCatalog.addField")}
      </button>
    </>
  );
}

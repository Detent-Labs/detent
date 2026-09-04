import { Fragment, useEffect, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { FIELD_KINDS, fieldKindOf, type DataSourceDef, type Expression, type FieldDef, type FieldKindName, type FieldOption } from "workflow-engine/schema";
import { FieldForm } from "form-ui";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { DraftOf } from "../draft/types";
import { useDraft, type Mutate } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { removeAt, updateAt } from "../draft/list-ops";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useDataLists } from "./shared/useDataLists.js";
import { columnMappingRows, declaredColumns, mappableTargets, showsColumnMapping } from "./columnMappingLogic.js";
import type { StudioDataList } from "../api/types.js";
import { IssueItems, IssueList } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { FieldValidationEditor } from "./shared/FieldValidationEditor";
import { DefaultValueEditor } from "./shared/DefaultValueEditor";
import { fieldLocaleGaps, missingTranslationWarning, resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { draftFields } from "../draft/fields";
import { droppedByKindChange, nextFieldKey } from "./fieldCatalogLogic.js";
import { fieldCheckZone, type FieldCheckZone } from "./fieldCheckZone.js";
import { fieldKindLabel } from "../draft/field-type-labels";
import {
  applyRequiredOverride,
  applyTechnicalMarker,
  applyVisibleOverride,
  countTechnicalClearKeys,
  fieldRequiredOverrides,
  fieldUsage,
  fieldVisibleOverrides,
  type FieldUsageRow,
  needsTechnicalToggleConfirm,
} from "../draft/field-usage";
import { previewViewFields } from "../draft/field-preview";
import { ConditionInput } from "./shared/ConditionInput";
import type { EditorIssue } from "../draft/issues";

type DraftField = DraftOf<FieldDef>;
type DraftDataSource = DraftOf<DataSourceDef>;
type DraftOption = DraftOf<FieldOption>;

/** Below this width the two halves fall under one another, in the reading
 * order the design states: definition, then effect. `PanelsScreen` stacks
 * its index rail at the same width, so the whole screen turns at once. */
const NARROW = "@media (max-width: 64rem)";

/** The one motion the two halves carry (task 8.1). A write in the definition
 * half tints the steps that write reached, so the author sees the connection
 * between the halves rather than having to infer it. It fades out on its
 * own: the tint is a pointer, not a state, and a state would still be on
 * screen after the next change. The accent at low mix, so the row reads as
 * touched, never as wrong — the refusal tone belongs to a check. */
const usageTint = stylex.keyframes({
  from: { backgroundColor: `color-mix(in srgb, ${colors.accent} 18%, transparent)` },
  to: { backgroundColor: "transparent" },
});

/** Every style this file's own markup renders. `fieldRow`, `panelHeading`
 * and `fieldRowLabel` each duplicate a shape `panels/DataSourcesPanel.tsx`
 * compiles for itself; each file owns its half. */
const styles = stylex.create({
  panelHeading: {
    marginBlockEnd: space.s3,
    marginBlockStart: 0,
    marginInline: 0,
    paddingBottom: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  fieldRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
  },
  // A field's own label: the label above its control, both flush left.
  // Direct children of a `fieldRow` or a zone alone; the shared editors
  // nest their own labels deeper and keep whatever they carry.
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
  // The one row the design language calls out by name: three controls (a
  // value, a label, remove) on one line. It wraps rather than overflowing
  // (task 8.2): measured at 1280px, the two halves give each zone 486px and
  // this row's three children asked for 530. A German label takes the
  // Remove button wider still, so the line has to be allowed to break.
  optionRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
  },
  // `minWidth: 0` overrides an input's own intrinsic minimum, which flex
  // otherwise honours, so the two inputs shrink with the row.
  optionRowInput: {
    flex: "1 1 8rem",
    minWidth: 0,
  },
  // The usage list: hairline-divided register rows, flush left, the same
  // rule the index rail's own rows take.
  usageList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    width: "100%",
  },
  // Wraps for the same reason `optionRow` does: the row's own control
  // carries a sentence, and its German reading is longer than its English
  // one.
  usageListItem: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s1,
    paddingInline: 0,
  },
  // A keyframe animation, not a transition: the row remounts on each write,
  // and only an animation runs from the top on mount. Off under reduced
  // motion.
  usageListItemTinted: {
    animationName: { default: usageTint, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.2s",
    animationTimingFunction: "ease-out",
  },
  usageListItemLabel: {
    flex: "1 1 8rem",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // The preview is a native `<details>`: the browser tracks open/closed as
  // DOM state, so no component state exists for it. Closed by default via
  // the markup's own absent `open` attribute.
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
  // The Fields view's two halves: what the field is, then where it acts
  // (design.md, the chosen direction). With the index rail beside them the
  // screen reads as three upright regions — list, definition, effect.
  //
  // `1fr 1fr` and no fixed width anywhere: a German heading runs up to forty
  // percent longer than its English one, and a column measured off the
  // English label clips it. `minmax(0, 1fr)` lets a long word wrap instead
  // of pushing the track wider than its share. Below the breakpoint the
  // halves stack, and the source order alone gives the reading order.
  fieldCatalogHalves: {
    display: "grid",
    width: "100%",
    gridTemplateColumns: { default: "minmax(0, 1fr) minmax(0, 1fr)", [NARROW]: "minmax(0, 1fr)" },
    gap: space.s4,
    alignItems: "start",
  },
  // The 2px rule between the halves is the structural weight, the same one
  // the panels screen header draws: the halves are two major sections of
  // one screen, not two rows of a register. Stacked, that rule is a top
  // edge, not a left one.
  fieldCatalogHalfSecond: {
    paddingLeft: { default: space.s4, [NARROW]: 0 },
    paddingTop: { default: 0, [NARROW]: space.s4 },
    borderLeftWidth: { default: 2, [NARROW]: 0 },
    borderLeftStyle: "solid",
    borderLeftColor: colors.divider,
    borderTopWidth: { default: 0, [NARROW]: 2 },
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  fieldZone: {
    width: "100%",
  },
  // Every zone but the first in its half: a 2px structural rule separates it
  // from the zone before it. No rule renders above the first zone, and none
  // renders after a zone that does not mount, so a Column mapping zone the
  // field does not earn leaves its neighbour's edge alone.
  fieldZoneBordered: {
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    marginTop: space.s3,
    paddingTop: space.s3,
  },
  fieldZoneHeading: {
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
    fontSize: "0.9rem",
    fontWeight: 800,
  },
  // A zone holding a check takes the refusal tone at its own heading, so an
  // author scanning the two halves sees which zone is wrong with nothing to
  // open.
  fieldZoneHeadingFailed: {
    color: colors.refusal,
  },
  // The check list inside a zone: flush left, no marker, the refusal tone
  // the heading above it takes. Handed to `IssueItems`, so the checks rail's
  // own list keeps whatever it has.
  zoneIssueList: {
    listStyle: "none",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
    padding: 0,
    width: "100%",
    color: colors.refusal,
    fontSize: "0.9rem",
  },
  // Remove field: below the same structural rule, de-emphasized (`.btn-ghost`)
  // rather than one more `.btn-secondary` in the stack above it — it reads as
  // the definition half's least frequent action.
  fieldHalfRemove: {
    width: "100%",
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    marginTop: space.s3,
    paddingTop: space.s3,
  },
  // The effect half's empty state and the empty catalog's start state. Both
  // say why they are empty and offer the way on, and both take the empty
  // tone — neither is a failure.
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s2,
  },
  studioEmpty: {
    color: colors.textMuted,
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
  // one measure. The surrounding flex column already spaces it.
  fieldCatalogStartBody: {
    maxWidth: "60ch",
    padding: 0,
  },
  studioColumnMapping: {
    marginTop: space.s3,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    paddingTop: space.s2,
  },
  studioColumnMappingHeading: {
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
    fontSize: 11,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.textMuted,
  },
  studioColumnMappingRow: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flexWrap: "wrap",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  studioColumnMappingRowSelect: {
    fontFamily: fonts.mono,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.accent400,
    paddingLeft: space.s2,
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
  studioDevview: {
    marginBlock: space.s2,
    marginInline: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s1,
    paddingInline: space.s2,
  },
  studioDevviewSummary: {
    cursor: "pointer",
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
  },
});

/** The picker's own value for the plugin envelope — a kind name the engine's
 * table never carries, so it cannot collide with one. */
const CUSTOM_KIND = "__custom__";
const KIND_NAMES = Object.keys(FIELD_KINDS) as FieldKindName[];

function isCustomType(type: DraftField["type"]): type is DraftOf<FieldDef>["type"] & object {
  return typeof type === "object" && type !== null;
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
 * The one picker that says what kind of field this is, at both editing
 * sites. It reads the engine package's own `FIELD_KINDS` table over the
 * exports map, so the studio declares no second table to drift from it.
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
      {kind !== undefined && <p {...stylex.props(styles.studioNote)}>{fieldKindLabel(kind).note}</p>}
    </>
  );
}

interface SubFieldRowProps {
  field: DraftField;
  dataSources: DraftDataSource[];
  /** `undefined` until the fetch resolves, and after a failed one. */
  lists: StudioDataList[] | undefined;
  /** Threaded from the caller's own `useDraft()`, for the Technical checkbox's
   * `mutate`-recipe write — `onChange`'s `Object.assign` patch cannot delete a
   * key (`view-flags.ts:34-41`). */
  mutate: Mutate;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}

/**
 * A group field's own child, and any of ITS children in turn — the flat,
 * recursive field row this whole panel used before the two halves. It draws
 * no halves of its own, so nesting a child inside the selected field never
 * nests a second definition half inside the first.
 *
 * It keeps its own check list (`IssueList` below). A child row is not the
 * selected field, and the halves' zones describe the selected field alone.
 */
function SubFieldRow({ field, dataSources, lists, mutate, onChange, onRemove }: SubFieldRowProps) {
  const { draft, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  /** Deduped against the whole catalog, not just this group's own children
   * (design.md: `FieldDef.key` is one flat CEL namespace regardless of
   * nesting depth). */
  const updateLabel = (label: DraftField["label"]) => {
    const taken = new Set(draftFields(draft).filter((f) => f.id !== field.id).map((f) => f.key ?? ""));
    const derivedKey = nextFieldKey(field.key ?? "", field.label, label, baseLocale, taken);
    onChange(derivedKey === undefined ? { label } : { label, key: derivedKey });
  };
  const custom = isCustomType(field.type);
  const hasOptions = (field.options?.length ?? 0) > 0;
  const hasDataSource = field.dataSource !== undefined;
  const isGroup = field.type === "group";
  const fieldId = field.id;
  const technicalChecked = field.technical === true;
  const toggleTechnical = (next: boolean) => {
    if (fieldId === undefined) return;
    const clearCount = countTechnicalClearKeys(draft, fieldId);
    if (needsTechnicalToggleConfirm(next, clearCount) && !confirm(t("fieldCatalog.technicalClearConfirm").replace("{count}", String(clearCount)))) return;
    mutate((d) => applyTechnicalMarker(d, fieldId, next));
  };

  const setOptions = (options: DraftOption[]) => onChange({ options, dataSource: options.length > 0 ? undefined : field.dataSource });

  const mappingRows = columnMappingRows(field, dataSources, lists);
  const columns = declaredColumns(field, dataSources, lists);
  const targets = mappableTargets(field, draft.fields ?? []);
  /** The first declared column no row holds yet, or `undefined` when every one is mapped. */
  const unmapped = columns.find((c) => !mappingRows.some((r) => r.column === c));

  /**
   * Writes the mapping back, or drops the key entirely when the result is
   * empty. An empty object is not the same as no mapping: the schema reads
   * `columnMapping` as optional, and a body carrying `{}` says an author meant
   * something they did not.
   */
  const writeMapping = (next: Record<string, string>) =>
    onChange({ columnMapping: (Object.keys(next).length === 0 ? undefined : next) as DraftField["columnMapping"] });

  const setMapping = (column: string, target: string) => {
    const next = { ...((field.columnMapping ?? {}) as Record<string, string>) };
    next[column] = target;
    writeMapping(next);
  };

  // Rebuilt rather than patched in place, so the row keeps its position: a
  // delete-then-add would send the renamed key to the end of the list.
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

  const addOption = () => setOptions([...(field.options ?? []), { value: "", label: seedLocalizedText(contentLocale) }]);
  const updateOption = (i: number, patch: Partial<DraftOption>) => setOptions(updateAt(field.options ?? [], i, patch));
  const removeOption = (i: number) => setOptions(removeAt(field.options ?? [], i));

  const addSubField = () =>
    onChange({ fields: [...(field.fields ?? []), { id: mintId("field"), key: "", label: seedLocalizedText(contentLocale), type: "string" }] });
  const updateSubField = (i: number, patch: Partial<DraftField>) => onChange({ fields: updateAt(field.fields ?? [], i, patch) });
  const removeSubField = (i: number) => onChange({ fields: removeAt(field.fields ?? [], i) });

  return (
    // The anchor the shared modal's rail scrolls to. Recursive, so a nested
    // group child carries its own id and the rail reaches it too.
    <div {...stylex.props(styles.fieldRow)} id={field.id === undefined ? undefined : `field-row-${field.id}`}>
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.keyLabel")}
        <input
          type="text"
          {...stylex.props(styles.studioMono)}
          value={field.key ?? ""}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </label>
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.labelLabel")}
        <LocalizedTextInput value={field.label} onChange={updateLabel} />
      </label>
      {/* Sibling of the label, never nested inside it: a <label> takes
          phrasing content, and the design language keeps a field's own
          messages beside the label. */}
      {missingTranslationWarning(field.label, contentLocale, draft.baseLocale) && (
        <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(field.label, contentLocale, draft.baseLocale)}</p>
      )}
      <label {...stylex.props(styles.fieldRowLabel)}>
        {t("fieldCatalog.descriptionLabel")}
        <LocalizedTextInput value={field.description} onChange={(description) => onChange({ description })} />
      </label>
      {missingTranslationWarning(field.description, contentLocale, draft.baseLocale) && (
        <p {...stylex.props(styles.studioWarning)}>
          {missingTranslationWarning(field.description, contentLocale, draft.baseLocale)}
        </p>
      )}
      <KindPicker field={field} onChange={onChange} />
      <label {...stylex.props(styles.fieldRowLabel, styles.checkboxLabel)}>
        {t("fieldCatalog.technicalLabel")}
        <input
          type="checkbox"
          checked={technicalChecked}
          disabled={isGroup}
          onChange={(e) => toggleTechnical(e.target.checked)}
        />
      </label>

      {custom && (
        <details {...stylex.props(styles.studioDevview)}>
          <summary {...stylex.props(styles.studioDevviewSummary)}>{t("fieldCatalog.developerView")}</summary>
          <PluginEnvelopeEditor
            label={t("fieldCatalog.customTypeLabel")}
            value={field.type as DraftOf<FieldDef>["type"] & object}
            onChange={(type) => onChange({ type })}
          />
        </details>
      )}

      <fieldset>
        <legend>{t("fieldCatalog.optionsLegend")}</legend>
        <label>
          {t("fieldCatalog.dataSourceLabel")}
          <select
            value={field.dataSource ?? ""}
            disabled={hasOptions}
            onChange={(e) => onChange({ dataSource: e.target.value === "" ? undefined : (e.target.value as DraftField["dataSource"]) })}
          >
            <option value="">{t("fieldCatalog.noneOption")}</option>
            {dataSources.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.key ?? ds.id}
              </option>
            ))}
          </select>
        </label>
        <div className="options-editor">
          {(field.options ?? []).map((opt, i) => {
            // Under the row, not inside it: `.option-row` lays its three
            // controls out on one line, and a <p> between them would break
            // the line in half.
            const optionWarning = missingTranslationWarning(opt.label, contentLocale, draft.baseLocale);
            return (
              <Fragment key={i}>
                <div {...stylex.props(styles.optionRow)}>
                  <input
                    type="text"
                    {...stylex.props(styles.optionRowInput)}
                    placeholder={t("fieldCatalog.optionValuePlaceholder")}
                    disabled={hasDataSource}
                    value={opt.value ?? ""}
                    onChange={(e) => updateOption(i, { value: e.target.value })}
                  />
                  <LocalizedTextInput
                    {...stylex.props(styles.optionRowInput)}
                    placeholder={t("fieldCatalog.optionLabelPlaceholder")}
                    disabled={hasDataSource}
                    value={opt.label}
                    onChange={(label) => updateOption(i, { label })}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => removeOption(i)}>
                    {t("fieldCatalog.removeOption")}
                  </button>
                </div>
                {optionWarning && <p {...stylex.props(styles.studioWarning)}>{optionWarning}</p>}
              </Fragment>
            );
          })}
          <button type="button" className="btn btn-secondary" onClick={addOption} disabled={hasDataSource}>
            {t("fieldCatalog.addOption")}
          </button>
        </div>

        {/* The mapping sits under the source that feeds it: the fieldset above
            groups where a field's choices come from, and this answers what a
            chosen row then writes. Hidden where a mapping cannot publish, and
            hiding it never deletes what the field already carries. */}
        {showsColumnMapping(field, dataSources) && (
          <div {...stylex.props(styles.studioColumnMapping)}>
            <p {...stylex.props(styles.studioColumnMappingHeading)}>{t("columnMapping.heading")}</p>
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
                      {/* A stale key is not among the declared ones, so it needs
                          its own entry to stay selected and visible. */}
                      {row.stale && <option value={row.column}>{row.column}</option>}
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden="true">-&gt;</span>
                    <select
                      {...stylex.props(styles.studioColumnMappingRowSelect)}
                      aria-label={t("columnMapping.targetAria")}
                      value={row.target}
                      onChange={(e) => setMapping(row.column, e.target.value)}
                    >
                      <option value="">{t("fieldCatalog.noneOption")}</option>
                      {targets.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.key === "" || f.key === undefined ? f.id : f.key}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn btn-secondary" onClick={() => removeMapping(row.column)}>
                      {t("columnMapping.removeRow")}
                    </button>
                    {row.stale && <p {...stylex.props(styles.studioWarning, styles.studioWarningInMappingRow)}>{t("columnMapping.staleColumn")}</p>}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" onClick={addMapping} disabled={unmapped === undefined}>
                  {t("columnMapping.addRow")}
                </button>
              </>
            )}
          </div>
        )}
      </fieldset>

      <FieldValidationEditor field={field} validation={field.validation} onChange={(validation) => onChange({ validation })} />

      {field.type === "group" && (
        <fieldset>
          <legend>{t("fieldCatalog.subFieldsLegend")}</legend>
          {(field.fields ?? []).map((sub, i) => (
            <SubFieldRow
              key={sub.id ?? i}
              field={sub}
              dataSources={dataSources}
              lists={lists}
              mutate={mutate}
              onChange={(patch) => updateSubField(i, patch)}
              onRemove={() => removeSubField(i)}
            />
          ))}
          <button type="button" className="btn btn-secondary" onClick={addSubField}>
            {t("fieldCatalog.addSubField")}
          </button>
        </fieldset>
      )}

      <IssueList entityId={field.id} />

      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t("fieldCatalog.removeField")}
      </button>
    </div>
  );
}

function usageStepLabel(usage: FieldUsageRow[], stepId: string): string {
  const label = usage.find((u) => u.stepId === stepId)?.stepLabel;
  return label && label !== "" ? label : t("steps.unnamedStep");
}

/**
 * One zone of either half: a heading, the checks that zone owns, then the
 * controls. The heading takes the refusal tone while the zone holds a check,
 * so an author scanning the halves sees which zone is wrong with nothing to
 * open.
 */
function Zone({
  heading,
  issues,
  bordered = false,
  children,
}: {
  heading: string;
  issues: EditorIssue[];
  /** Every zone but the first in its half: the 2px rule against the zone
   * before it. The first zone in a half carries none. */
  bordered?: boolean;
  children: ReactNode;
}) {
  const failed = issues.length > 0;
  return (
    <div {...stylex.props(styles.fieldZone, bordered && styles.fieldZoneBordered)}>
      <h4 {...stylex.props(styles.fieldZoneHeading, failed && styles.fieldZoneHeadingFailed)} data-checked={failed ? "failed" : undefined}>
        {heading}
      </h4>
      <IssueItems issues={issues} style={styles.zoneIssueList} />
      {children}
    </div>
  );
}

interface FieldEditorProps {
  field: DraftField;
  dataSources: DraftDataSource[];
  lists: StudioDataList[] | undefined;
  /** The rail row a click most recently named — the selected top-level
   * field's own id, or one of its children's. Undefined outside a rail
   * click (a reload, an Add). Drives the scroll effect below; it is not
   * cleared after use, and re-focusing the same row twice in a row is a
   * harmless no-op the second time. */
  focusFieldId: string | undefined;
  /** The step the effect half's empty state routes to — the draft's initial
   * step, or `undefined` while the workflow carries no step to reach. */
  routeStepId: string | undefined;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
  onShowStep: (stepId: string) => void;
}

/**
 * The editor for the SELECTED TOP-LEVEL field alone, in two halves under one
 * heading: what the field is, then where it acts in the process. Neither half
 * sits behind a disclosure, and the view carries no tab set.
 *
 * Every zone stays mounted while the field stays selected. Each builder holds
 * an incomplete row the draft does not carry, and the developer view holds a
 * half-typed config in component state; unmounting would drop both.
 *
 * A group field's children render inside the definition half through the flat
 * `SubFieldRow` — never through this component recursively, so one pair of
 * halves exists per open editor.
 */
function FieldEditor({
  field,
  dataSources,
  lists,
  focusFieldId,
  routeStepId,
  onChange: writeField,
  onRemove,
  onShowStep,
}: FieldEditorProps) {
  const { draft, mutate, contentLocale, validation } = useDraft();

  // How many times the definition half has been written since this field was
  // selected. It rides in the usage rows' React key, so each write remounts
  // them and the tint animation runs again — a data attribute alone cannot
  // restart a running animation.
  const [definitionWrites, setDefinitionWrites] = useState(0);

  /**
   * Every write the DEFINITION half makes. It bumps the counter above, so the
   * effect half's usage rows tint and the author sees which steps the change
   * reached (`studio-app`: a change in the definition half tints the affected
   * row in the effect half).
   *
   * The effect half's own writes bypass it. The column mapping calls
   * `writeField` directly below, and the condition and requiredness controls
   * write step views through `mutate`. A row must not tint at its own
   * keystroke, only at the definition's.
   */
  const onChange = (patch: Partial<DraftField>) => {
    setDefinitionWrites((n) => n + 1);
    writeField(patch);
  };

  // A rail click on a group's child scrolls to that child's own
  // `field-row-<id>` anchor, which sits inside `SubFieldRow` in the
  // definition half. Nothing hides it any more, so this needs no tab switch
  // ahead of it. A stale `focusFieldId` naming a since-removed row finds
  // nothing and is a no-op.
  useEffect(() => {
    if (focusFieldId === undefined) return;
    document.getElementById(`field-row-${focusFieldId}`)?.scrollIntoView({ block: "start" });
  }, [focusFieldId]);

  const custom = isCustomType(field.type);
  const hasOptions = (field.options?.length ?? 0) > 0;
  const hasDataSource = field.dataSource !== undefined;

  const setOptions = (options: DraftOption[]) => onChange({ options, dataSource: options.length > 0 ? undefined : field.dataSource });

  const mappingRows = columnMappingRows(field, dataSources, lists);
  const columns = declaredColumns(field, dataSources, lists);
  const targets = mappableTargets(field, draft.fields ?? []);
  const unmapped = columns.find((c) => !mappingRows.some((r) => r.column === c));

  // `writeField`, not `onChange`: a column mapping sits in the effect half, so
  // its own edit must not tint the usage rows beside it.
  const writeMapping = (next: Record<string, string>) =>
    writeField({ columnMapping: (Object.keys(next).length === 0 ? undefined : next) as DraftField["columnMapping"] });

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

  const addOption = () => setOptions([...(field.options ?? []), { value: "", label: seedLocalizedText(contentLocale) }]);
  const updateOption = (i: number, patch: Partial<DraftOption>) => setOptions(updateAt(field.options ?? [], i, patch));
  const removeOption = (i: number) => setOptions(removeAt(field.options ?? [], i));

  const addSubField = () =>
    onChange({ fields: [...(field.fields ?? []), { id: mintId("field"), key: "", label: seedLocalizedText(contentLocale), type: "string" }] });
  const updateSubField = (i: number, patch: Partial<DraftField>) => onChange({ fields: updateAt(field.fields ?? [], i, patch) });
  const removeSubField = (i: number) => onChange({ fields: removeAt(field.fields ?? [], i) });

  const baseLocale = draft.baseLocale ?? "en";
  const fieldId = field.id;
  /** Deduped against the whole catalog, including every group's nested
   * children (design.md: `FieldDef.key` is one flat CEL namespace). */
  const updateLabel = (label: DraftField["label"]) => {
    const taken = new Set(draftFields(draft).filter((f) => f.id !== field.id).map((f) => f.key ?? ""));
    const derivedKey = nextFieldKey(field.key ?? "", field.label, label, baseLocale, taken);
    onChange(derivedKey === undefined ? { label } : { label, key: derivedKey });
  };
  const usage = fieldId ? fieldUsage(draft, fieldId, contentLocale, baseLocale) : [];
  const visibleState = fieldId ? fieldVisibleOverrides(draft, fieldId) : ({ kind: "none" } as const);
  const requiredState = fieldId ? fieldRequiredOverrides(draft, fieldId) : ({ kind: "none" } as const);
  const preview = previewViewFields(field, contentLocale, baseLocale);
  // Two fields preview with no option list, and the row names which one. A
  // bare person field declares no data source, so it takes its own wording
  // rather than the data-source string (design.md Decision 8).
  const previewNote: CatalogKey | undefined =
    field.dataSource !== undefined
      ? "fieldCatalog.previewResolvesAtRuntime"
      : field.format === "person" && (field.options ?? []).length === 0
        ? "fieldCatalog.previewPersonResolvesAtRuntime"
        : undefined;

  const writeVisible = (next: DraftOf<Expression> | undefined) => {
    if (fieldId === undefined) return;
    mutate((d) => applyVisibleOverride(d, fieldId, next));
  };

  const isGroup = field.type === "group";
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

  // Each zone owns the checks whose `loc` names it; a `loc` naming no zone
  // this view draws stands at the top of the definition half, so no check
  // goes unshown for want of a matching zone.
  const fieldIssues = validation.issues.filter((i) => i.entityId === fieldId);
  const zoned = (zone: FieldCheckZone) => fieldIssues.filter((i) => fieldCheckZone(i.loc) === zone);
  const unplaced = fieldIssues.filter((i) => fieldCheckZone(i.loc) === undefined);

  const requiredDisabled = technicalChecked || requiredState.kind === "none";

  return (
    <div {...stylex.props(styles.fieldRow)} id={field.id === undefined ? undefined : `field-row-${field.id}`}>
      <div {...stylex.props(styles.fieldCatalogHalves)}>
        <section aria-label={t("fieldCatalog.definitionHalfLabel")}>
          <IssueItems issues={unplaced} style={styles.zoneIssueList} />

          <Zone heading={t("fieldCatalog.whatAsksHeading")} issues={zoned("asks")}>
            <div {...stylex.props(styles.fieldLabelRow)}>
              <label {...stylex.props(styles.fieldRowLabel, styles.fieldLabelRowLabel)}>
                {t("fieldCatalog.labelLabel")}
                <LocalizedTextInput value={field.label} onChange={updateLabel} />
              </label>
              {/* Names only the active contentLocale's own gap: the
                  content-locale switcher carries the draft-wide per-locale
                  count. */}
              <span {...stylex.props(styles.fieldTranslationBadge)}>
                {contentLocale === baseLocale
                  ? t("fieldCatalog.baseLocaleMark")
                  : fieldLocaleGaps(field, contentLocale, baseLocale) === 0
                    ? t("fieldCatalog.translationComplete")
                    : t("fieldCatalog.translationGap").replace("{count}", String(fieldLocaleGaps(field, contentLocale, baseLocale)))}
              </span>
            </div>
            {missingTranslationWarning(field.label, contentLocale, draft.baseLocale) && (
              <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(field.label, contentLocale, draft.baseLocale)}</p>
            )}
            <label {...stylex.props(styles.fieldRowLabel)}>
              {t("fieldCatalog.descriptionLabel")}
              <LocalizedTextInput value={field.description} onChange={(description) => onChange({ description })} />
            </label>
            {missingTranslationWarning(field.description, contentLocale, draft.baseLocale) && (
              <p {...stylex.props(styles.studioWarning)}>
                {missingTranslationWarning(field.description, contentLocale, draft.baseLocale)}
              </p>
            )}
            <label {...stylex.props(styles.fieldRowLabel)}>
              {t("fieldCatalog.keyLabel")}
              <input
                type="text"
                {...stylex.props(styles.studioMono)}
                value={field.key ?? ""}
                onChange={(e) => onChange({ key: e.target.value })}
              />
            </label>
          </Zone>

          <Zone heading={t("fieldCatalog.whatKindHeading")} issues={zoned("kind")} bordered>
            <KindPicker field={field} onChange={onChange} />
            <label {...stylex.props(styles.fieldRowLabel, styles.checkboxLabel)}>
              {t("fieldCatalog.technicalLabel")}
              <input
                type="checkbox"
                checked={technicalChecked}
                disabled={isGroup}
                onChange={(e) => toggleTechnical(e.target.checked)}
              />
            </label>
            {custom && (
              <details {...stylex.props(styles.studioDevview)}>
                <summary {...stylex.props(styles.studioDevviewSummary)}>{t("fieldCatalog.developerView")}</summary>
                <PluginEnvelopeEditor
                  label={t("fieldCatalog.customTypeLabel")}
                  value={field.type as DraftOf<FieldDef>["type"] & object}
                  onChange={(type) => onChange({ type })}
                />
              </details>
            )}
          </Zone>

          <Zone heading={t("fieldCatalog.whereValuesHeading")} issues={zoned("values")} bordered>
            <label {...stylex.props(styles.fieldRowLabel)}>
              {t("fieldCatalog.dataSourceLabel")}
              <select
                value={field.dataSource ?? ""}
                disabled={hasOptions}
                onChange={(e) => onChange({ dataSource: e.target.value === "" ? undefined : (e.target.value as DraftField["dataSource"]) })}
              >
                <option value="">{t("fieldCatalog.noneOption")}</option>
                {dataSources.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.key ?? ds.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="options-editor">
              {(field.options ?? []).map((opt, i) => {
                const optionWarning = missingTranslationWarning(opt.label, contentLocale, draft.baseLocale);
                return (
                  <Fragment key={i}>
                    <div {...stylex.props(styles.optionRow)}>
                      <input
                        type="text"
                        {...stylex.props(styles.optionRowInput)}
                        placeholder={t("fieldCatalog.optionValuePlaceholder")}
                        disabled={hasDataSource}
                        value={opt.value ?? ""}
                        onChange={(e) => updateOption(i, { value: e.target.value })}
                      />
                      <LocalizedTextInput
                        {...stylex.props(styles.optionRowInput)}
                        placeholder={t("fieldCatalog.optionLabelPlaceholder")}
                        disabled={hasDataSource}
                        value={opt.label}
                        onChange={(label) => updateOption(i, { label })}
                      />
                      <button type="button" className="btn btn-secondary" onClick={() => removeOption(i)}>
                        {t("fieldCatalog.removeOption")}
                      </button>
                    </div>
                    {optionWarning && <p {...stylex.props(styles.studioWarning)}>{optionWarning}</p>}
                  </Fragment>
                );
              })}
              <button type="button" className="btn btn-secondary" onClick={addOption} disabled={hasDataSource}>
                {t("fieldCatalog.addOption")}
              </button>
            </div>
          </Zone>

          <Zone heading={t("defaultValue.heading")} issues={zoned("default")} bordered>
            <DefaultValueEditor field={field} onChange={(next) => onChange({ default: next })} />
          </Zone>

          <Zone heading={t("fieldCatalog.validationHeading")} issues={zoned("validation")} bordered>
            <FieldValidationEditor field={field} validation={field.validation} onChange={(validation) => onChange({ validation })} />
          </Zone>

          {isGroup && (
            <fieldset>
              <legend>{t("fieldCatalog.groupChildrenHeading")}</legend>
              {(field.fields ?? []).map((sub, i) => (
                <SubFieldRow
                  key={sub.id ?? i}
                  field={sub}
                  dataSources={dataSources}
                  lists={lists}
                  mutate={mutate}
                  onChange={(patch) => updateSubField(i, patch)}
                  onRemove={() => removeSubField(i)}
                />
              ))}
              <button type="button" className="btn btn-secondary" onClick={addSubField}>
                {t("fieldCatalog.addSubField")}
              </button>
            </fieldset>
          )}

          {preview && (
            <details {...stylex.props(styles.fieldPreview)}>
              <summary {...stylex.props(styles.fieldPreviewSummary)}>{t("fieldCatalog.previewHeading")}</summary>
              {previewNote !== undefined && <p {...stylex.props(styles.studioNote)}>{t(previewNote)}</p>}
              {/* Sample controls take no keyboard or pointer interaction — every
                  synthesized entry is already forced `readonly`, and `inert`
                  additionally takes the whole container out of the tab order
                  and the accessibility tree. */}
              <div {...stylex.props(styles.fieldPreviewBody)} inert>
                <FieldForm fields={preview.fields} values={preview.values} onChange={() => {}} locale={contentLocale} />
              </div>
            </details>
          )}

          <div {...stylex.props(styles.fieldHalfRemove)}>
            <button type="button" className="btn btn-ghost" onClick={onRemove}>
              {t("fieldCatalog.removeField")}
            </button>
          </div>
        </section>

        <section {...stylex.props(styles.fieldCatalogHalfSecond)} aria-label={t("fieldCatalog.effectHalfLabel")}>
          <Zone heading={t("fieldCatalog.usedInHeading")} issues={[]}>
            {usage.length === 0 ? (
              // The empty tone, never the refusal tone: a field no step asks
              // for yet is an unfinished draft, not a broken one. The route
              // reaches the canvas on the initial step, which is where an
              // author puts the field on a view.
              <div {...stylex.props(styles.emptyState)}>
                <p {...stylex.props(styles.studioEmpty)}>{t("fieldCatalog.usedInEmpty")}</p>
                {routeStepId !== undefined && (
                  <button type="button" className="btn btn-secondary" onClick={() => onShowStep(routeStepId)}>
                    {t("fieldCatalog.effectEmptyRoute")}
                  </button>
                )}
              </div>
            ) : (
              <ul {...stylex.props(styles.usageList)}>
                {usage.map((row) => (
                  // The key carries the write counter, so a definition change
                  // remounts the row and its tint animation runs from the top.
                  <li
                    key={`${row.stepId}:${definitionWrites}`}
                    {...stylex.props(styles.usageListItem, definitionWrites > 0 && styles.usageListItemTinted)}
                    data-tinted={definitionWrites > 0 ? "true" : undefined}
                  >
                    <span {...stylex.props(styles.usageListItemLabel)}>{row.stepLabel || t("steps.unnamedStep")}</span>
                    <span {...stylex.props(styles.studioMono)}>{row.modes.join(", ")}</span>
                    <button type="button" className="btn btn-secondary" onClick={() => onShowStep(row.stepId)}>
                      {t("fieldCatalog.showOnCanvas")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Zone>

          <Zone heading={t("fieldCatalog.onlyAskWhenHeading")} issues={[]} bordered>
            {visibleState.kind === "none" ? (
              <p {...stylex.props(styles.studioNote)}>{t("fieldCatalog.conditionNoSteps")}</p>
            ) : (
              <>
                <p {...stylex.props(styles.studioNote)}>
                  {t("fieldCatalog.conditionScopeNote").replace(
                    "{steps}",
                    visibleState.stepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                  )}
                </p>
                {visibleState.kind === "divergent" && (
                  <p {...stylex.props(styles.studioWarning)}>
                    {t("fieldCatalog.conditionDivergentNote").replace(
                      "{steps}",
                      visibleState.stepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                    )}
                  </p>
                )}
                {visibleState.kind === "divergent" && visibleState.literalStepIds.length > 0 && (
                  <p {...stylex.props(styles.studioWarning)}>
                    {t("fieldCatalog.conditionLiteralNote").replace(
                      "{steps}",
                      visibleState.literalStepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                    )}
                  </p>
                )}
                <ConditionInput
                  value={visibleState.kind === "uniform" ? visibleState.value : undefined}
                  onChange={writeVisible}
                  toggleVariant="link"
                />
              </>
            )}
          </Zone>

          {/* The catalog declares no `required` key of its own, so this writes
              the view and never the field. Two states disable it: a technical
              field is written by the process, and a field no step view
              references has nothing to write. */}
          <Zone heading={t("fieldCatalog.askForThisHeading")} issues={[]} bordered>
            {requiredState.kind !== "none" && (
              <p {...stylex.props(styles.studioNote)}>
                {t("fieldCatalog.requiredScopeNote").replace(
                  "{steps}",
                  requiredState.stepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                )}
              </p>
            )}
            {requiredState.kind === "divergent" && (
              <p {...stylex.props(styles.studioWarning)}>
                {t("fieldCatalog.requiredDivergentNote").replace(
                  "{steps}",
                  requiredState.differingStepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                )}
              </p>
            )}
            <label {...stylex.props(styles.fieldRowLabel, styles.checkboxLabel)}>
              {t("fieldCatalog.requiredLabel")}
              <input
                type="checkbox"
                checked={requiredState.kind === "uniform" && requiredState.value}
                disabled={requiredDisabled}
                onChange={(e) => writeRequired(e.target.checked)}
              />
            </label>
            {requiredState.kind === "none" && <p {...stylex.props(styles.studioNote)}>{t("fieldCatalog.requiredNoSteps")}</p>}
            {technicalChecked && <p {...stylex.props(styles.studioNote)}>{t("fieldCatalog.requiredTechnicalNote")}</p>}
          </Zone>

          {/* A column mapping writes into other fields, so it is effect, not
              definition. Its absence draws no rule of its own. */}
          {showsColumnMapping(field, dataSources) && (
            <Zone heading={t("columnMapping.heading")} issues={zoned("columnMapping")} bordered>
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
                      <select
                        {...stylex.props(styles.studioColumnMappingRowSelect)}
                        aria-label={t("columnMapping.targetAria")}
                        value={row.target}
                        onChange={(e) => setMapping(row.column, e.target.value)}
                      >
                        <option value="">{t("fieldCatalog.noneOption")}</option>
                        {targets.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.key === "" || f.key === undefined ? f.id : f.key}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-secondary" onClick={() => removeMapping(row.column)}>
                        {t("columnMapping.removeRow")}
                      </button>
                      {row.stale && <p {...stylex.props(styles.studioWarning, styles.studioWarningInMappingRow)}>{t("columnMapping.staleColumn")}</p>}
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary" onClick={addMapping} disabled={unmapped === undefined}>
                    {t("columnMapping.addRow")}
                  </button>
                </>
              )}
            </Zone>
          )}
        </section>
      </div>
    </div>
  );
}

interface Props {
  token: string;
  /** The one top-level field this panel renders. `undefined` only while the
   * catalog holds none at all — the screen otherwise keeps it resolved. */
  selectedId: string | undefined;
  /** The rail row a click most recently named (`PanelsScreen.selectField`'s
   * `deepestId`) — forwarded to `FieldEditor` so a group child's row can
   * scroll to itself, whether or not the selection itself changed. */
  focusFieldId: string | undefined;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onShowStep: (stepId: string) => void;
}

export function FieldCatalogPanel({ token, selectedId, focusFieldId, onAdd, onRemove, onShowStep }: Props) {
  const { draft, mutate, contentLocale } = useDraft();
  const fields = draft.fields ?? [];
  const dataSources = draft.dataSources ?? [];
  // The same hook `DataSourcesPanel` reads, so the key picker beside this one
  // and the column picker here cannot offer different lists.
  const lists = useDataLists(token);

  const index = fields.findIndex((f) => f.id === selectedId);
  const field = index === -1 ? undefined : fields[index];

  const steps = draft.workflow?.steps ?? [];
  const routeStepId = draft.workflow?.initialStep ?? steps[0]?.id;

  const updateField = (patch: Partial<DraftField>) => {
    if (index === -1) return;
    updateInDraftArray(mutate, (d) => d.fields?.[index], patch);
  };

  // The start state replaces both halves, since neither has a field to
  // describe. It takes the empty tone: a draft with no field yet is a new
  // draft, not a broken one. Its control is the same call the rail's Add
  // entry makes, so the two cannot mint different fields.
  if (field === undefined) {
    return (
      <div className="field-catalog-panel">
        <h3 {...stylex.props(styles.panelHeading)}>{t("fieldCatalog.heading")}</h3>
        <div {...stylex.props(styles.emptyState)}>
          <h4 {...stylex.props(styles.fieldCatalogStartHeading)}>{t("fieldCatalog.startHeading")}</h4>
          <p {...stylex.props(styles.studioEmpty, styles.fieldCatalogStartBody)}>{t("fieldCatalog.startBody")}</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            {t("fieldCatalog.addFirstField")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field-catalog-panel">
      {/* The field, not the panel. The screen heading one line above already
          reads "Field catalog", and repeating it left the edited field named
          nowhere as text — its label lives inside an editable input, which no
          heading and no rail row spells out. An author working a 22-field
          catalog had nothing to read back but the selection mark. */}
      <h3 {...stylex.props(styles.panelHeading)}>{resolveDraftLocalizedText(field.label, contentLocale, draft.baseLocale ?? "en") || t("panelsScreen.unnamedField")}</h3>
      {/* Remounts on a field switch: that resets everything the editor holds
          in component state — each builder's incomplete row, the developer
          view's half-typed config — the same way the selection change
          already resets the rest. */}
      <FieldEditor
        key={field.id ?? index}
        field={field}
        dataSources={dataSources}
        lists={lists}
        focusFieldId={focusFieldId}
        routeStepId={routeStepId}
        onChange={updateField}
        onRemove={() => onRemove(index)}
        onShowStep={onShowStep}
      />
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        {t("fieldCatalog.addField")}
      </button>
    </div>
  );
}

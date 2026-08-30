import { Fragment, useEffect, useState } from "react";
import type { BaseFieldType, DataSourceDef, Expression, FieldControl, FieldDef, FieldFormat, FieldOption } from "workflow-engine/schema";
import { FieldForm } from "form-ui";
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
import { IssueList } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { FieldValidationEditor } from "./shared/FieldValidationEditor";
import { DefaultValueEditor } from "./shared/DefaultValueEditor";
import { fieldLocaleGaps, missingTranslationWarning, seedLocalizedText } from "../draft/localized-text";
import { draftFields } from "../draft/fields";
import { allowedForType, droppedByTypeChange, nextFieldKey } from "./fieldCatalogLogic.js";
import { FIELD_CONTROL_LABELS, FIELD_FORMAT_LABELS, FIELD_TYPE_LABELS } from "../draft/field-type-labels";
import {
  applyTechnicalMarker,
  applyVisibleOverride,
  countTechnicalClearKeys,
  fieldUsage,
  fieldVisibleOverrides,
  type FieldUsageRow,
  needsTechnicalToggleConfirm,
} from "../draft/field-usage";
import { previewViewFields } from "../draft/field-preview";
import { ConditionInput } from "./shared/ConditionInput";

type DraftField = DraftOf<FieldDef>;
type DraftDataSource = DraftOf<DataSourceDef>;
type DraftOption = DraftOf<FieldOption>;

const BASE_FIELD_TYPES: BaseFieldType[] = ["string", "number", "boolean", "list", "file", "group"];

function isCustomType(type: DraftField["type"]): type is DraftOf<FieldDef>["type"] & object {
  return typeof type === "object" && type !== null;
}

/**
 * Applies a type switch, dropping a `format` or a `control` the new type
 * refuses and naming that drop before it happens.
 *
 * Leaving the key in place would let the developer publish a body
 * `checkFieldFormatControl` rejects, and neither picker would still offer the
 * refused member, so no control on screen would say why.
 */
function changeType(field: DraftField, raw: string, onChange: (patch: Partial<DraftField>) => void): void {
  const type: DraftField["type"] = raw === "__custom__" ? { type: "", config: {} } : (raw as BaseFieldType);
  const dropped = droppedByTypeChange(field, type);
  if (dropped.length > 0) {
    // One key per whole sentence: a translator reads the sentence, never two
    // halves glued around a key name.
    const message =
      dropped.length === 2
        ? t("fieldCatalog.typeDropsBothConfirm")
        : dropped[0] === "format"
          ? t("fieldCatalog.typeDropsFormatConfirm")
          : t("fieldCatalog.typeDropsControlConfirm");
    if (!confirm(message)) return;
  }
  onChange({
    type,
    ...(dropped.includes("format") ? { format: undefined } : {}),
    ...(dropped.includes("control") ? { control: undefined } : {}),
  });
}

/**
 * The format picker and the control picker, below the type picker at both
 * editing sites. Each offers the selected type's own allowed members, read
 * from the one table the compile pass verdicts against, plus an entry for
 * declaring no member at all.
 *
 * A type whose row allows no member hides that picker outright. An empty
 * picker states nothing, and a `file` field shows neither.
 */
function FormatControlPickers({ field, onChange }: { field: DraftField; onChange: (patch: Partial<DraftField>) => void }) {
  const allowed = allowedForType(field.type);
  const format = field.format;
  const control = field.control;
  return (
    <>
      {allowed.formats.length > 0 && (
        <>
          <label>
            format
            <select
              className="studio-mono"
              value={format ?? ""}
              onChange={(e) => onChange({ format: e.target.value === "" ? undefined : (e.target.value as FieldFormat) })}
            >
              <option value="">{t("fieldCatalog.noneOption")}</option>
              {allowed.formats.map((f) => (
                <option key={f} value={f}>
                  {FIELD_FORMAT_LABELS[f].name}
                </option>
              ))}
            </select>
          </label>
          {format !== undefined && <p className="studio-note">{FIELD_FORMAT_LABELS[format].note}</p>}
        </>
      )}
      {allowed.controls.length > 0 && (
        <>
          <label>
            control
            <select
              className="studio-mono"
              value={control ?? ""}
              onChange={(e) => onChange({ control: e.target.value === "" ? undefined : (e.target.value as FieldControl) })}
            >
              <option value="">{t("fieldCatalog.noneOption")}</option>
              {allowed.controls.map((c) => (
                <option key={c} value={c}>
                  {FIELD_CONTROL_LABELS[c].name}
                </option>
              ))}
            </select>
          </label>
          {control !== undefined && <p className="studio-note">{FIELD_CONTROL_LABELS[control].note}</p>}
        </>
      )}
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
 * A group field's own child, and any of ITS children in turn — unchanged
 * from the single `FieldRow` this whole panel used before the tab set
 * (design.md decision 1). Carries no tab set of its own: `FieldEditor`
 * (below) is recursive-into-flat, not recursive-into-tabbed, so nesting a
 * child inside a tabbed parent never nests a `tablist` inside a `tablist`.
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
  const typeSelectValue = typeof field.type === "object" && field.type !== null ? "__custom__" : (field.type ?? "string");
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
    <div className="field-row" id={field.id === undefined ? undefined : `field-row-${field.id}`}>
      <label>
        key
        <input
          type="text"
          className="studio-mono"
          value={field.key ?? ""}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </label>
      <label>
        label
        <LocalizedTextInput value={field.label} onChange={updateLabel} />
      </label>
      {/* Sibling of the label, never nested inside it: a <label> takes
          phrasing content, and the design language keeps a field's own
          messages beside the label. */}
      {missingTranslationWarning(field.label, contentLocale, draft.baseLocale) && (
        <p className="studio-warning">{missingTranslationWarning(field.label, contentLocale, draft.baseLocale)}</p>
      )}
      <label>
        description
        <LocalizedTextInput value={field.description} onChange={(description) => onChange({ description })} />
      </label>
      {missingTranslationWarning(field.description, contentLocale, draft.baseLocale) && (
        <p className="studio-warning">
          {missingTranslationWarning(field.description, contentLocale, draft.baseLocale)}
        </p>
      )}
      <label>
        type
        <select className="studio-mono" value={typeSelectValue} onChange={(e) => changeType(field, e.target.value, onChange)}>
          {BASE_FIELD_TYPES.map((bft) => (
            <option key={bft} value={bft}>
              {bft}
            </option>
          ))}
          <option value="__custom__">{t("fieldCatalog.customTypeOption")}</option>
        </select>
      </label>
      <FormatControlPickers field={field} onChange={onChange} />
      <label className="studio-field-technical">
        {t("fieldCatalog.technicalLabel")}
        <input
          type="checkbox"
          checked={technicalChecked}
          disabled={isGroup}
          onChange={(e) => toggleTechnical(e.target.checked)}
        />
      </label>

      {custom && (
        <details className="studio-devview">
          <summary>{t("fieldCatalog.developerView")}</summary>
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
          dataSource
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
                <div className="option-row">
                  <input
                    type="text"
                    placeholder={t("fieldCatalog.optionValuePlaceholder")}
                    disabled={hasDataSource}
                    value={opt.value ?? ""}
                    onChange={(e) => updateOption(i, { value: e.target.value })}
                  />
                  <LocalizedTextInput
                    placeholder={t("fieldCatalog.optionLabelPlaceholder")}
                    disabled={hasDataSource}
                    value={opt.label}
                    onChange={(label) => updateOption(i, { label })}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => removeOption(i)}>
                    {t("fieldCatalog.removeOption")}
                  </button>
                </div>
                {optionWarning && <p className="studio-warning">{optionWarning}</p>}
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
          <div className="studio-column-mapping">
            <p className="studio-column-mapping-heading">{t("columnMapping.heading")}</p>
            {columns.length === 0 ? (
              <p className="studio-note">{t("columnMapping.noColumns")}</p>
            ) : (
              <>
                {mappingRows.map((row) => (
                  <div className="studio-column-mapping-row" key={row.column}>
                    <select
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
                    {row.stale && <p className="studio-warning">{t("columnMapping.staleColumn")}</p>}
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

type FieldTab = "field" | "values" | "rules";
const FIELD_TABS: FieldTab[] = ["field", "values", "rules"];
const TAB_LABEL: Record<FieldTab, CatalogKey> = {
  field: "fieldCatalog.tabField",
  values: "fieldCatalog.tabValues",
  rules: "fieldCatalog.tabRules",
};

function usageStepLabel(usage: FieldUsageRow[], stepId: string): string {
  const label = usage.find((u) => u.stepId === stepId)?.stepLabel;
  return label && label !== "" ? label : t("steps.unnamedStep");
}

interface FieldEditorProps {
  field: DraftField;
  dataSources: DraftDataSource[];
  lists: StudioDataList[] | undefined;
  /** The rail row a click most recently named — the selected top-level
   * field's own id, or one of its children's. Undefined outside a rail
   * click (a reload, an Add). Drives the scroll-and-switch effect below;
   * it is not cleared after use; re-focusing the same row twice in a row
   * is a harmless no-op the second time. */
  focusFieldId: string | undefined;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
  onShowStep: (stepId: string) => void;
}

/**
 * The tabbed editor for the SELECTED TOP-LEVEL field alone (design.md
 * decision 1): Field / Values / Rules, with the field's own `IssueList`
 * above the tab set so an issue stays visible on every tab. All three panels
 * stay mounted, and the two inactive ones carry `hidden` — the developer
 * view's half-typed config and each builder's incomplete row live in
 * component state, not the draft, and would drop on unmount.
 *
 * A group field's children render inside the Field tab through the
 * unchanged, flat `SubFieldRow` — never through this component recursively,
 * so one `tablist` exists per open editor, never one per nested field.
 */
function FieldEditor({ field, dataSources, lists, focusFieldId, onChange, onRemove, onShowStep }: FieldEditorProps) {
  const { draft, mutate, contentLocale } = useDraft();
  const [activeTab, setActiveTab] = useState<FieldTab>("field");

  // A rail click on a group's child (`focusFieldId !== field.id`) needs the
  // Field tab active before the scroll below can find anything visible: the
  // child's `field-row-<id>` anchor sits inside SubFieldRow, mounted only in
  // that tab's panel (task 3.4). A click on the field's own top-level row
  // (`focusFieldId === field.id`) still passes through here harmlessly —
  // that row's own anchor sits on the outer wrapper below, outside every
  // tab panel, so switching tabs for it is a no-op past the first render.
  useEffect(() => {
    if (focusFieldId !== undefined) setActiveTab("field");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFieldId]);

  // Runs after the effect above has committed `activeTab: "field"`, so the
  // target is unhidden by the time this reads its position. A stale
  // `focusFieldId` naming a since-removed row finds nothing and is a no-op.
  useEffect(() => {
    if (focusFieldId === undefined || activeTab !== "field") return;
    document.getElementById(`field-row-${focusFieldId}`)?.scrollIntoView({ block: "start" });
  }, [focusFieldId, activeTab]);

  const custom = isCustomType(field.type);
  const typeSelectValue = typeof field.type === "object" && field.type !== null ? "__custom__" : (field.type ?? "string");
  const hasOptions = (field.options?.length ?? 0) > 0;
  const hasDataSource = field.dataSource !== undefined;

  const setOptions = (options: DraftOption[]) => onChange({ options, dataSource: options.length > 0 ? undefined : field.dataSource });

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

  return (
    <div className="field-row" id={field.id === undefined ? undefined : `field-row-${field.id}`}>
      <IssueList entityId={field.id} />

      <div className="field-tabs" role="tablist" aria-label={t("fieldCatalog.tabsLabel")}>
        {FIELD_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </div>

      <div hidden={activeTab !== "field"} className="field-tab-panel">
        <label>
          key
          <input
            type="text"
            className="studio-mono"
            value={field.key ?? ""}
            onChange={(e) => onChange({ key: e.target.value })}
          />
        </label>
        <div className="field-label-row">
          <label className="field-label-row-label">
            label
            <LocalizedTextInput value={field.label} onChange={updateLabel} />
          </label>
          {/* Replaces the shipped per-locale translation-status list
              (design.md decision 1): names only the active contentLocale's
              own gap, since the content-locale switcher now carries the
              draft-wide per-locale count. */}
          <span className="field-translation-badge">
            {contentLocale === baseLocale
              ? t("fieldCatalog.baseLocaleMark")
              : fieldLocaleGaps(field, contentLocale, baseLocale) === 0
                ? t("fieldCatalog.translationComplete")
                : t("fieldCatalog.translationGap").replace("{count}", String(fieldLocaleGaps(field, contentLocale, baseLocale)))}
          </span>
        </div>
        {missingTranslationWarning(field.label, contentLocale, draft.baseLocale) && (
          <p className="studio-warning">{missingTranslationWarning(field.label, contentLocale, draft.baseLocale)}</p>
        )}
        <label>
          description
          <LocalizedTextInput value={field.description} onChange={(description) => onChange({ description })} />
        </label>
        {missingTranslationWarning(field.description, contentLocale, draft.baseLocale) && (
          <p className="studio-warning">
            {missingTranslationWarning(field.description, contentLocale, draft.baseLocale)}
          </p>
        )}
        <label>
          type
          <select className="studio-mono" value={typeSelectValue} onChange={(e) => changeType(field, e.target.value, onChange)}>
            {BASE_FIELD_TYPES.map((bft) => (
              <option key={bft} value={bft}>
                {FIELD_TYPE_LABELS[bft].name}
              </option>
            ))}
            <option value="__custom__">{t("fieldCatalog.customTypeOption")}</option>
          </select>
        </label>
        {typeof field.type === "string" && <p className="studio-note">{FIELD_TYPE_LABELS[field.type].note}</p>}
        <FormatControlPickers field={field} onChange={onChange} />
        <label className="studio-field-technical">
          {t("fieldCatalog.technicalLabel")}
          <input
            type="checkbox"
            checked={technicalChecked}
            disabled={isGroup}
            onChange={(e) => toggleTechnical(e.target.checked)}
          />
        </label>

        {custom && (
          <details className="studio-devview">
            <summary>{t("fieldCatalog.developerView")}</summary>
            <PluginEnvelopeEditor
              label={t("fieldCatalog.customTypeLabel")}
              value={field.type as DraftOf<FieldDef>["type"] & object}
              onChange={(type) => onChange({ type })}
            />
          </details>
        )}

        {field.type === "group" && (
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
          <details className="field-preview">
            <summary>{t("fieldCatalog.previewHeading")}</summary>
            {previewNote !== undefined && <p className="studio-note">{t(previewNote)}</p>}
            {/* Sample controls take no keyboard or pointer interaction — every
                synthesized entry is already forced `readonly`, and `inert`
                additionally takes the whole container out of the tab order
                and the accessibility tree, rather than inventing a
                non-interactive landmark pattern (design.md decision 5). */}
            <div className="field-preview-body" inert>
              <FieldForm fields={preview.fields} values={preview.values} onChange={() => {}} locale={contentLocale} />
            </div>
          </details>
        )}

        <details className="field-usage">
          <summary>{t("fieldCatalog.usedInHeading")}</summary>
          {usage.length === 0 ? (
            <p className="studio-note">{t("fieldCatalog.usedInEmpty")}</p>
          ) : (
            <ul>
              {usage.map((row) => (
                <li key={row.stepId}>
                  <span>{row.stepLabel || t("steps.unnamedStep")}</span>
                  <span className="studio-mono">{row.modes.join(", ")}</span>
                  <button type="button" className="btn btn-secondary" onClick={() => onShowStep(row.stepId)}>
                    {t("fieldCatalog.showOnCanvas")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>

        <div className="field-tab-remove">
          <button type="button" className="btn btn-ghost" onClick={onRemove}>
            {t("fieldCatalog.removeField")}
          </button>
        </div>
      </div>

      <div hidden={activeTab !== "values"} className="field-tab-panel">
        <div className="field-zone">
          <h4 className="field-zone-heading">{t("fieldCatalog.whereValuesHeading")}</h4>
          <fieldset>
            <label>
              dataSource
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
                    <div className="option-row">
                      <input
                        type="text"
                        placeholder={t("fieldCatalog.optionValuePlaceholder")}
                        disabled={hasDataSource}
                        value={opt.value ?? ""}
                        onChange={(e) => updateOption(i, { value: e.target.value })}
                      />
                      <LocalizedTextInput
                        placeholder={t("fieldCatalog.optionLabelPlaceholder")}
                        disabled={hasDataSource}
                        value={opt.label}
                        onChange={(label) => updateOption(i, { label })}
                      />
                      <button type="button" className="btn btn-secondary" onClick={() => removeOption(i)}>
                        {t("fieldCatalog.removeOption")}
                      </button>
                    </div>
                    {optionWarning && <p className="studio-warning">{optionWarning}</p>}
                  </Fragment>
                );
              })}
              <button type="button" className="btn btn-secondary" onClick={addOption} disabled={hasDataSource}>
                {t("fieldCatalog.addOption")}
              </button>
            </div>
          </fieldset>
        </div>

        <div className="field-zone">
          <h4 className="field-zone-heading">{t("defaultValue.heading")}</h4>
          <DefaultValueEditor field={field} onChange={(next) => onChange({ default: next })} />
        </div>

        {showsColumnMapping(field, dataSources) && (
          <div className="field-zone">
            <h4 className="field-zone-heading">{t("columnMapping.heading")}</h4>
            {columns.length === 0 ? (
              <p className="studio-note">{t("columnMapping.noColumns")}</p>
            ) : (
              <>
                {mappingRows.map((row) => (
                  <div className="studio-column-mapping-row" key={row.column}>
                    <select
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
                    {row.stale && <p className="studio-warning">{t("columnMapping.staleColumn")}</p>}
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" onClick={addMapping} disabled={unmapped === undefined}>
                  {t("columnMapping.addRow")}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div hidden={activeTab !== "rules"} className="field-tab-panel">
        <div className="field-zone">
          <h4 className="field-zone-heading">{t("fieldCatalog.onlyAskWhenHeading")}</h4>
          {visibleState.kind === "none" ? (
            <p className="studio-note">{t("fieldCatalog.conditionNoSteps")}</p>
          ) : (
            <>
              <p className="studio-note">
                {t("fieldCatalog.conditionScopeNote").replace(
                  "{steps}",
                  visibleState.stepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                )}
              </p>
              {visibleState.kind === "divergent" && (
                <p className="studio-warning">
                  {t("fieldCatalog.conditionDivergentNote").replace(
                    "{steps}",
                    visibleState.stepIds.map((id) => usageStepLabel(usage, id)).join(", "),
                  )}
                </p>
              )}
              {visibleState.kind === "divergent" && visibleState.literalStepIds.length > 0 && (
                <p className="studio-warning">
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
        </div>

        <div className="field-zone">
          <h4 className="field-zone-heading">{t("fieldCatalog.validationHeading")}</h4>
          <FieldValidationEditor field={field} validation={field.validation} onChange={(validation) => onChange({ validation })} />
        </div>
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
   * `deepestId`) — forwarded to `FieldEditor` so a group child's row can pull
   * the Field tab active and scroll to itself, whether or not the selection
   * itself changed. */
  focusFieldId: string | undefined;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onShowStep: (stepId: string) => void;
}

export function FieldCatalogPanel({ token, selectedId, focusFieldId, onAdd, onRemove, onShowStep }: Props) {
  const { draft, mutate } = useDraft();
  const fields = draft.fields ?? [];
  const dataSources = draft.dataSources ?? [];
  // The same hook `DataSourcesPanel` reads, so the key picker beside this one
  // and the column picker here cannot offer different lists.
  const lists = useDataLists(token);

  const index = fields.findIndex((f) => f.id === selectedId);
  const field = index === -1 ? undefined : fields[index];

  const updateField = (patch: Partial<DraftField>) => {
    if (index === -1) return;
    updateInDraftArray(mutate, (d) => d.fields?.[index], patch);
  };

  return (
    <div className="field-catalog-panel">
      <h3>{t("fieldCatalog.heading")}</h3>
      {field === undefined ? (
        <p className="empty">{t("fieldCatalog.empty")}</p>
      ) : (
        // Remounts on a field switch (design.md decision 1): this also
        // resets `FieldEditor`'s own active-tab state to the Field tab, for
        // free, the same way the selection change already resets everything
        // else that component holds. A rail click that stays on the SAME
        // top-level field — a different child of the group already open —
        // does not remount, so `focusFieldId` (below) forces the Field tab
        // active on its own.
        <FieldEditor
          key={field.id ?? index}
          field={field}
          dataSources={dataSources}
          lists={lists}
          focusFieldId={focusFieldId}
          onChange={updateField}
          onRemove={() => onRemove(index)}
          onShowStep={onShowStep}
        />
      )}
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        {t("fieldCatalog.addField")}
      </button>
    </div>
  );
}

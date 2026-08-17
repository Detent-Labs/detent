import { Fragment } from "react";
import type { BaseFieldType, DataSourceDef, FieldDef, FieldOption } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
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
import { missingTranslationWarning, seedLocalizedText } from "../draft/localized-text";

type DraftField = DraftOf<FieldDef>;
type DraftDataSource = DraftOf<DataSourceDef>;
type DraftOption = DraftOf<FieldOption>;

const BASE_FIELD_TYPES: BaseFieldType[] = [
  "string", "number", "boolean", "date", "datetime",
  "select", "multiselect", "reference", "file", "group",
];

function isCustomType(type: DraftField["type"]): type is DraftOf<FieldDef>["type"] & object {
  return typeof type === "object" && type !== null;
}

interface FieldRowProps {
  field: DraftField;
  dataSources: DraftDataSource[];
  /** `undefined` until the fetch resolves, and after a failed one. */
  lists: StudioDataList[] | undefined;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}

/** Fields are recursive (a `group` field carries its own sub-fields), so this renders itself for `field.fields`. */
function FieldRow({ field, dataSources, lists, onChange, onRemove }: FieldRowProps) {
  const { draft, contentLocale } = useDraft();
  const custom = isCustomType(field.type);
  const typeSelectValue = typeof field.type === "object" && field.type !== null ? "__custom__" : (field.type ?? "string");
  const hasOptions = (field.options?.length ?? 0) > 0;
  const hasDataSource = field.dataSource !== undefined;

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
        <LocalizedTextInput value={field.label} onChange={(label) => onChange({ label })} />
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
        <select
          className="studio-mono"
          value={typeSelectValue}
          onChange={(e) => {
            if (e.target.value === "__custom__") onChange({ type: { type: "", config: {} } });
            else onChange({ type: e.target.value as BaseFieldType });
          }}
        >
          {BASE_FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="__custom__">{t("fieldCatalog.customTypeOption")}</option>
        </select>
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
            <FieldRow
              key={sub.id ?? i}
              field={sub}
              dataSources={dataSources}
              lists={lists}
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

interface Props {
  token: string;
  /** The one top-level field this panel renders. `undefined` only while the
   * catalog holds none at all — the screen otherwise keeps it resolved. */
  selectedId: string | undefined;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

export function FieldCatalogPanel({ token, selectedId, onAdd, onRemove }: Props) {
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
        <FieldRow
          key={field.id ?? index}
          field={field}
          dataSources={dataSources}
          lists={lists}
          onChange={updateField}
          onRemove={() => onRemove(index)}
        />
      )}
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        {t("fieldCatalog.addField")}
      </button>
    </div>
  );
}

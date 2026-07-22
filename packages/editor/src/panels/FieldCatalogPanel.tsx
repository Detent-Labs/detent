import type { BaseFieldType, DataSourceDef, FieldDef, FieldOption } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { useT } from "../i18n/store";
import { mintId } from "../draft/ids";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { IssueList } from "./shared/IssueList";

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
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}

/** Fields are recursive (a `group` field carries its own sub-fields), so this renders itself for `field.fields`. */
function FieldRow({ field, dataSources, onChange, onRemove }: FieldRowProps) {
  const t = useT();
  const custom = isCustomType(field.type);
  const typeSelectValue = typeof field.type === "object" && field.type !== null ? "__custom__" : (field.type ?? "string");
  const hasOptions = (field.options?.length ?? 0) > 0;
  const hasDataSource = field.dataSource !== undefined;

  const setOptions = (options: DraftOption[]) => onChange({ options, dataSource: options.length > 0 ? undefined : field.dataSource });

  const addOption = () => setOptions([...(field.options ?? []), { value: "", label: "" }]);
  const updateOption = (i: number, patch: Partial<DraftOption>) =>
    setOptions((field.options ?? []).map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const removeOption = (i: number) => setOptions((field.options ?? []).filter((_, idx) => idx !== i));

  const addSubField = () => onChange({ fields: [...(field.fields ?? []), { id: mintId("field"), key: "", label: "", type: "string" }] });
  const updateSubField = (i: number, patch: Partial<DraftField>) =>
    onChange({ fields: (field.fields ?? []).map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  const removeSubField = (i: number) => onChange({ fields: (field.fields ?? []).filter((_, idx) => idx !== i) });

  return (
    <div className="field-row">
      <label>
        key
        <input type="text" value={field.key ?? ""} onChange={(e) => onChange({ key: e.target.value })} />
      </label>
      <label>
        label
        <input type="text" value={field.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>
        description
        <input type="text" value={field.description ?? ""} onChange={(e) => onChange({ description: e.target.value })} />
      </label>
      <label>
        type
        <select
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
        <PluginEnvelopeEditor
          label={t("fieldCatalog.customTypeLabel")}
          value={field.type as DraftOf<FieldDef>["type"] & object}
          onChange={(type) => onChange({ type })}
        />
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
          {(field.options ?? []).map((opt, i) => (
            <div className="option-row" key={i}>
              <input
                type="text"
                placeholder={t("fieldCatalog.optionValuePlaceholder")}
                disabled={hasDataSource}
                value={opt.value ?? ""}
                onChange={(e) => updateOption(i, { value: e.target.value })}
              />
              <input
                type="text"
                placeholder={t("fieldCatalog.optionLabelPlaceholder")}
                disabled={hasDataSource}
                value={opt.label ?? ""}
                onChange={(e) => updateOption(i, { label: e.target.value })}
              />
              <button type="button" onClick={() => removeOption(i)}>
                {t("fieldCatalog.removeOption")}
              </button>
            </div>
          ))}
          <button type="button" onClick={addOption} disabled={hasDataSource}>
            {t("fieldCatalog.addOption")}
          </button>
        </div>
      </fieldset>

      {field.type === "group" && (
        <fieldset>
          <legend>{t("fieldCatalog.subFieldsLegend")}</legend>
          {(field.fields ?? []).map((sub, i) => (
            <FieldRow
              key={sub.id ?? i}
              field={sub}
              dataSources={dataSources}
              onChange={(patch) => updateSubField(i, patch)}
              onRemove={() => removeSubField(i)}
            />
          ))}
          <button type="button" onClick={addSubField}>
            {t("fieldCatalog.addSubField")}
          </button>
        </fieldset>
      )}

      <IssueList entityId={field.id} />

      <button type="button" onClick={onRemove}>
        {t("fieldCatalog.removeField")}
      </button>
    </div>
  );
}

export function FieldCatalogPanel() {
  const { draft, mutate } = useDraft();
  const t = useT();
  const fields = draft.fields ?? [];
  const dataSources = draft.dataSources ?? [];

  const addField = () => {
    mutate((d) => {
      d.fields ??= [];
      d.fields.push({ id: mintId("field"), key: "", label: "", type: "string" });
    });
  };

  const removeField = (index: number) => {
    mutate((d) => {
      d.fields?.splice(index, 1);
    });
  };

  const updateField = (index: number, patch: Partial<DraftField>) => {
    mutate((d) => {
      const field = d.fields?.[index];
      if (field) Object.assign(field, patch);
    });
  };

  return (
    <div className="field-catalog-panel">
      <h3>{t("fieldCatalog.heading")}</h3>
      {fields.length === 0 && <p className="empty">{t("fieldCatalog.empty")}</p>}
      {fields.map((field, index) => (
        <FieldRow
          key={field.id ?? index}
          field={field}
          dataSources={dataSources}
          onChange={(patch) => updateField(index, patch)}
          onRemove={() => removeField(index)}
        />
      ))}
      <button type="button" onClick={addField}>
        {t("fieldCatalog.addField")}
      </button>
    </div>
  );
}

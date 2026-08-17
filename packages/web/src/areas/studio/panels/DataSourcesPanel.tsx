import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { useDataLists } from "./shared/useDataLists.js";
import { IssueList } from "./shared/IssueList";
import { DB_LIST_TYPE, keyOptions, listKeyOf, unknownListKeyWarning } from "./dataListKeysLogic.js";
import type { ConfigFieldDescriptor } from "../api/types.js";

type DraftDataSource = DraftOf<DataSourceDef>;

interface DataSourceRowProps {
  ds: DraftDataSource;
  listKeys: string[] | undefined;
  registryTypes: string[] | undefined;
  registrySchemas: Record<string, ConfigFieldDescriptor[]> | undefined;
  onChange: (patch: Partial<DraftDataSource>) => void;
  onRemove: () => void;
}

function DataSourceRow({ ds, listKeys, registryTypes, registrySchemas, onChange, onRemove }: DataSourceRowProps) {
  const warning = unknownListKeyWarning(ds.type, ds.config, listKeys);
  const listKey = listKeyOf(ds.config);
  return (
    <div className="data-source-row">
      <label>
        key
        <input
          type="text"
          className="studio-mono"
          value={ds.key ?? ""}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </label>
      <PluginEnvelopeEditor
        label="plugin"
        value={ds}
        onChange={onChange}
        registryTypes={registryTypes}
        registrySchemas={registrySchemas}
      />
      {ds.type === DB_LIST_TYPE && listKeys !== undefined && (
        <label>
          {t("dataSources.dataListLabel")}
          <select value={listKey} onChange={(e) => onChange({ config: { ...ds.config, listKey: e.target.value } })}>
            <option value="">{t("dataSources.pickListKey")}</option>
            {keyOptions(listKey, listKeys).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      )}
      {warning && <p className="studio-warning">{warning}</p>}
      <IssueList entityId={ds.id} />
      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t("dataSources.removeDataSource")}
      </button>
    </div>
  );
}

interface Props {
  token: string;
  /** The one data source this panel renders. `undefined` only while the draft
   * holds none at all — the screen otherwise keeps it resolved. */
  selectedId: string | undefined;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/** Process-wide data sources, referenced by id from a field's `dataSource` (never inlined). */
export function DataSourcesPanel({ token, selectedId, onAdd, onRemove }: Props) {
  const { draft, mutate } = useDraft();
  const dataSources = draft.dataSources ?? [];
  // `undefined` until the lists arrive, and after a failed fetch — the picker
  // then falls back to free text and warns about nothing.
  const lists = useDataLists(token);
  const listKeys = lists?.map((l) => l.listKey);
  const registry = useRegistry(token);

  const index = dataSources.findIndex((d) => d.id === selectedId);
  const ds = index === -1 ? undefined : dataSources[index];

  const updateDataSource = (patch: Partial<DraftDataSource>) => {
    if (index === -1) return;
    updateInDraftArray(mutate, (d) => d.dataSources?.[index], patch);
  };

  // `db.list`'s only config field, `listKey`, already has the dedicated
  // picker below (real known keys, an unknown-key warning) — a generated
  // form for it would just be a plain, less-informed text input for the
  // same field. Excluded here so that picker stays the one place it's set.
  const dataSourceSchemasForForm = registry?.dataSourceSchemas
    ? Object.fromEntries(Object.entries(registry.dataSourceSchemas).filter(([type]) => type !== DB_LIST_TYPE))
    : undefined;

  return (
    <div className="data-sources-panel">
      <h3>{t("dataSources.heading")}</h3>
      {ds === undefined ? (
        <p className="empty">{t("dataSources.empty")}</p>
      ) : (
        <DataSourceRow
          ds={ds}
          listKeys={listKeys}
          registryTypes={registry?.dataSourceTypes}
          registrySchemas={dataSourceSchemasForForm}
          onChange={updateDataSource}
          onRemove={() => onRemove(index)}
        />
      )}
      <button type="button" className="btn btn-secondary" onClick={onAdd}>
        {t("dataSources.addDataSource")}
      </button>
    </div>
  );
}

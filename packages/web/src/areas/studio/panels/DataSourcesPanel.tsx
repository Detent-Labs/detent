import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray, updateInDraftArray } from "../draft/draft-array-crud";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { useDataLists } from "./shared/useDataLists.js";
import { IssueList } from "./shared/IssueList";
import { DB_LIST_TYPE, keyOptions, listKeyOf, unknownListKeyWarning } from "./dataListKeysLogic.js";

type DraftDataSource = DraftOf<DataSourceDef>;

/** Process-wide data sources, referenced by id from a field's `dataSource` (never inlined). */
export function DataSourcesPanel({ token }: { token: string }) {
  const { draft, mutate } = useDraft();
  const dataSources = draft.dataSources ?? [];
  // `undefined` until the lists arrive, and after a failed fetch — the picker
  // then falls back to free text and warns about nothing.
  const lists = useDataLists(token);
  const listKeys = lists?.map((l) => l.listKey);
  const registry = useRegistry(token);

  const addDataSource = () => {
    addToDraftArray(mutate, (d) => (d.dataSources ??= []), { id: mintId("dataSource"), key: "", type: "", config: {} });
  };

  const removeDataSource = (index: number) => {
    mutate((d) => {
      d.dataSources?.splice(index, 1);
    });
  };

  const updateDataSource = (index: number, patch: Partial<DraftDataSource>) => {
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
      {dataSources.length === 0 && <p className="empty">{t("dataSources.empty")}</p>}
      {dataSources.map((ds, index) => {
        const warning = unknownListKeyWarning(ds.type, ds.config, listKeys);
        const listKey = listKeyOf(ds.config);
        return (
          <div className="data-source-row" key={ds.id ?? index}>
            <label>
              key
              <input type="text" value={ds.key ?? ""} onChange={(e) => updateDataSource(index, { key: e.target.value })} />
            </label>
            <PluginEnvelopeEditor
              label="plugin"
              value={ds}
              onChange={(patch) => updateDataSource(index, patch)}
              registryTypes={registry?.dataSourceTypes}
              registrySchemas={dataSourceSchemasForForm}
            />
            {ds.type === DB_LIST_TYPE && listKeys !== undefined && (
              <label>
                data list
                <select value={listKey} onChange={(e) => updateDataSource(index, { config: { ...ds.config, listKey: e.target.value } })}>
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
            <button type="button" className="btn btn-secondary" onClick={() => removeDataSource(index)}>
              {t("dataSources.removeDataSource")}
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={addDataSource}>
        {t("dataSources.addDataSource")}
      </button>
    </div>
  );
}

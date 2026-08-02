import { useEffect, useState } from "react";
import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray, updateInDraftArray } from "../draft/draft-array-crud";
import { listDataListKeys } from "../api/client.js";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { IssueList } from "./shared/IssueList";
import { DB_LIST_TYPE, keyOptions, listKeyOf, unknownListKeyWarning } from "./dataListKeysLogic.js";

type DraftDataSource = DraftOf<DataSourceDef>;

/** Process-wide data sources, referenced by id from a field's `dataSource` (never inlined). */
export function DataSourcesPanel({ token }: { token: string }) {
  const { draft, mutate } = useDraft();
  const dataSources = draft.dataSources ?? [];
  // `undefined` until the keys arrive, and after a failed fetch — the picker
  // then falls back to free text and warns about nothing.
  const [listKeys, setListKeys] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    let live = true;
    listDataListKeys(token)
      .then((keys) => live && setListKeys(keys))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token]);

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
            <PluginEnvelopeEditor label="plugin" value={ds} onChange={(patch) => updateDataSource(index, patch)} />
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
            <button type="button" onClick={() => removeDataSource(index)}>
              {t("dataSources.removeDataSource")}
            </button>
          </div>
        );
      })}
      <button type="button" onClick={addDataSource}>
        {t("dataSources.addDataSource")}
      </button>
    </div>
  );
}

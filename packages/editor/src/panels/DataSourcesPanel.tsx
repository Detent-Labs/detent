import type { DataSourceDef } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { useDraft } from "../draft/store";
import { useT } from "../i18n/store";
import { mintId } from "../draft/ids";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { IssueList } from "./shared/IssueList";

type DraftDataSource = DraftOf<DataSourceDef>;

/** Process-wide data sources, referenced by id from a field's `dataSource` (never inlined). */
export function DataSourcesPanel() {
  const { draft, mutate } = useDraft();
  const t = useT();
  const dataSources = draft.dataSources ?? [];

  const addDataSource = () => {
    mutate((d) => {
      d.dataSources ??= [];
      d.dataSources.push({ id: mintId("dataSource"), key: "", type: "", config: {} });
    });
  };

  const removeDataSource = (index: number) => {
    mutate((d) => {
      d.dataSources?.splice(index, 1);
    });
  };

  const updateDataSource = (index: number, patch: Partial<DraftDataSource>) => {
    mutate((d) => {
      const ds = d.dataSources?.[index];
      if (ds) Object.assign(ds, patch);
    });
  };

  return (
    <div className="data-sources-panel">
      <h3>{t("dataSources.heading")}</h3>
      {dataSources.length === 0 && <p className="empty">{t("dataSources.empty")}</p>}
      {dataSources.map((ds, index) => (
        <div className="data-source-row" key={ds.id ?? index}>
          <label>
            key
            <input type="text" value={ds.key ?? ""} onChange={(e) => updateDataSource(index, { key: e.target.value })} />
          </label>
          <PluginEnvelopeEditor label="plugin" value={ds} onChange={(patch) => updateDataSource(index, patch)} />
          <IssueList entityId={ds.id} />
          <button type="button" onClick={() => removeDataSource(index)}>
            {t("dataSources.removeDataSource")}
          </button>
        </div>
      ))}
      <button type="button" onClick={addDataSource}>
        {t("dataSources.addDataSource")}
      </button>
    </div>
  );
}

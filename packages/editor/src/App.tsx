import { DraftProvider, useDraft } from "./draft/store";
import { draftFields } from "./draft/fields";
import { LocaleProvider, useT } from "./i18n/store";
import { LocaleSwitcher } from "./i18n/LocaleSwitcher";
import { FieldCatalogPanel } from "./panels/FieldCatalogPanel";
import { DataSourcesPanel } from "./panels/DataSourcesPanel";
import { StepsPanel } from "./panels/StepsPanel";
import { ContractPanel } from "./panels/ContractPanel";
import { RegistryPanel } from "./panels/RegistryPanel";
import { FileToolbar } from "./panels/FileToolbar";
import { IssueList } from "./panels/shared/IssueList";
import { LocalizedTextInput } from "./panels/shared/LocalizedTextInput";
import { ContentLocaleSwitcher } from "./panels/shared/ContentLocaleSwitcher";
import { GraphView } from "./graph/GraphView";

function ProcessHeader() {
  const { draft, mutate } = useDraft();
  const t = useT();
  return (
    <fieldset className="process-header">
      <legend>{t("app.processLegend")}</legend>
      <label>
        key
        <input type="text" value={draft.key ?? ""} onChange={(e) => mutate((d) => { d.key = e.target.value; })} />
      </label>
      <label>
        label
        <LocalizedTextInput value={draft.label} onChange={(next) => mutate((d) => { d.label = next; })} />
      </label>
      <label>
        description
        <LocalizedTextInput value={draft.description} onChange={(next) => mutate((d) => { d.description = next; })} />
      </label>
      <IssueList entityId="process" />
    </fieldset>
  );
}

function Editor() {
  const { draft, validation } = useDraft();
  const fields = draftFields(draft);
  const t = useT();

  return (
    <main>
      <h1>{t("app.title")}</h1>
      {!validation.zodValid && <p className="draft-incomplete">{t("app.draftIncomplete")}</p>}
      <FileToolbar />
      <LocaleSwitcher />
      <ContentLocaleSwitcher />
      <ProcessHeader />
      <RegistryPanel />
      <h3>{t("app.graphHeading")}</h3>
      <GraphView />
      <FieldCatalogPanel />
      <DataSourcesPanel />
      <StepsPanel fields={fields} />
      <ContractPanel />
    </main>
  );
}

export function App() {
  return (
    <LocaleProvider>
      <DraftProvider>
        <Editor />
      </DraftProvider>
    </LocaleProvider>
  );
}

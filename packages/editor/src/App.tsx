import { DraftProvider, useDraft } from "./draft/store";
import { draftFields } from "./draft/fields";
import { FieldCatalogPanel } from "./panels/FieldCatalogPanel";
import { DataSourcesPanel } from "./panels/DataSourcesPanel";
import { StepsPanel } from "./panels/StepsPanel";
import { ContractPanel } from "./panels/ContractPanel";
import { RegistryPanel } from "./panels/RegistryPanel";
import { FileToolbar } from "./panels/FileToolbar";
import { IssueList } from "./panels/shared/IssueList";
import { GraphView } from "./graph/GraphView";

function ProcessHeader() {
  const { draft, mutate } = useDraft();
  return (
    <fieldset className="process-header">
      <legend>Process</legend>
      <label>
        key
        <input type="text" value={draft.key ?? ""} onChange={(e) => mutate((d) => { d.key = e.target.value; })} />
      </label>
      <label>
        label
        <input type="text" value={draft.label ?? ""} onChange={(e) => mutate((d) => { d.label = e.target.value; })} />
      </label>
      <label>
        description
        <input
          type="text"
          value={draft.description ?? ""}
          onChange={(e) => mutate((d) => { d.description = e.target.value; })}
        />
      </label>
      <IssueList entityId="process" />
    </fieldset>
  );
}

function Editor() {
  const { draft, validation } = useDraft();
  const fields = draftFields(draft);

  return (
    <main>
      <h1>Workflow Editor</h1>
      {!validation.zodValid && (
        <p className="draft-incomplete">
          Draft is not yet structurally valid — CEL, registry, duration, and cross-process checks are held back until
          it is (see the Zod issues below).
        </p>
      )}
      <FileToolbar />
      <ProcessHeader />
      <RegistryPanel />
      <h3>Graph</h3>
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
    <DraftProvider>
      <Editor />
    </DraftProvider>
  );
}

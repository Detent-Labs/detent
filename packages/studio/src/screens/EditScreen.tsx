import { useEffect, useState } from "react";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import type { Draft } from "../draft/types.js";
import { t } from "../i18n/catalog.js";
import { FieldCatalogPanel } from "../panels/FieldCatalogPanel.js";
import { DataSourcesPanel } from "../panels/DataSourcesPanel.js";
import { StepsPanel } from "../panels/StepsPanel.js";
import { ContractPanel } from "../panels/ContractPanel.js";
import { RegistryPanel } from "../panels/RegistryPanel.js";
import { DraftToolbar } from "../panels/DraftToolbar.js";
import { IssueList } from "../panels/shared/IssueList.js";
import { LocalizedTextInput } from "../panels/shared/LocalizedTextInput.js";
import { ContentLocaleSwitcher } from "../panels/shared/ContentLocaleSwitcher.js";
import { getDraft, StudioClientError } from "../api/client.js";
import type { DraftRecord } from "../api/types.js";
import type { Route } from "../routing.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";

interface EditScreenProps {
  processId: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

function ProcessHeader() {
  const { draft, mutate } = useDraft();
  return (
    <fieldset className="process-header">
      <legend>{t("app.processLegend")}</legend>
      <label>
        key
        <input
          type="text"
          value={draft.key ?? ""}
          onChange={(e) =>
            mutate((d) => {
              d.key = e.target.value;
            })
          }
        />
      </label>
      <label>
        label
        <LocalizedTextInput
          value={draft.label}
          onChange={(next) =>
            mutate((d) => {
              d.label = next;
            })
          }
        />
      </label>
      <IssueList entityId="process" />
    </fieldset>
  );
}

interface EditorAreaProps {
  processId: string;
  token: string;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/** Rendered inside DraftProvider, so it — and DraftToolbar, its child — can read/replace the Draft via useDraft(). */
function EditorArea({ processId, token, initialRevision, initialLayout, navigate, onUnauthorized }: EditorAreaProps) {
  const { draft, validation } = useDraft();
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  const fields = draftFields(draft);

  return (
    <main className="studio-screen">
      <button type="button" className="studio-back" onClick={() => navigate({ name: "processes" })}>
        ← Back to processes
      </button>
      <h1>{t("app.title")}</h1>
      {!validation.zodValid && <p className="draft-incomplete">{t("app.draftIncomplete")}</p>}
      <DraftToolbar
        processId={processId}
        token={token}
        saveState={saveState}
        onSaveState={setSaveState}
        onDiscarded={() => navigate({ name: "processes" })}
        onUnauthorized={onUnauthorized}
      />
      <ContentLocaleSwitcher />
      <ProcessHeader />
      <RegistryPanel />
      <FieldCatalogPanel />
      <DataSourcesPanel />
      <StepsPanel fields={fields} />
      <ContractPanel />
    </main>
  );
}

export function EditScreen({ processId, token, navigate, onUnauthorized }: EditScreenProps) {
  const [record, setRecord] = useState<DraftRecord | undefined | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    setRecord("loading");
    getDraft(processId, token)
      .then((r) => {
        if (!cancelled) setRecord(r);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof StudioClientError && e.status === 401) onUnauthorized();
        else throw e;
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, onUnauthorized]);

  if (record === "loading") {
    return <main className="studio-screen">Loading…</main>;
  }
  if (record === undefined) {
    return (
      <main className="studio-screen">
        <button type="button" className="studio-back" onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <p className="studio-error">No draft exists for this process.</p>
      </main>
    );
  }

  return (
    <DraftProvider initial={record.body as Draft}>
      <EditorArea
        processId={processId}
        token={token}
        initialRevision={record.revision}
        initialLayout={record.layout}
        navigate={navigate}
        onUnauthorized={onUnauthorized}
      />
    </DraftProvider>
  );
}

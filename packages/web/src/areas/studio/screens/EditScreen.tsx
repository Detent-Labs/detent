import { useCallback, useEffect, useState } from "react";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import { resolveBaseLocaleChange } from "./processHeaderLogic.js";
import type { Draft } from "../draft/types.js";
import { t } from "../catalog.js";
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
import { CanvasView } from "../canvas/CanvasView.js";
import type { Point } from "../canvas/geometry.js";
import { JsonView } from "../panels/JsonView.js";
import { describeCaughtError } from "../errors.js";

interface EditScreenProps {
  processId: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

function ProcessHeader() {
  const { draft, mutate, contentLocale, setContentLocale } = useDraft();

  /** Both writes are unconditional: `resolveBaseLocaleChange` owns every
   * decision, so this wiring carries no branch to get wrong (and re-setting
   * the content locale to its current value is a React bail-out). */
  const changeBaseLocale = (typed: string) => {
    const change = resolveBaseLocaleChange(typed, contentLocale);
    mutate((d) => {
      d.baseLocale = change.baseLocale;
    });
    setContentLocale(change.contentLocale);
  };

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
      {/* Before `label`: baseLocale decides which entry of every LocalizedText
          below it is mandatory, so the declaration precedes the first
          localized value it governs. */}
      <label>
        baseLocale
        <input type="text" value={draft.baseLocale ?? ""} onChange={(e) => changeBaseLocale(e.target.value)} />
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
  const { draft, validation, replace } = useDraft();
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined);
  const [surface, setSurface] = useState<"structure" | "json">("structure");
  const fields = draftFields(draft);

  // Position is not body — it lives in `saveState.layout` (round-tripped
  // opaquely by DraftToolbar's save call already), never in the Draft
  // model's `mutate()` (design.md: the two are separate existing surfaces).
  const onMoveStep = (stepId: string, point: Point) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, [stepId]: point } }));
  };

  return (
    <main className="studio-screen studio-edit-screen">
      <button type="button" className="studio-back" onClick={() => navigate({ name: "processes" })}>
        ← Back to processes
      </button>
      <button type="button" className="studio-back" onClick={() => navigate({ name: "versions", processId })}>
        Versions
      </button>
      <button type="button" className="studio-back" onClick={() => navigate({ name: "play", processId })}>
        Player
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
      <RegistryPanel />
      <div className="studio-surface-toggle" role="tablist">
        <button type="button" role="tab" aria-selected={surface === "structure"} onClick={() => setSurface("structure")}>
          {t("edit.structureTab")}
        </button>
        <button type="button" role="tab" aria-selected={surface === "json"} onClick={() => setSurface("json")}>
          {t("edit.jsonTab")}
        </button>
      </div>
      {surface === "structure" ? (
        <>
          <ProcessHeader />
          <FieldCatalogPanel />
          <DataSourcesPanel token={token} />
          <ContractPanel />
          <div className="canvas-layout">
            <CanvasView layout={saveState.layout} onMoveStep={onMoveStep} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} />
            <aside className="canvas-inspector">
              <StepsPanel fields={fields} selectedStepId={selectedStepId} onSelectStep={setSelectedStepId} />
            </aside>
          </div>
        </>
      ) : (
        <JsonView draft={draft} onApply={replace} />
      )}
    </main>
  );
}

/** `record`'s own discriminated shape (not `DraftRecord | undefined | "loading"`
 * before this change) — a load failure now moves to `"error"` explicitly
 * instead of leaving the `"loading"` sentinel in place forever with no
 * indication anything went wrong and no way forward (spa-error-reporting
 * spec: "A screen never renders a permanent loading state after a failure"). */
type EditLoadState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; record: DraftRecord };

export function EditScreen({ processId, token, navigate, onUnauthorized }: EditScreenProps) {
  const [state, setState] = useState<EditLoadState>({ kind: "loading" });

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getDraft(processId, token)
      .then((r) => {
        if (cancelled) return;
        setState(r ? { kind: "loaded", record: r } : { kind: "not-found" });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof StudioClientError && e.status === 401) {
          onUnauthorized();
          return;
        }
        setState({ kind: "error", message: describeCaughtError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, onUnauthorized]);

  useEffect(() => load(), [load]);

  if (state.kind === "loading") {
    return <main className="studio-screen">Loading…</main>;
  }
  if (state.kind === "error") {
    return (
      <main className="studio-screen">
        <button type="button" className="studio-back" onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{state.message}</span>
          <button type="button" onClick={() => load()}>
            {t("error.retry")}
          </button>
        </div>
      </main>
    );
  }
  if (state.kind === "not-found") {
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
    <DraftProvider initial={state.record.body as Draft}>
      <EditorArea
        processId={processId}
        token={token}
        initialRevision={state.record.revision}
        initialLayout={state.record.layout}
        navigate={navigate}
        onUnauthorized={onUnauthorized}
      />
    </DraftProvider>
  );
}

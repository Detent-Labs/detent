import { useCallback, useEffect, useReducer, useState } from "react";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import { resolveBaseLocaleChange } from "./processHeaderLogic.js";
import type { Draft } from "../draft/types.js";
import { t, type TranslationKey } from "../catalog.js";
import { StepsPanel } from "../panels/StepsPanel.js";
import { EditPanelsModal, PANEL_VIEWS, type PanelView } from "../panels/EditPanelsModal.js";
import { RegistryPanel } from "../panels/RegistryPanel.js";
import { DraftToolbar } from "../panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../panels/ProcessHeaderBar.js";
import { ChecksRail } from "../panels/ChecksRail.js";
import { IssueList } from "../panels/shared/IssueList.js";
import { LocalizedTextInput } from "../panels/shared/LocalizedTextInput.js";
import { missingTranslationWarning, resolveDraftLocalizedText, seedLocalizedText } from "../draft/localized-text";
import { ContentLocaleSwitcher } from "../panels/shared/ContentLocaleSwitcher.js";
import { getDraft, StudioClientError } from "../api/client.js";
import type { DraftRecord, PublishResult } from "../api/types.js";
import type { Route } from "../routing.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";
import { savedBodyReducer, initialSavedBody, isDirty } from "./draftToolbarState.js";
import { CanvasView } from "../canvas/CanvasView.js";
import { StepPalette } from "../canvas/StepPalette.js";
import { svgPointFromClient, type Point } from "../canvas/geometry.js";
import { newStep, type StepKind } from "../draft/createStep.js";
import { addToDraftArray } from "../draft/draft-array-crud.js";
import { JsonView } from "../panels/JsonView.js";
import { describeCaughtError } from "../errors.js";
import { FormEditorScreen } from "./FormEditorScreen.js";

/** The three links read shorter than the panels' own headings: they name a
 * destination, not the editor they open. */
const PANEL_LINK_LABEL: Record<PanelView, TranslationKey> = {
  fields: "editPanels.linkFields",
  dataSources: "editPanels.linkDataSources",
  contract: "editPanels.linkContract",
};

interface EditScreenProps {
  processId: string;
  /** The `edit` route's optional sub-state (design.md's routing decision):
   * set, the form editor's routed page renders in place of the canvas and
   * inspector, for this step. */
  formStepId?: string;
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

  const labelWarning = missingTranslationWarning(draft.label, contentLocale, draft.baseLocale);

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
      {/* Sibling of the label, never nested inside it: a <label> takes
          phrasing content, and the design language puts a field's own
          messages beside the label for the same reason. */}
      {labelWarning && <p className="studio-warning">{labelWarning}</p>}
      <IssueList entityId="process" />
    </fieldset>
  );
}

interface EditorAreaProps {
  processId: string;
  formStepId?: string;
  token: string;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/** Rendered inside DraftProvider, so it — and DraftToolbar, its child — can read/replace the Draft via useDraft(). */
function EditorArea({ processId, formStepId, token, initialRevision, initialLayout, navigate, onUnauthorized }: EditorAreaProps) {
  const { draft, mutate, validation, replace, contentLocale } = useDraft();
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined);
  const [selectedPathId, setSelectedPathId] = useState<string | undefined>(undefined);
  const [surface, setSurface] = useState<"structure" | "json">("structure");
  // `undefined` while the shared modal is closed. Component state, not route
  // state: a modal that always opens fresh from its own link needs no
  // shareable link. The form editor's `formStepId` is this route's one
  // exception (design.md's routing decision): it is route state, because a
  // navigation away and back must show the same draft state a re-opened
  // modal would have, and that survives only under the one `DraftProvider`
  // this screen mounts for its own life.
  const [openPanel, setOpenPanel] = useState<PanelView | undefined>(undefined);
  const fields = draftFields(draft);

  const steps = draft.workflow?.steps ?? [];
  const formStepIndex = formStepId !== undefined ? steps.findIndex((s) => s.id === formStepId) : -1;
  const formStep = formStepIndex >= 0 ? steps[formStepIndex] : undefined;

  // Lifted out of DraftToolbar (design.md: "the header bar reads lifted
  // DraftToolbar state") — DraftToolbar still computes both; only where
  // they live moves up one level, the same way saveState already works.
  const [savedBody, dispatchSavedBody] = useReducer(savedBodyReducer, draft, initialSavedBody);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  // Client-only, set on every successful save (never on a reload) — new
  // state DraftToolbar tracks nowhere today.
  const [lastSavedAt, setLastSavedAt] = useState<Date | undefined>(undefined);

  // Position is not body — it lives in `saveState.layout` (round-tripped
  // opaquely by DraftToolbar's save call already), never in the Draft
  // model's `mutate()` (design.md: the two are separate existing surfaces).
  const onMoveStep = (stepId: string, point: Point) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, [stepId]: point } }));
  };

  // The second argument carries a clicked path's id (task 3.13); a node
  // click or a background deselect passes none, which clears it.
  const onSelectStep = (stepId: string | undefined, pathId?: string) => {
    setSelectedStepId(stepId);
    setSelectedPathId(pathId);
  };

  /** The palette's own drag-to-place (task 2.3), through the same
   * newStep/addToDraftArray creation path `StepsPanel`'s "+ Add step" button
   * calls. Screen coordinates in, since the palette holds no canvas
   * geometry of its own: `elementFromPoint` finds the live `.canvas-svg`
   * element (or none, when the drop misses the canvas), and
   * `svgPointFromClient` converts through its current pan/zoom transform —
   * the same conversion `CanvasView`'s own node/handle drags use. */
  const onPaletteDrop = (kind: StepKind, clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY);
    const svg = target?.closest<SVGSVGElement>("svg.canvas-svg");
    if (!svg) return; // dropped outside the canvas — no placement
    const point = svgPointFromClient(svg, clientX, clientY);
    const created = newStep(kind, seedLocalizedText(contentLocale));
    addToDraftArray(
      mutate,
      (d) => {
        d.workflow ??= {};
        d.workflow.steps ??= [];
        d.workflow.initialStep ??= created.id;
        return d.workflow.steps;
      },
      created,
    );
    if (created.id) {
      onMoveStep(created.id, point);
      onSelectStep(created.id);
    }
  };

  const processLabel = resolveDraftLocalizedText(draft.label, contentLocale, draft.baseLocale ?? "en") ?? draft.key ?? "";

  return (
    <main className="studio-screen studio-edit-screen">
      <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "processes" })}>
        ← Back to processes
      </button>
      <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "versions", processId })}>
        Versions
      </button>
      <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "play", processId })}>
        Player
      </button>
      <h1>{t("app.title")}</h1>
      {!validation.zodValid && <p className="draft-incomplete">{t("app.draftIncomplete")}</p>}
      <DraftToolbar
        processId={processId}
        token={token}
        saveState={saveState}
        onSaveState={setSaveState}
        savedBody={savedBody}
        onSavedBodyChange={dispatchSavedBody}
        onSaved={() => setLastSavedAt(new Date())}
        publishResult={publishResult}
        onPublishResult={setPublishResult}
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
          {/* Inside the structure branch, never beside the surface tabs. The
              tabs render on both surfaces, and studio-json-view forbids a
              reachable draft-body-mutating control while JSON is active — a
              link up there would let an author open the modal over a live
              textarea and clobber it. The new header bar and palette nest
              here for the same reason: both mutate/summarize the draft. */}
          <nav className="studio-panel-links" aria-label={t("editPanels.linksLabel")}>
            {PANEL_VIEWS.map((view) => (
              <button key={view} type="button" className="btn btn-secondary" onClick={() => setOpenPanel(view)}>
                {t(PANEL_LINK_LABEL[view])}
              </button>
            ))}
          </nav>
          <ProcessHeader />
          <ProcessHeaderBar
            processLabel={processLabel}
            revision={saveState.revision}
            isDirty={isDirty(draft, savedBody)}
            lastSavedAt={lastSavedAt}
            publishResult={publishResult}
          />
          {formStepId !== undefined ? (
            formStep ? (
              <FormEditorScreen
                step={formStep}
                index={formStepIndex}
                fields={fields}
                onBack={() => navigate({ name: "edit", processId })}
              />
            ) : (
              <p className="studio-error">{t("formEditor.stepNotFound")}</p>
            )
          ) : (
            <div className="studio-canvas-layout">
              <StepPalette onDrop={onPaletteDrop} />
              <CanvasView
                layout={saveState.layout}
                onMoveStep={onMoveStep}
                selectedStepId={selectedStepId}
                onSelectStep={onSelectStep}
                selectedPathId={selectedPathId}
              />
              <aside className="canvas-inspector">
                <StepsPanel
                  fields={fields}
                  token={token}
                  selectedStepId={selectedStepId}
                  onSelectStep={onSelectStep}
                  selectedPathId={selectedPathId}
                  navigate={(stepId) => navigate({ name: "edit", processId, formStepId: stepId })}
                />
              </aside>
              <ChecksRail validation={validation} />
            </div>
          )}
          <EditPanelsModal
            openView={openPanel}
            onClose={() => setOpenPanel(undefined)}
            onOpenView={setOpenPanel}
            token={token}
          />
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

export function EditScreen({ processId, formStepId, token, navigate, onUnauthorized }: EditScreenProps) {
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
        <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <div className="studio-error-banner" role="alert">
          <span className="studio-error-banner-stamp">{t("error.failed")}</span>
          <span className="studio-error-banner-message">{state.message}</span>
          <button type="button" className="btn btn-secondary" onClick={() => load()}>
            {t("error.retry")}
          </button>
        </div>
      </main>
    );
  }
  if (state.kind === "not-found") {
    return (
      <main className="studio-screen">
        <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "processes" })}>
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
        formStepId={formStepId}
        token={token}
        initialRevision={state.record.revision}
        initialLayout={state.record.layout}
        navigate={navigate}
        onUnauthorized={onUnauthorized}
      />
    </DraftProvider>
  );
}

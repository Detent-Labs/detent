import { useCallback, useEffect, useReducer, useState } from "react";
import { DraftProvider, useDraft } from "../draft/store.js";
import { draftFields } from "../draft/fields.js";
import type { Draft } from "../draft/types.js";
import { t } from "../catalog.js";
import { StepsPanel } from "../panels/StepsPanel.js";
import { EditPanelsModal, type PanelView } from "../panels/EditPanelsModal.js";
import { useDraftToolbarActions } from "../panels/DraftToolbar.js";
import { ProcessHeaderBar } from "../panels/ProcessHeaderBar.js";
import { ChecksRail } from "../panels/ChecksRail.js";
import { seedLocalizedText } from "../draft/localized-text";
import { getDraft, StudioClientError } from "../api/client.js";
import type { DraftRecord, PublishResult } from "../api/types.js";
import type { Route } from "../routing.js";
import { initialSaveState, type DraftSaveState } from "./draftSaveLogic.js";
import { savedBodyReducer, initialSavedBody, isDirty } from "./draftToolbarState.js";
import { CanvasView } from "../canvas/CanvasView.js";
import { EditRail } from "../canvas/EditRail.js";
import { snapToGrid, svgPointFromClient, DEFAULT_EDGE_STYLE, type Point, type EdgeStyle } from "../canvas/geometry.js";
import { newStep, type StepKind } from "../draft/createStep.js";
import { addToDraftArray } from "../draft/draft-array-crud.js";
import { JsonView } from "../panels/JsonView.js";
import { describeCaughtError } from "../errors.js";
import { FormEditorScreen } from "./FormEditorScreen.js";

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

interface EditorAreaProps {
  processId: string;
  formStepId?: string;
  token: string;
  initialRevision: number;
  initialLayout: Record<string, unknown>;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/** Rendered inside DraftProvider, so it can read/replace the Draft via
 * useDraft() — and pass that access down to every panel it mounts, `EditRail`
 * and `StepsPanel` included. `useDraftToolbarActions` (below) is the one
 * remaining direct consumer of `DraftToolbarProps`; `DraftToolbar` itself no
 * longer mounts here (design.md: "DraftToolbar keeps its logic.
 * ProcessHeaderBar renders the buttons."). */
function EditorArea({ processId, formStepId, token, initialRevision, initialLayout, navigate, onUnauthorized }: EditorAreaProps) {
  const { draft, mutate, validation, replace, contentLocale } = useDraft();
  const [saveState, setSaveState] = useState<DraftSaveState>(() => initialSaveState(initialRevision, initialLayout));
  // The canvas selection is a set (design.md). A set of one drives the
  // inspector exactly as the single id did; a set of several drives the group
  // summary instead, since the inspector edits one step.
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
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

  // The canvas-wide edge style shares the `layout` blob with node positions.
  // No collision is possible: every step id carries a `step_` prefix, and
  // `positionOf` admits only a point. An absent value reads as the default,
  // and so does a value this version does not know — a draft saved by a later
  // one must render, not throw.
  const edgeStyle: EdgeStyle =
    saveState.layout.canvasEdgeStyle === "smoothstep" || saveState.layout.canvasEdgeStyle === "step"
      ? saveState.layout.canvasEdgeStyle
      : DEFAULT_EDGE_STYLE;

  const onEdgeStyleChange = (style: EdgeStyle) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, canvasEdgeStyle: style } }));
  };

  // Position is not body — it lives in `saveState.layout` (round-tripped
  // opaquely by DraftToolbar's save call already), never in the Draft
  // model's `mutate()` (design.md: the two are separate existing surfaces).
  const onMoveStep = (stepId: string, point: Point) => {
    setSaveState((s) => ({ ...s, layout: { ...s.layout, [stepId]: point } }));
  };

  // The second argument carries a clicked path's id (task 3.13); a node
  // click or a background deselect passes none, which clears it. This writes
  // a set of one, or an empty one — it is the single-selection path.
  const onSelectStep = (stepId: string | undefined, pathId?: string) => {
    setSelectedStepIds(stepId ? [stepId] : []);
    setSelectedPathId(pathId);
  };

  // The whole set at once: a shift-click's toggle and a marquee's release. A
  // path belongs to one step, so a set write drops any selected path.
  const onSelectSteps = (stepIds: string[]) => {
    setSelectedStepIds(stepIds);
    setSelectedPathId(undefined);
  };

  // The inspector takes one step. A set of several names none for it, and the
  // group summary stands in (studio-canvas: "It SHALL NOT show the inspector
  // in that state").
  const inspectedStepId = selectedStepIds.length === 1 ? selectedStepIds[0] : undefined;

  /** Deletes every step in the set, the way `StepsPanel.removeStep` deletes
   * one. A path pointing at a deleted step stays as it is; the single delete
   * leaves one the same way, and the checks rail reports it. */
  const deleteSelection = () => {
    const doomed = new Set(selectedStepIds);
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => !s.id || !doomed.has(s.id));
      if (d.workflow.initialStep && doomed.has(d.workflow.initialStep)) {
        d.workflow.initialStep = d.workflow.steps[0]?.id;
      }
    });
    onSelectStep(undefined);
  };

  /** The rail's own drag-to-place (task 2.3), through the same `newStep`/
   * `addToDraftArray` creation path every step-creating control in this
   * screen shares. Screen coordinates in, since `EditRail` holds no canvas
   * geometry of its own: `elementFromPoint` finds the live `.canvas-svg`
   * element (or none, when the drop misses the canvas), and
   * `svgPointFromClient` converts through its current pan/zoom transform —
   * the same conversion `CanvasView`'s own node/handle drags use. */
  const onPaletteDrop = (kind: StepKind, clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY);
    // Resolve through `.canvas-wrap`, not through the SVG under the pointer.
    // Panzoom scales the SVG element itself, so a zoomed-out canvas leaves
    // most of the wrap outside the SVG's own box, while the wrap still paints
    // the grid and still shows the graph. Every point the author reads as
    // canvas therefore places a step. `svgPointFromClient` maps a point
    // outside the box just as well: an inverse CTM is a linear map, not a
    // bounded one.
    const svg =
      target?.closest(".canvas-wrap")?.querySelector<SVGSVGElement>("svg.canvas-svg") ??
      target?.closest<SVGSVGElement>("svg.canvas-svg");
    if (!svg) return; // dropped outside the canvas — no placement
    // Rounded here, the same way a drag's release is: a dropped step lands on
    // the lattice the author can see.
    const point = snapToGrid(svgPointFromClient(svg, clientX, clientY));
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

  // The save/discard/publish logic itself (design.md: "DraftToolbar keeps
  // its logic. ProcessHeaderBar renders the buttons.") — called directly
  // here, not through a mounted `<DraftToolbar>` element, so this is the
  // only instance of that state. Mounting both would run two independent
  // copies of saving/error/publishing state, the exact "second copy" design.md
  // rejects.
  const actions = useDraftToolbarActions({
    processId,
    token,
    saveState,
    onSaveState: setSaveState,
    savedBody,
    onSavedBodyChange: dispatchSavedBody,
    onSaved: () => setLastSavedAt(new Date()),
    publishResult,
    onPublishResult: setPublishResult,
    onDiscarded: () => navigate({ name: "processes" }),
    onUnauthorized,
  });

  return (
    <main className="studio-screen studio-edit-screen">
      <nav className="studio-header-nav">
        <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "processes" })}>
          ← Back to processes
        </button>
        <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "versions", processId })}>
          Versions
        </button>
        <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "play", processId })}>
          Player
        </button>
      </nav>
      {!validation.zodValid && <p className="draft-incomplete">{t("app.draftIncomplete")}</p>}
      {/* Renders on both surfaces (studio-json-view: DraftToolbar, the
          registry selector, and the content-locale switcher "SHALL remain
          visible and usable regardless of which surface is active") — only
          its "Process, saved with the draft" menu group is surface-gated,
          via `structureActive`, since that group's controls mutate the
          draft body the same way the old Structure-only ProcessHeader did. */}
      <ProcessHeaderBar
        revision={saveState.revision}
        isDirty={isDirty(draft, savedBody)}
        lastSavedAt={lastSavedAt}
        publishResult={publishResult}
        conflict={saveState.conflict}
        actions={actions}
        structureActive={surface === "structure"}
        surfaceToggle={
          <div className="studio-surface-toggle" role="tablist">
            <button type="button" role="tab" aria-selected={surface === "structure"} onClick={() => setSurface("structure")}>
              {t("edit.structureTab")}
            </button>
            <button type="button" role="tab" aria-selected={surface === "json"} onClick={() => setSurface("json")}>
              {t("edit.jsonTab")}
            </button>
          </div>
        }
      />
      {surface === "structure" ? (
        <>
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
              <EditRail onDrop={onPaletteDrop} onOpenPanel={setOpenPanel} fields={fields} />
              <CanvasView
                layout={saveState.layout}
                onMoveStep={onMoveStep}
                selectedStepIds={selectedStepIds}
                onSelectStep={onSelectStep}
                onSelectSteps={onSelectSteps}
                selectedPathId={selectedPathId}
                edgeStyle={edgeStyle}
                onEdgeStyleChange={onEdgeStyleChange}
              />
              {/* The third column has three states (studio-canvas). Nothing
                  selected shows the full checks rail. One step or a path
                  shows the inspector. Several steps show the group summary,
                  since the inspector edits one step and a set of several
                  names none for it. The inspector and the summary each dock
                  their own collapsed `ChecksRail`; this column never mounts a
                  second copy beside one of them. */}
              {selectedStepIds.length > 1 ? (
                <aside className="canvas-inspector canvas-selection">
                  <div className="canvas-selection-heading">
                    <span className="canvas-selection-label">{t("canvas.selectionHeading")}</span>
                    <span className="canvas-selection-count">{selectedStepIds.length}</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={deleteSelection}>
                    {t("canvas.selectionRemove")}
                  </button>
                  <ChecksRail validation={validation} collapsed />
                </aside>
              ) : inspectedStepId !== undefined || selectedPathId !== undefined ? (
                <aside className="canvas-inspector">
                  <StepsPanel
                    fields={fields}
                    token={token}
                    selectedStepId={inspectedStepId}
                    onSelectStep={onSelectStep}
                    selectedPathId={selectedPathId}
                    navigate={(stepId) => navigate({ name: "edit", processId, formStepId: stepId })}
                  />
                </aside>
              ) : (
                <ChecksRail validation={validation} />
              )}
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

import { useEffect, useState } from "react";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { performedByFor, performedByPatch, type PerformedBy } from "../draft/performedBy";
import { ActionListEditor } from "./ActionListEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { ChecksRail } from "./ChecksRail.js";
import { parseChildProcessJson } from "../draft/io";
import { missingTranslationWarning } from "../draft/localized-text";
import { stepIssueCount } from "../draft/panel-rail";

type DraftStep = DraftOf<Step>;

/** The behavior zone's tab row. Subprocess joins only when the step's
 * performed-by control reads Subprocess. Unlike the retired `openSection`,
 * this state carries no "nothing shown" value — the behavior zone always
 * shows exactly one tab's content. */
type BehaviorTab = "assignment" | "paths" | "timers" | "actions" | "subprocess";

const TAB_LABEL: Record<BehaviorTab, CatalogKey> = {
  assignment: "stepSections.assignment",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  actions: "stepSections.actions",
  subprocess: "stepSections.subprocess",
};

const PERFORMED_BY_LABEL: Record<PerformedBy, CatalogKey> = {
  participant: "stepSections.performedByParticipant",
  subprocess: "stepSections.performedBySubprocess",
  terminal: "stepSections.performedByTerminal",
};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/** Selecting a step defaults to Assignment; a path-edge click resolves to its
 * source step and defaults to Paths instead (studio-canvas). */
function defaultTabFor(selection: { selectedPathId?: string }): BehaviorTab {
  return selection.selectedPathId ? "paths" : "assignment";
}

interface Props {
  fields: DraftField[];
  token: string;
  /** Selection is driven from `EditorArea` (canvas click, palette
   * placement, section-index navigation) — this component holds no
   * uncontrolled fallback of its own. */
  selectedStepId: string | undefined;
  onSelectStep: (stepId: string | undefined) => void;
  /** The path a canvas edge click selected (task 3.13): resolves to this
   * step (its source) and opens the Paths tab with that row
   * highlighted, per "Selecting a path edge shows its source step's
   * inspector". */
  selectedPathId?: string;
  /** Navigates to the form editor's routed page for a step (task 2.2): the
   * view button's replacement for its former local dialog-open state. Takes
   * the step id alone — `EditorArea` owns `processId` and the `Route`
   * shape, so this component stays free of both. */
  navigate: (stepId: string) => void;
}

export function StepsPanel({ fields, token, selectedStepId, onSelectStep, selectedPathId, navigate }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<BehaviorTab>("assignment");

  const index = steps.findIndex((s) => s.id === selectedStepId);
  const step = index >= 0 ? steps[index] : undefined;

  // Selecting a path edge shows its source step's Paths tab; any other
  // selection change resets to Assignment (studio-canvas).
  useEffect(() => {
    setActiveTab(defaultTabFor({ selectedPathId }));
  }, [selectedStepId, selectedPathId]);

  // Changing performed-by away from Subprocess while its tab shows moves the
  // shown tab back to Assignment. A functional update, not a plain
  // `setActiveTab("assignment")`: a path-edge click can change both
  // `selectedStepId` and `step?.type` in the same commit, and the effect
  // above's "paths" value must survive that same-batch race (design.md).
  useEffect(() => {
    setActiveTab((prev) => (prev === "subprocess" && step?.type !== "subprocess" ? "assignment" : prev));
  }, [step?.type]);

  const chooseTab = (tab: BehaviorTab) => setActiveTab(tab);

  const loadChildFile = async (stepId: string | undefined, file: File | undefined) => {
    if (!stepId || !file) return;
    try {
      setChildForStep(stepId, parseChildProcessJson(await file.text()));
      setChildLoadError(null);
    } catch (e) {
      setChildLoadError(e instanceof Error ? e.message : t("steps.loadChildError"));
    }
  };

  const removeStep = (id: string | undefined) => {
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => s.id !== id);
      if (d.workflow.initialStep === id) d.workflow.initialStep = d.workflow.steps[0]?.id;
    });
    if (id === selectedStepId) onSelectStep(undefined);
  };

  const updateStep = (patch: Partial<DraftStep>) => {
    updateInDraftArray(mutate, (d) => d.workflow?.steps?.[index], patch);
  };

  if (!step) {
    // Only reachable when a selection points at a step the draft no longer
    // holds — the third column shows the checks rail, not this component,
    // whenever nothing is selected (studio-canvas: "the inspector ... SHALL
    // NOT show ... at all in that state"). The no-selection "+ Add step"
    // button that used to live here is gone; the rail's Step entry
    // (EditRail, design.md: "the palette's Step entry stays the one
    // always-reachable way to add the first step") is the one remaining
    // always-reachable way to add a step.
    return (
      <div className="steps-panel steps-panel-empty">
        <p className="steps-panel-empty-copy">{t("stepSections.noSelection")}</p>
      </div>
    );
  }

  const tabs: BehaviorTab[] = ["assignment", "paths", "actions", "timers", ...(step.type === "subprocess" ? (["subprocess"] as const) : [])];
  const issueTotal = stepIssueCount(validation.issues, step);
  const isInitialStep = draft.workflow?.initialStep === step.id;
  const configuredFieldCount = (step.view?.fields ?? []).length;
  // A step with no assignment still works: the assignment-less floor in
  // `submitAndTransition` is starter-or-`system:admin`. That is not thereby
  // an invariant a self-service step must avoid, so this is a warning, never
  // an `EditorIssue`. Nothing here reaches the publish path. A terminal step
  // suppresses the warning entirely, same rule as the paths tab's empty state.
  const assignmentWarningText =
    step.terminal === true || step.assignment !== undefined
      ? undefined
      : "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.";

  return (
    <div className="steps-panel">
      <div className="step-inspector-heading">
        <strong>{step.key || t("steps.unnamedStep")}</strong>
        <span>{step.type ?? "task"}</span>
        {step.terminal && <span className="badge">{t("steps.terminalBadge")}</span>}
      </div>

      <div className="step-identity-zone">
        <label>
          key
          <input type="text" value={step.key ?? ""} onChange={(e) => updateStep({ key: e.target.value })} />
        </label>
        <label>
          label
          <LocalizedTextInput value={step.label} onChange={(label) => updateStep({ label })} />
        </label>
        {/* Sibling of the label, never nested inside it: a <label> takes
            phrasing content, and the design language keeps a field's own
            messages beside the label. */}
        {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
          <p className="studio-warning">{missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}</p>
        )}
        <label>
          description
          <LocalizedTextInput value={step.description} onChange={(description) => updateStep({ description })} />
        </label>
        {missingTranslationWarning(step.description, contentLocale, draft.baseLocale) && (
          <p className="studio-warning">{missingTranslationWarning(step.description, contentLocale, draft.baseLocale)}</p>
        )}

        {/* "performed by": a three-option restyle of the existing type/terminal
            controls (studio-canvas). Sets the same two fields; adds nothing new. */}
        <fieldset className="studio-segmented" aria-label={t("stepSections.performedByLabel")}>
          <legend>{t("stepSections.performedByLabel")}</legend>
          {PERFORMED_BY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className="studio-segmented-option"
              aria-pressed={performedByFor(step.type, step.terminal) === option}
              onClick={() => updateStep(performedByPatch(option) as Partial<DraftStep>)}
            >
              {t(PERFORMED_BY_LABEL[option])}
            </button>
          ))}
        </fieldset>
        {step.terminal && (
          <label>
            outcome (only meaningful on a contracted process)
            {draft.contract?.outcomes?.length ? (
              <select
                value={step.outcome ?? ""}
                onChange={(e) => updateStep({ outcome: e.target.value || undefined })}
              >
                <option value="">{t("stepSections.outcomePlaceholder")}</option>
                {draft.contract.outcomes.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={step.outcome ?? ""} onChange={(e) => updateStep({ outcome: e.target.value })} />
            )}
          </label>
        )}

        {isInitialStep ? (
          <p className="studio-note">{t("stepSections.isInitialStep")}</p>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              mutate((d) => {
                d.workflow ??= {};
                d.workflow.initialStep = step.id as DraftStep["id"];
              })
            }
          >
            {t("stepSections.setInitialStep")}
          </button>
        )}

        <button type="button" className="btn btn-secondary step-identity-view" onClick={() => navigate(step.id!)}>
          <span className="step-section-name">
            {configuredFieldCount} / {fields.length} {t("stepSections.viewFieldsConfigured")}
          </span>
          <span className="step-identity-view-build">{t("stepSections.viewBuildForm")}</span>
        </button>
      </div>

      <div className="step-behavior-tabs" role="tablist" aria-label={t("stepSections.behaviorZoneLabel")}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            className="step-behavior-tab"
            aria-selected={activeTab === tab}
            onClick={() => chooseTab(tab)}
          >
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </div>

      {activeTab === "assignment" && (
        <section>
          <PluginEnvelopeEditor
            label={t("steps.assignmentStrategyLabel")}
            value={step.assignment?.strategy}
            onChange={(strategy) => updateStep({ assignment: { strategy } })}
            registryTypes={registry?.assignmentStrategyTypes}
            registrySchemas={registry?.assignmentStrategySchemas}
          />
          {assignmentWarningText && <p className="studio-warning">{assignmentWarningText}</p>}
        </section>
      )}

      {activeTab === "paths" && (
        <section>
          <h4>{t("steps.pathsHeading")}</h4>
          {step.terminal ? (
            <p className="studio-note">{t("stepSections.pathsEmptyTerminal")}</p>
          ) : (
            <PathsPanel
              paths={step.paths}
              steps={steps}
              fields={fields}
              stepId={step.id}
              onChange={(paths) => updateStep({ paths })}
              registryTypes={registry?.actionTypes}
              registrySchemas={registry?.actionSchemas}
              selectedPathId={selectedPathId}
              terminal={step.terminal}
            />
          )}
        </section>
      )}

      {activeTab === "timers" && (
        <section>
          <h4>{t("steps.timersHeading")}</h4>
          <TimersPanel
            timers={step.timers}
            paths={step.paths ?? []}
            fields={fields}
            onChange={(timers) => updateStep({ timers })}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
          />
        </section>
      )}

      {activeTab === "actions" && (
        <section>
          <ActionListEditor
            label="onEntry"
            actions={step.onEntry}
            fields={fields}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
            onChange={(onEntry) => updateStep({ onEntry })}
          />
          <ActionListEditor
            label="onExit"
            actions={step.onExit}
            fields={fields}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
            onChange={(onExit) => updateStep({ onExit })}
          />
          <ActionListEditor
            label="onCancel"
            actions={step.onCancel}
            fields={fields}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
            onChange={(onCancel) => updateStep({ onCancel })}
          />
        </section>
      )}

      {activeTab === "subprocess" && step.type === "subprocess" && (
        <section>
          <SubprocessSpecEditor value={step.subprocess} fields={fields} onChange={(subprocess) => updateStep({ subprocess })} />
          {/* The only route to a loaded child body in the whole studio.
              checkSubprocessChildRefs runs against nothing without it, so
              the tab keeps it. */}
          <fieldset>
            <legend>{t("steps.crossProcessLegend")}</legend>
            {step.id && validation.subprocessStepStatus[step.id] === "checked" ? (
              <p>
                {t("steps.crossProcessChecked")}{" "}
                <button type="button" className="btn btn-secondary" onClick={() => setChildForStep(step.id!, undefined)}>
                  {t("steps.unload")}
                </button>
              </p>
            ) : (
              <>
                <NotCheckedBadge label="cross-process" />
                <input type="file" accept="application/json" onChange={(e) => loadChildFile(step.id, e.target.files?.[0])} />
              </>
            )}
            {childLoadError && <p className="error">{childLoadError}</p>}
          </fieldset>
        </section>
      )}

      <div className="step-diagnostics">
        <p className="step-section-issues">
          {issueTotal > 0 ? (
            <span className="step-section-issue-stamp">
              {t("stepSections.issueCount")}: {issueTotal}
            </span>
          ) : (
            <span className="step-section-issue-clear">{t("stepSections.noIssues")}</span>
          )}
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={rawJsonOpen}
          aria-controls="step-raw-json"
          onClick={() => setRawJsonOpen((prev) => !prev)}
        >
          {t("stepSections.developerView")}
        </button>
        {rawJsonOpen && (
          <section id="step-raw-json" className="studio-developer-view">
            <pre>{JSON.stringify(step, null, 2)}</pre>
          </section>
        )}

        <IssueList entityId={step.id} />

        <button type="button" className="btn btn-secondary" onClick={() => removeStep(step.id)}>
          {t("steps.removeStep")}
        </button>

        {/* Docked at the inspector's bottom edge whenever a step or a path is
            selected (studio-checks-rail's collapsed-summary requirement).
            `collapsed` reads the same `validation.issues[]` traversal the
            standalone, expanded rail beside the canvas reads — one counting
            path, per design.md. */}
        <ChecksRail validation={validation} collapsed />
      </div>
    </div>
  );
}

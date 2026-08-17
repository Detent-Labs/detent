import { useEffect, useRef, useState } from "react";
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
import { assignmentWarning } from "./assignmentWarningLogic.js";
import { stepIssueCount } from "../draft/panel-rail";
import { openSectionForSelection } from "./stepInspectorLogic";

type DraftStep = DraftOf<Step>;

/** The sections a step's own detail is divided into. The shared modal never
 * opens one of these: they are step-scoped, and it carries only the three
 * process-wide panels. `developerView` is an eighth entry, distinct from the
 * path-guard's own CEL "Developer view" toggle (`studio-condition-builder`). */
type StepSection = "identity" | "assignment" | "paths" | "timers" | "actions" | "subprocess" | "view" | "developerView";

const SECTION_LABEL: Record<StepSection, CatalogKey> = {
  identity: "stepSections.identity",
  assignment: "stepSections.assignment",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  actions: "stepSections.actions",
  subprocess: "stepSections.subprocess",
  view: "stepSections.view",
  developerView: "stepSections.developerView",
};

const PERFORMED_BY_LABEL: Record<PerformedBy, CatalogKey> = {
  participant: "stepSections.performedByParticipant",
  subprocess: "stepSections.performedBySubprocess",
  terminal: "stepSections.performedByTerminal",
};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/** How many entities the section holds. `undefined` means the section holds no
 * countable list — identity, assignment and developerView are single editors,
 * so a number beside them would name nothing. */
function sectionCount(step: DraftStep, section: StepSection): number | undefined {
  switch (section) {
    case "paths":
      return (step.paths ?? []).length;
    case "timers":
      return (step.timers ?? []).length;
    case "actions":
      // One entry, summing all three step-scoped positions. A path's `onPath`
      // and a timer's `onFire` belong to those sections, not this one.
      return (step.onEntry ?? []).length + (step.onExit ?? []).length + (step.onCancel ?? []).length;
    default:
      return undefined;
  }
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
   * step (its source) and opens the paths section with that row
   * highlighted, per "Selecting a path edge shows its source step's
   * inspector". */
  selectedPathId?: string;
  /** Navigates to the form editor's routed page for a step (task 2.2): the
   * view entry's replacement for its former local dialog-open state. Takes
   * the step id alone — `EditorArea` owns `processId` and the `Route`
   * shape, so this component stays free of both. */
  navigate: (stepId: string) => void;
}

export function StepsPanel({ fields, token, selectedStepId, onSelectStep, selectedPathId, navigate }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);

  // Which one section of the selected step is open. Exactly one at a time.
  // Reset on every selection change: a path-edge click opens straight to
  // "paths" (the path is not independently addressable — it only exists
  // nested under its step); any other selection change starts collapsed.
  const [openSection, setOpenSection] = useState<StepSection | undefined>(undefined);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pendingScrollSection, setPendingScrollSection] = useState<StepSection | undefined>(undefined);

  useEffect(() => {
    setOpenSection(openSectionForSelection(selectedPathId));
  }, [selectedStepId, selectedPathId]);

  // Scroll AFTER the section renders. Choosing an entry expands it in the
  // same commit, so the target does not exist yet at click time.
  useEffect(() => {
    if (!pendingScrollSection) return;
    sectionRefs.current[pendingScrollSection]?.scrollIntoView({ block: "nearest" });
    setPendingScrollSection(undefined);
  }, [pendingScrollSection]);

  const index = steps.findIndex((s) => s.id === selectedStepId);
  const step = index >= 0 ? steps[index] : undefined;

  const chooseSection = (section: StepSection) => {
    if (section === "view") {
      if (step?.id) navigate(step.id);
      return;
    }
    setOpenSection((prev) => {
      const next = prev === section ? undefined : section;
      if (next) setPendingScrollSection(next);
      return next;
    });
  };

  const shows = (section: StepSection) => openSection === section;
  const registerSection = (section: StepSection) => (el: HTMLElement | null) => {
    sectionRefs.current[section] = el;
  };

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

  const sections: StepSection[] = [
    "identity",
    "assignment",
    "paths",
    "timers",
    "actions",
    ...(step.type === "subprocess" ? (["subprocess"] as const) : []),
    "view",
    "developerView",
  ];
  const issueTotal = stepIssueCount(validation.issues, step);
  const isInitialStep = draft.workflow?.initialStep === step.id;
  const configuredFieldCount = (step.view?.fields ?? []).length;

  return (
    <div className="steps-panel">
      <div className="step-inspector-heading">
        <strong>{step.key || t("steps.unnamedStep")}</strong>
        <span>{step.type ?? "task"}</span>
        {step.terminal && <span className="badge">{t("steps.terminalBadge")}</span>}
      </div>

      <ul className="step-section-index">
        {sections.map((section) => {
          const count = sectionCount(step, section);
          // The view entry navigates to the form editor's routed page
          // rather than opening a dialog or expanding a section, so it
          // carries none of a disclosure's attributes: aria-expanded
          // describes a region the document already holds, and a
          // navigation target is not that region either.
          const isView = section === "view";
          return (
            <li key={section}>
              <button
                type="button"
                className="step-section-entry"
                aria-expanded={isView ? undefined : shows(section)}
                aria-controls={isView ? undefined : `step-section-${section}`}
                onClick={() => chooseSection(section)}
              >
                {section === "view" ? (
                  <>
                    <span className="step-section-name">
                      {configuredFieldCount} / {fields.length} {t("stepSections.viewFieldsConfigured")}
                    </span>
                    <span className="step-section-view-build">{t("stepSections.viewBuildForm")}</span>
                  </>
                ) : (
                  <>
                    <span className="step-section-name">{t(SECTION_LABEL[section])}</span>
                    {count !== undefined && <span className="step-section-count">{count}</span>}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="step-section-issues">
        {issueTotal > 0 ? (
          <span className="step-section-issue-stamp">
            {t("stepSections.issueCount")}: {issueTotal}
          </span>
        ) : (
          <span className="step-section-issue-clear">{t("stepSections.noIssues")}</span>
        )}
      </p>

      <section id="step-section-identity" ref={registerSection("identity")} hidden={!shows("identity")}>
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
      </section>

      <section id="step-section-assignment" ref={registerSection("assignment")} hidden={!shows("assignment")}>
        <PluginEnvelopeEditor
          label={t("steps.assignmentStrategyLabel")}
          value={step.assignment?.strategy}
          onChange={(strategy) => updateStep({ assignment: { strategy } })}
          registryTypes={registry?.assignmentStrategyTypes}
          registrySchemas={registry?.assignmentStrategySchemas}
        />
        {assignmentWarning(step.terminal, step.assignment) && (
          <p className="studio-warning">{assignmentWarning(step.terminal, step.assignment)}</p>
        )}
      </section>

      <section id="step-section-paths" ref={registerSection("paths")} hidden={!shows("paths")}>
        <h4>{t("steps.pathsHeading")}</h4>
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
      </section>

      <section id="step-section-timers" ref={registerSection("timers")} hidden={!shows("timers")}>
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

      <section id="step-section-actions" ref={registerSection("actions")} hidden={!shows("actions")}>
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

      {step.type === "subprocess" && (
        <section id="step-section-subprocess" ref={registerSection("subprocess")} hidden={!shows("subprocess")}>
          <SubprocessSpecEditor value={step.subprocess} fields={fields} onChange={(subprocess) => updateStep({ subprocess })} />
          {/* The only route to a loaded child body in the whole studio.
              checkSubprocessChildRefs runs against nothing without it, so
              the section keeps it. */}
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

      {/* No inline view section: the view entry navigates to the form
          editor's routed page instead. Two routes to one step's view, one
          of them driven by nothing, is what this replaces. */}

      <section
        id="step-section-developerView"
        ref={registerSection("developerView")}
        hidden={!shows("developerView")}
        className="studio-developer-view"
      >
        <pre>{JSON.stringify(step, null, 2)}</pre>
      </section>

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
  );
}

import { useEffect, useRef, useState } from "react";
import type { Step, StepType } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type TranslationKey } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray, updateInDraftArray } from "../draft/draft-array-crud";
import { ActionListEditor } from "./ActionListEditor";
import { FormEditorDialog } from "./FormEditorDialog";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { missingTranslationWarning, seedLocalizedText } from "../draft/localized-text";
import { assignmentWarning } from "./assignmentWarningLogic.js";
import { stepIssueCount } from "../draft/panel-rail";

type DraftStep = DraftOf<Step>;

/** The sections a step's own detail is divided into. The shared modal never
 * opens one of these: they are step-scoped, and it carries only the three
 * process-wide panels. */
type StepSection = "identity" | "assignment" | "paths" | "timers" | "actions" | "subprocess" | "view";

const SECTION_LABEL: Record<StepSection, TranslationKey> = {
  identity: "stepSections.identity",
  assignment: "stepSections.assignment",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  actions: "stepSections.actions",
  subprocess: "stepSections.subprocess",
  view: "stepSections.view",
};

/** How many entities the section holds. `undefined` means the section holds no
 * countable list — identity and assignment are single editors, so a number
 * beside them would name nothing. */
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
    case "view":
      return (step.view?.fields ?? []).length;
    default:
      return undefined;
  }
}

interface Props {
  fields: DraftField[];
  token: string;
  /** Controlled accordion selection (studio-canvas: canvas step/edge
   * selection drives which step's row is expanded). Uncontrolled — internal
   * `useState`, today's behavior — when `onSelectStep` is omitted. */
  selectedStepId?: string;
  onSelectStep?: (stepId: string | undefined) => void;
}

export function StepsPanel({ fields, token, selectedStepId, onSelectStep }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const registry = useRegistry(token);
  const isControlled = onSelectStep !== undefined;
  const [internalExpanded, setInternalExpanded] = useState<string | undefined>(undefined);
  const expanded = isControlled ? selectedStepId : internalExpanded;
  const setExpanded = (id: string | undefined) => {
    if (isControlled) onSelectStep!(id);
    else setInternalExpanded(id);
  };
  const [childLoadError, setChildLoadError] = useState<string | null>(null);

  // Which one section of the expanded step is open. Exactly one at a time, so
  // this is a single value rather than a set. Cleared when the selection moves
  // to another step: the section belongs to the step it was chosen on.
  const [openSection, setOpenSection] = useState<StepSection | undefined>(undefined);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [pendingScrollSection, setPendingScrollSection] = useState<StepSection | undefined>(undefined);

  useEffect(() => {
    setOpenSection(undefined);
  }, [expanded]);

  // Scroll AFTER the section renders. Choosing an entry expands it in the same
  // commit, so the target does not exist yet at click time.
  useEffect(() => {
    if (!pendingScrollSection) return;
    sectionRefs.current[pendingScrollSection]?.scrollIntoView({ block: "nearest" });
    setPendingScrollSection(undefined);
  }, [pendingScrollSection]);

  // Which step's form editor is open. The view entry is the one section entry
  // that opens a dialog rather than expanding a section, so it needs its own
  // state beside `openSection` rather than a value inside it.
  const [formEditorStepIndex, setFormEditorStepIndex] = useState<number | undefined>(undefined);

  const chooseSection = (section: StepSection, stepIndex: number) => {
    if (section === "view") {
      setFormEditorStepIndex(stepIndex);
      return;
    }
    const next = openSection === section ? undefined : section;
    setOpenSection(next);
    if (next) setPendingScrollSection(next);
  };

  // Keyed by step id, so a newly added step's header can receive focus once
  // it exists in the DOM — a pointer user sees the new card open where they
  // clicked "add step"; a keyboard user needs focus moved there explicitly.
  const headerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pendingFocusStepId, setPendingFocusStepId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!pendingFocusStepId) return;
    headerRefs.current[pendingFocusStepId]?.focus();
    setPendingFocusStepId(undefined);
  }, [pendingFocusStepId]);

  const loadChildFile = async (stepId: string | undefined, file: File | undefined) => {
    if (!stepId || !file) return;
    try {
      setChildForStep(stepId, parseChildProcessJson(await file.text()));
      setChildLoadError(null);
    } catch (e) {
      setChildLoadError(e instanceof Error ? e.message : t("steps.loadChildError"));
    }
  };

  const addStep = () => {
    const id = mintId("step");
    addToDraftArray(
      mutate,
      (d) => {
        d.workflow ??= {};
        d.workflow.steps ??= [];
        d.workflow.initialStep ??= id;
        return d.workflow.steps;
      },
      { id, key: "", label: seedLocalizedText(contentLocale), type: "task" },
    );
    setExpanded(id);
    setPendingFocusStepId(id);
  };

  const removeStep = (id: string | undefined) => {
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => s.id !== id);
      if (d.workflow.initialStep === id) d.workflow.initialStep = d.workflow.steps[0]?.id;
    });
  };

  const updateStep = (index: number, patch: Partial<DraftStep>) => {
    updateInDraftArray(mutate, (d) => d.workflow?.steps?.[index], patch);
  };

  return (
    <div className="steps-panel">
      <h3>{t("steps.heading")}</h3>
      {steps.length === 0 && <p className="empty">{t("steps.empty")}</p>}
      <label>
        initial step
        <select
          value={draft.workflow?.initialStep ?? ""}
          onChange={(e) =>
            mutate((d) => {
              d.workflow ??= {};
              d.workflow.initialStep = e.target.value as DraftStep["id"];
            })
          }
        >
          <option value="" disabled>
            {t("steps.selectInitialStep")}
          </option>
          {steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.key ?? s.id}
            </option>
          ))}
        </select>
      </label>

      {steps.map((step, index) => {
        const isOpen = expanded === step.id;
        const bodyId = `step-card-body-${step.id ?? index}`;
        const sectionId = (section: StepSection) => `step-section-${step.id ?? index}-${section}`;
        const issueTotal = stepIssueCount(validation.issues, step);
        const sections: StepSection[] = [
          "identity",
          "assignment",
          "paths",
          "timers",
          "actions",
          ...(step.type === "subprocess" ? (["subprocess"] as const) : []),
          "view",
        ];
        const shows = (section: StepSection) => isOpen && openSection === section;
        const registerSection = (section: StepSection) => (el: HTMLElement | null) => {
          sectionRefs.current[section] = el;
        };
        return (
          <div className="step-card" key={step.id ?? index}>
            <button
              type="button"
              ref={(el) => {
                headerRefs.current[step.id ?? String(index)] = el;
              }}
              className="step-card-header"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              onClick={() => setExpanded(isOpen ? undefined : step.id)}
            >
              <strong>{step.key || t("steps.unnamedStep")}</strong>
              <span>{step.type ?? "task"}</span>
              {step.terminal && <span className="badge">{t("steps.terminalBadge")}</span>}
              <span className="step-card-chevron" aria-hidden="true">
                ▸
              </span>
            </button>

            {isOpen && (
              <div className="step-card-body" id={bodyId}>
                {/* The section index. Each entry is a real disclosure button
                    carrying aria-expanded and aria-controls — spa-accessibility
                    requires that shape of anything expanding adjacent content. */}
                <ul className="step-section-index">
                  {sections.map((section) => {
                    const count = sectionCount(step, section);
                    // The view entry opens a dialog, so it is not a disclosure:
                    // `aria-expanded` describes a region the document already
                    // holds, and a modal dialog is not that region.
                    const opensDialog = section === "view";
                    return (
                      <li key={section}>
                        <button
                          type="button"
                          className="step-section-entry"
                          aria-expanded={opensDialog ? undefined : shows(section)}
                          aria-controls={opensDialog ? undefined : sectionId(section)}
                          aria-haspopup={opensDialog ? "dialog" : undefined}
                          onClick={() => chooseSection(section, index)}
                        >
                          <span className="step-section-name">{t(SECTION_LABEL[section])}</span>
                          {count !== undefined && <span className="step-section-count">{count}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="step-section-issues">
                  {issueTotal > 0 ? (
                    <span className="step-section-issue-stamp">{t("stepSections.issueCount")}: {issueTotal}</span>
                  ) : (
                    <span className="step-section-issue-clear">{t("stepSections.noIssues")}</span>
                  )}
                </p>

                <section id={sectionId("identity")} ref={registerSection("identity")} hidden={!shows("identity")}>
                  <label>
                    key
                    <input type="text" value={step.key ?? ""} onChange={(e) => updateStep(index, { key: e.target.value })} />
                  </label>
                  <label>
                    label
                    <LocalizedTextInput value={step.label} onChange={(label) => updateStep(index, { label })} />
                  </label>
                  {/* Sibling of the label, never nested inside it: a <label>
                      takes phrasing content, and the design language keeps a
                      field's own messages beside the label. */}
                  {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
                    <p className="studio-warning">
                      {missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}
                    </p>
                  )}
                  <label>
                    description
                    <LocalizedTextInput
                      value={step.description}
                      onChange={(description) => updateStep(index, { description })}
                    />
                  </label>
                  {missingTranslationWarning(step.description, contentLocale, draft.baseLocale) && (
                    <p className="studio-warning">
                      {missingTranslationWarning(step.description, contentLocale, draft.baseLocale)}
                    </p>
                  )}
                  <label>
                    type
                    <select
                      value={step.type ?? "task"}
                      onChange={(e) => updateStep(index, { type: e.target.value as StepType })}
                    >
                      <option value="task">task</option>
                      <option value="subprocess">subprocess</option>
                    </select>
                  </label>
                  <label>
                    terminal
                    <input
                      type="checkbox"
                      checked={step.terminal === true}
                      onChange={(e) => updateStep(index, { terminal: e.target.checked || undefined })}
                    />
                  </label>
                  {step.terminal && (
                    <label>
                      outcome (only meaningful on a contracted process)
                      <input type="text" value={step.outcome ?? ""} onChange={(e) => updateStep(index, { outcome: e.target.value })} />
                    </label>
                  )}
                </section>

                <section id={sectionId("assignment")} ref={registerSection("assignment")} hidden={!shows("assignment")}>
                  <PluginEnvelopeEditor
                    label={t("steps.assignmentStrategyLabel")}
                    value={step.assignment?.strategy}
                    onChange={(strategy) => updateStep(index, { assignment: { strategy } })}
                    registryTypes={registry?.assignmentStrategyTypes}
                    registrySchemas={registry?.assignmentStrategySchemas}
                  />
                  {assignmentWarning(step.terminal, step.assignment) && (
                    <p className="studio-warning">{assignmentWarning(step.terminal, step.assignment)}</p>
                  )}
                </section>

                <section id={sectionId("paths")} ref={registerSection("paths")} hidden={!shows("paths")}>
                  <h4>{t("steps.pathsHeading")}</h4>
                  <PathsPanel
                    paths={step.paths}
                    steps={steps}
                    fields={fields}
                    stepId={step.id}
                    onChange={(paths) => updateStep(index, { paths })}
                    registryTypes={registry?.actionTypes}
                    registrySchemas={registry?.actionSchemas}
                  />
                </section>

                <section id={sectionId("timers")} ref={registerSection("timers")} hidden={!shows("timers")}>
                  <h4>{t("steps.timersHeading")}</h4>
                  <TimersPanel
                    timers={step.timers}
                    paths={step.paths ?? []}
                    fields={fields}
                    onChange={(timers) => updateStep(index, { timers })}
                    registryTypes={registry?.actionTypes}
                    registrySchemas={registry?.actionSchemas}
                  />
                </section>

                <section id={sectionId("actions")} ref={registerSection("actions")} hidden={!shows("actions")}>
                  <ActionListEditor
                    label="onEntry"
                    actions={step.onEntry}
                    fields={fields}
                    registryTypes={registry?.actionTypes}
                    registrySchemas={registry?.actionSchemas}
                    onChange={(onEntry) => updateStep(index, { onEntry })}
                  />
                  <ActionListEditor
                    label="onExit"
                    actions={step.onExit}
                    fields={fields}
                    registryTypes={registry?.actionTypes}
                    registrySchemas={registry?.actionSchemas}
                    onChange={(onExit) => updateStep(index, { onExit })}
                  />
                  <ActionListEditor
                    label="onCancel"
                    actions={step.onCancel}
                    fields={fields}
                    registryTypes={registry?.actionTypes}
                    registrySchemas={registry?.actionSchemas}
                    onChange={(onCancel) => updateStep(index, { onCancel })}
                  />
                </section>

                {step.type === "subprocess" && (
                  <section id={sectionId("subprocess")} ref={registerSection("subprocess")} hidden={!shows("subprocess")}>
                    <SubprocessSpecEditor
                      value={step.subprocess}
                      fields={fields}
                      onChange={(subprocess) => updateStep(index, { subprocess })}
                    />
                    {/* The only route to a loaded child body in the whole
                        studio. checkSubprocessChildRefs runs against nothing
                        without it, so the section keeps it. */}
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
                          <input
                            type="file"
                            accept="application/json"
                            onChange={(e) => loadChildFile(step.id, e.target.files?.[0])}
                          />
                        </>
                      )}
                      {childLoadError && <p className="error">{childLoadError}</p>}
                    </fieldset>
                  </section>
                )}

                {/* No inline view section: the view entry opens the form
                    editor dialog instead. Two routes to one step's view, one
                    of them driven by nothing, is what this replaces. */}

                <IssueList entityId={step.id} />

                <button type="button" className="btn btn-secondary" onClick={() => removeStep(step.id)}>
                  {t("steps.removeStep")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={addStep}>
        {t("steps.addStep")}
      </button>

      {/* Mounted for the life of the panel, `open` driving showModal()/close() —
          the same pattern EditPanelsModal follows, so a half-typed CEL
          expression in the strip survives a reopen. */}
      <FormEditorDialog
        open={
          formEditorStepIndex !== undefined && steps[formEditorStepIndex]
            ? { step: steps[formEditorStepIndex]!, index: formEditorStepIndex }
            : undefined
        }
        fields={fields}
        onClose={() => setFormEditorStepIndex(undefined)}
      />
    </div>
  );
}

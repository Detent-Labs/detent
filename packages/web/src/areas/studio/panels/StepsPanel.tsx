import { useEffect, useRef, useState } from "react";
import type { Step, StepType } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { mintId } from "../draft/ids";
import { addToDraftArray, updateInDraftArray } from "../draft/draft-array-crud";
import { ActionListEditor } from "./ActionListEditor";
import { ViewEditor } from "./ViewEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { seedLocalizedText } from "../draft/localized-text";

type DraftStep = DraftOf<Step>;

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
                <label>
                  key
                  <input type="text" value={step.key ?? ""} onChange={(e) => updateStep(index, { key: e.target.value })} />
                </label>
                <label>
                  label
                  <LocalizedTextInput value={step.label} onChange={(label) => updateStep(index, { label })} />
                </label>
                <label>
                  description
                  <LocalizedTextInput
                    value={step.description}
                    onChange={(description) => updateStep(index, { description })}
                  />
                </label>
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

                {step.type === "subprocess" && (
                  <>
                    <SubprocessSpecEditor
                      value={step.subprocess}
                      fields={fields}
                      onChange={(subprocess) => updateStep(index, { subprocess })}
                    />
                    <fieldset>
                      <legend>{t("steps.crossProcessLegend")}</legend>
                      {step.id && validation.subprocessStepStatus[step.id] === "checked" ? (
                        <p>
                          {t("steps.crossProcessChecked")}{" "}
                          <button type="button" onClick={() => setChildForStep(step.id!, undefined)}>
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
                  </>
                )}

                <ViewEditor view={step.view} fields={fields} onChange={(view) => updateStep(index, { view })} />

                <PluginEnvelopeEditor
                  label={t("steps.assignmentStrategyLabel")}
                  value={step.assignment?.strategy}
                  onChange={(strategy) => updateStep(index, { assignment: { strategy } })}
                  registryTypes={registry?.assignmentStrategyTypes}
                  registrySchemas={registry?.assignmentStrategySchemas}
                />

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

                <h4>{t("steps.pathsHeading")}</h4>
                <PathsPanel
                  paths={step.paths}
                  steps={steps}
                  fields={fields}
                  onChange={(paths) => updateStep(index, { paths })}
                  registryTypes={registry?.actionTypes}
                  registrySchemas={registry?.actionSchemas}
                />

                <h4>{t("steps.timersHeading")}</h4>
                <TimersPanel
                  timers={step.timers}
                  paths={step.paths ?? []}
                  fields={fields}
                  onChange={(timers) => updateStep(index, { timers })}
                  registryTypes={registry?.actionTypes}
                  registrySchemas={registry?.actionSchemas}
                />

                <IssueList entityId={step.id} />

                <button type="button" onClick={() => removeStep(step.id)}>
                  {t("steps.removeStep")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" onClick={addStep}>
        {t("steps.addStep")}
      </button>
    </div>
  );
}

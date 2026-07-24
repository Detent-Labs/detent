import { useState } from "react";
import type { Step, StepType } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t } from "../i18n/catalog";
import { mintId } from "../draft/ids";
import { ActionListEditor } from "./ActionListEditor";
import { ViewEditor } from "./ViewEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { seedLocalizedText } from "../draft/localized-text";

type DraftStep = DraftOf<Step>;

interface Props {
  fields: DraftField[];
}

export function StepsPanel({ fields }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);

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
    mutate((d) => {
      d.workflow ??= {};
      d.workflow.steps ??= [];
      d.workflow.steps.push({ id, key: "", label: seedLocalizedText(contentLocale), type: "task" });
      d.workflow.initialStep ??= id;
    });
    setExpanded(id);
  };

  const removeStep = (id: string | undefined) => {
    mutate((d) => {
      if (!d.workflow?.steps) return;
      d.workflow.steps = d.workflow.steps.filter((s) => s.id !== id);
      if (d.workflow.initialStep === id) d.workflow.initialStep = d.workflow.steps[0]?.id;
    });
  };

  const updateStep = (index: number, patch: Partial<DraftStep>) => {
    mutate((d) => {
      const step = d.workflow?.steps?.[index];
      if (step) Object.assign(step, patch);
    });
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
        return (
          <div className="step-card" key={step.id ?? index}>
            <div className="step-card-header" onClick={() => setExpanded(isOpen ? undefined : step.id)}>
              <strong>{step.key || t("steps.unnamedStep")}</strong>
              <span>{step.type ?? "task"}</span>
              {step.terminal && <span className="badge">{t("steps.terminalBadge")}</span>}
            </div>

            {isOpen && (
              <div className="step-card-body">
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
                />

                <ActionListEditor
                  label="onEntry"
                  actions={step.onEntry}
                  fields={fields}
                  onChange={(onEntry) => updateStep(index, { onEntry })}
                />
                <ActionListEditor
                  label="onExit"
                  actions={step.onExit}
                  fields={fields}
                  onChange={(onExit) => updateStep(index, { onExit })}
                />
                <ActionListEditor
                  label="onCancel"
                  actions={step.onCancel}
                  fields={fields}
                  onChange={(onCancel) => updateStep(index, { onCancel })}
                />

                <h4>{t("steps.pathsHeading")}</h4>
                <PathsPanel
                  paths={step.paths}
                  steps={steps}
                  fields={fields}
                  onChange={(paths) => updateStep(index, { paths })}
                />

                <h4>{t("steps.timersHeading")}</h4>
                <TimersPanel
                  timers={step.timers}
                  paths={step.paths ?? []}
                  fields={fields}
                  onChange={(timers) => updateStep(index, { timers })}
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

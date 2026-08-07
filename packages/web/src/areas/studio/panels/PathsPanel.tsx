import type { Path, PathTrigger, Step, StepId } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { newPath } from "../draft/createPath";
import { removeAt, updateAt } from "../draft/list-ops";
import { t } from "../catalog.js";
import { ConditionInput } from "./shared/ConditionInput";
import { IssueList } from "./shared/IssueList";
import { ActionListEditor } from "./ActionListEditor";
import type { ConfigFieldDescriptor } from "../api/types.js";

type DraftPath = DraftOf<Path>;
type DraftStep = DraftOf<Step>;

interface Props {
  paths: DraftPath[] | undefined;
  steps: DraftStep[];
  fields: DraftField[];
  /** The step these paths leave. A subprocess step's guards also read `child.*`. */
  stepId?: string;
  onChange: (next: DraftPath[]) => void;
  /** The action registry's live type names and config-schema descriptions (GET /registry), for `onPath` actions. */
  registryTypes?: string[];
  registrySchemas?: Record<string, ConfigFieldDescriptor[]>;
  /** The path a canvas edge click selected (task 3.13): highlights that
   * one row within this section, rather than only expanding the section
   * that holds it. */
  selectedPathId?: string;
}

/**
 * Trigger type and automatic-path priority are surfaced directly, never
 * abstracted away — the wait-state and guard-priority concepts stay
 * visible to the author.
 */
export function PathsPanel({ paths, steps, fields, stepId, onChange, registryTypes, registrySchemas, selectedPathId }: Props) {
  const list = paths ?? [];

  const addPath = () => onChange([...list, newPath(steps[0]?.id, "manual")]);

  const removePath = (index: number) => onChange(removeAt(list, index));
  const updatePath = (index: number, patch: Partial<DraftPath>) => onChange(updateAt(list, index, patch));

  return (
    <div className="paths-panel">
      {list.length === 0 && <p className="empty">{t("paths.empty")}</p>}
      {list.map((path, index) => (
        <div className={`path-row${path.id && path.id === selectedPathId ? " path-row-selected" : ""}`} key={path.id ?? index}>
          <label>
            key
            <input type="text" value={path.key ?? ""} onChange={(e) => updatePath(index, { key: e.target.value })} />
          </label>
          <label>
            label
            <input
              type="text"
              value={path.label ?? ""}
              onChange={(e) => updatePath(index, { label: e.target.value })}
            />
          </label>
          <label>
            to
            <select
              value={path.to ?? ""}
              onChange={(e) => updatePath(index, { to: e.target.value as StepId })}
            >
              <option value="" disabled>
                {t("paths.selectTargetStep")}
              </option>
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.key ?? s.id}
                </option>
              ))}
            </select>
          </label>

          {/* "triggered by": a two-option restyle of the existing `trigger`
              field (studio-condition-builder). Sets the same field the plain
              select used to set; adds nothing new. */}
          <fieldset className="studio-segmented" aria-label={t("paths.triggeredByLabel")}>
            <legend>{t("paths.triggeredByLabel")}</legend>
            <button
              type="button"
              className="studio-segmented-option"
              aria-pressed={(path.trigger ?? "manual") === "manual"}
              onClick={() => updatePath(index, { trigger: "manual" as PathTrigger })}
            >
              {t("paths.triggeredByManual")}
            </button>
            <button
              type="button"
              className="studio-segmented-option"
              aria-pressed={path.trigger === "automatic"}
              onClick={() => updatePath(index, { trigger: "automatic" as PathTrigger })}
            >
              {t("paths.triggeredByAutomatic")}
            </button>
          </fieldset>

          {path.trigger === "automatic" && (
            <fieldset className="studio-only-when">
              <legend>{t("condition.onlyWhenHeading")}</legend>
              <label>
                priority
                <input
                  type="number"
                  value={path.priority ?? ""}
                  onChange={(e) =>
                    updatePath(index, { priority: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                />
              </label>
              <label>
                guard (omit for the default/else path)
                <ConditionInput
                  value={path.guard}
                  stepId={stepId}
                  onChange={(guard) => updatePath(index, { guard })}
                  toggleVariant="disclosure"
                />
              </label>
            </fieldset>
          )}

          <ActionListEditor
            label="onPath"
            actions={path.onPath}
            onChange={(onPath) => updatePath(index, { onPath })}
            fields={fields}
            registryTypes={registryTypes}
            registrySchemas={registrySchemas}
          />

          <IssueList entityId={path.id} />

          <button type="button" className="btn btn-secondary" onClick={() => removePath(index)}>
            {t("paths.removePath")}
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={addPath} disabled={steps.length === 0}>
        {t("paths.addPath")}
      </button>
    </div>
  );
}

import type { Path, PathTrigger, Step, StepId } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { mintId } from "../draft/ids";
import { removeAt, updateAt } from "../draft/list-ops";
import { t } from "../catalog.js";
import { ExpressionInput } from "./shared/ExpressionInput";
import { IssueList } from "./shared/IssueList";
import { ActionListEditor } from "./ActionListEditor";

type DraftPath = DraftOf<Path>;
type DraftStep = DraftOf<Step>;

interface Props {
  paths: DraftPath[] | undefined;
  steps: DraftStep[];
  fields: DraftField[];
  onChange: (next: DraftPath[]) => void;
}

/**
 * Trigger type and automatic-path priority are surfaced directly, never
 * abstracted away — the wait-state and guard-priority concepts stay
 * visible to the author.
 */
export function PathsPanel({ paths, steps, fields, onChange }: Props) {
  const list = paths ?? [];

  const addPath = () => {
    const next: DraftPath = {
      id: mintId("path"),
      key: "",
      to: steps[0]?.id,
      trigger: "manual",
    };
    onChange([...list, next]);
  };

  const removePath = (index: number) => onChange(removeAt(list, index));
  const updatePath = (index: number, patch: Partial<DraftPath>) => onChange(updateAt(list, index, patch));

  return (
    <div className="paths-panel">
      {list.length === 0 && <p className="empty">{t("paths.empty")}</p>}
      {list.map((path, index) => (
        <div className="path-row" key={path.id ?? index}>
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
            trigger
            <select
              value={path.trigger ?? "manual"}
              onChange={(e) => updatePath(index, { trigger: e.target.value as PathTrigger })}
            >
              <option value="manual">manual</option>
              <option value="automatic">automatic</option>
            </select>
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

          {path.trigger === "automatic" && (
            <>
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
                <ExpressionInput value={path.guard} onChange={(guard) => updatePath(index, { guard })} />
              </label>
            </>
          )}

          <ActionListEditor
            label="onPath"
            actions={path.onPath}
            onChange={(onPath) => updatePath(index, { onPath })}
            fields={fields}
          />

          <IssueList entityId={path.id} />

          <button type="button" onClick={() => removePath(index)}>
            {t("paths.removePath")}
          </button>
        </div>
      ))}
      <button type="button" onClick={addPath} disabled={steps.length === 0}>
        {t("paths.addPath")}
      </button>
    </div>
  );
}

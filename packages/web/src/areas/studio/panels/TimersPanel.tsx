import type { Path, PathId, Timer } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { mintId } from "../draft/ids";
import { removeAt, updateAt } from "../draft/list-ops";
import { t } from "../catalog.js";
import { ExpressionInput } from "./shared/ExpressionInput";
import { IssueList } from "./shared/IssueList";
import { ActionListEditor } from "./ActionListEditor";
import type { ConfigFieldDescriptor } from "../api/types.js";

type DraftTimer = DraftOf<Timer>;
type DraftPath = DraftOf<Path>;

interface Props {
  timers: DraftTimer[] | undefined;
  paths: DraftPath[];
  fields: DraftField[];
  onChange: (next: DraftTimer[]) => void;
  /** The action registry's live type names and config-schema descriptions (GET /registry), for `onFire.actions`. */
  registryTypes?: string[];
  registrySchemas?: Record<string, ConfigFieldDescriptor[]>;
}

type DurationMode = "duration" | "deadline";

function modeOf(timer: DraftTimer): DurationMode {
  return timer.deadline !== undefined ? "deadline" : "duration";
}

export function TimersPanel({ timers, paths, fields, onChange, registryTypes, registrySchemas }: Props) {
  const list = timers ?? [];

  const addTimer = () => {
    const next: DraftTimer = { id: mintId("timer"), duration: "PT1H", onFire: {} };
    onChange([...list, next]);
  };

  const removeTimer = (index: number) => onChange(removeAt(list, index));
  const updateTimer = (index: number, patch: Partial<DraftTimer>) => onChange(updateAt(list, index, patch));

  return (
    <div className="timers-panel">
      {list.length === 0 && <p className="empty">{t("timers.empty")}</p>}
      {list.map((timer, index) => {
        const mode = modeOf(timer);
        return (
          <div className="timer-row" key={timer.id ?? index}>
            <label>
              description
              <input
                type="text"
                value={timer.description ?? ""}
                onChange={(e) => updateTimer(index, { description: e.target.value })}
              />
            </label>

            <label>
              kind
              <select
                value={mode}
                onChange={(e) => {
                  if (e.target.value === "duration") updateTimer(index, { duration: "PT1H", deadline: undefined });
                  else updateTimer(index, { deadline: { lang: "cel", src: "" }, duration: undefined });
                }}
              >
                <option value="duration">{t("timers.durationOption")}</option>
                <option value="deadline">{t("timers.deadlineOption")}</option>
              </select>
            </label>

            {mode === "duration" ? (
              <label>
                duration
                <input
                  type="text"
                  placeholder={t("timers.durationPlaceholder")}
                  value={timer.duration ?? ""}
                  onChange={(e) => updateTimer(index, { duration: e.target.value })}
                />
              </label>
            ) : (
              <label>
                deadline
                <ExpressionInput value={timer.deadline} onChange={(deadline) => updateTimer(index, { deadline })} />
              </label>
            )}

            <label>
              onFire targetPath (bypasses the target path's guard)
              <select
                value={timer.onFire?.targetPath ?? ""}
                onChange={(e) =>
                  updateTimer(index, {
                    onFire: {
                      ...timer.onFire,
                      targetPath: e.target.value === "" ? undefined : (e.target.value as PathId),
                    },
                  })
                }
              >
                <option value="">{t("timers.reminderOption")}</option>
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key ?? p.id}
                  </option>
                ))}
              </select>
            </label>

            <ActionListEditor
              label="onFire actions"
              actions={timer.onFire?.actions}
              onChange={(actions) => updateTimer(index, { onFire: { ...timer.onFire, actions } })}
              fields={fields}
              registryTypes={registryTypes}
              registrySchemas={registrySchemas}
            />

            <IssueList entityId={timer.id} />

            <button type="button" className="btn btn-secondary" onClick={() => removeTimer(index)}>
              {t("timers.removeTimer")}
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={addTimer}>
        {t("timers.addTimer")}
      </button>
    </div>
  );
}

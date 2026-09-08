import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Path, PathId, Timer } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { mintId } from "../draft/ids";
import { removeAt, updateAt } from "../draft/list-ops";
import { maxTimeLimitCount, timeLimitDuration, timeLimitInRange, timeLimitParts, type TimeLimitUnit } from "../draft/time-limit.js";
import { t, type CatalogKey } from "../catalog.js";
import { ExpressionInput } from "./shared/ExpressionInput";
import { IssueList } from "./shared/IssueList";
import { ActionListEditor } from "./ActionListEditor";
import type { ConfigFieldDescriptor } from "../api/types.js";

type DraftTimer = DraftOf<Timer>;
type DraftPath = DraftOf<Path>;

const styles = stylex.create({
  timeLimit: {
    display: "flex",
    alignItems: "flex-end",
    gap: space.s2,
    border: "none",
    marginInline: 0,
    padding: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  count: {
    width: "6rem",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  // A duration the pair cannot state is a machine value, so it keeps the mono
  // face and the value it was written with.
  written: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    marginBlock: space.s1,
    marginInline: 0,
  },
  note: {
    color: colors.textMuted,
    fontSize: "0.8rem",
    marginBlock: space.s1,
    marginInline: 0,
  },
  // The refusal tone, read as a role: the step page's assignment warning
  // already carries this exact form.
  refusal: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in srgb, ${colors.refusal} 55%, transparent)`,
    paddingLeft: space.s2,
    marginBlock: space.s1,
    marginInline: 0,
  },
});

const UNIT_LABEL: Record<TimeLimitUnit, CatalogKey> = {
  hours: "timeLimit.unitHours",
  days: "timeLimit.unitDays",
  weeks: "timeLimit.unitWeeks",
};

const UNITS: TimeLimitUnit[] = ["hours", "days", "weeks"];

/**
 * The time limit, as a number and a unit over `Timer.duration`
 * (`studio-guided-vocabulary`). The control writes the ISO-8601 duration the
 * definition contract requires; nothing here asks an author to type one.
 *
 * A duration the pair cannot state — `P1DT4H30M`, say — prints in the mono
 * face and stays exactly as it stands. Nothing writes over it, so saving the
 * step leaves it alone.
 *
 * The number is bounded by the window `compile.ts::validateDurations`
 * enforces at publish, so the control refuses what the publish check would.
 */
function TimeLimitInput({ value, onChange }: { value: string | undefined; onChange: (next: string) => void }) {
  // A refused number never lands in the draft, so the input snaps back to the
  // last one that held. This line is what says why it did.
  const [tooFar, setTooFar] = useState(false);
  const parts = timeLimitParts(value);

  if (parts === undefined) {
    return (
      <div>
        <p {...stylex.props(styles.written)}>{value}</p>
        <p {...stylex.props(styles.note)}>{t("timeLimit.written")}</p>
      </div>
    );
  }

  const max = maxTimeLimitCount(parts.unit);
  const write = (next: { count: number; unit: TimeLimitUnit }) => {
    const holds = timeLimitInRange(next);
    setTooFar(!holds && Number.isInteger(next.count) && next.count > 0);
    if (holds) onChange(timeLimitDuration(next));
  };

  return (
    <>
      {tooFar && <p {...stylex.props(styles.refusal)}>{t("timeLimit.tooFar")}</p>}
      <fieldset {...stylex.props(styles.timeLimit)}>
        <label {...stylex.props(styles.field)}>
          {t("timeLimit.numberLabel")}
          <input
            type="number"
            min={1}
            max={max}
            {...stylex.props(styles.count)}
            value={parts.count}
            onChange={(e) => write({ count: Number(e.target.value), unit: parts.unit })}
          />
        </label>
        <label {...stylex.props(styles.field)}>
          {t("timeLimit.unitLabel")}
          <select value={parts.unit} onChange={(e) => write({ count: parts.count, unit: e.target.value as TimeLimitUnit })}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(UNIT_LABEL[unit])}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </>
  );
}

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
              <TimeLimitInput value={timer.duration} onChange={(duration) => updateTimer(index, { duration })} />
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

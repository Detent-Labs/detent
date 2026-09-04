import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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

const styles = stylex.create({
  pathsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
  },
  pathRow: {
    border: `1px solid ${colors.border}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  pathRowSelected: {
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
    borderColor: colors.accent,
  },
  studioSegmented: {
    display: "flex",
    gap: 0,
    border: "none",
    padding: 0,
    marginBlock: space.s2,
    marginInline: 0,
  },
  studioSegmentedLegend: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    paddingBlockEnd: space.s1,
    paddingBlockStart: 0,
    paddingInline: 0,
    width: "100%",
  },
  segmentedOption: {
    flex: "1 1 auto",
    background: "none",
    color: colors.text,
    border: `1px solid ${colors.border}`,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    font: "inherit",
    cursor: "pointer",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  // `.studio-segmented-option + .studio-segmented-option`: this file always
  // renders exactly two options, so the second one's own style applies the
  // sibling override statically.
  segmentedOptionSecond: {
    borderLeft: "none",
  },
  segmentedOptionPressed: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  studioOnlyWhen: {
    border: `1px solid ${colors.border}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s2,
    marginInline: 0,
  },
  studioOnlyWhenLegend: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
});

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
  /** Whether the owning step is terminal. A terminal step's paths list is
   * always empty by contract; "add path" disables rather than letting an
   * author reach the invalid state the schema rejects at publish. */
  terminal?: boolean;
  /** The studio's current content locale and the draft's base locale, both
   * needed to resolve a step's `LocalizedText` label into the plain string
   * "add path"'s derived default reads from (design.md). */
  contentLocale: string;
  baseLocale: string;
}

/**
 * Trigger type and automatic-path priority are surfaced directly, never
 * abstracted away — the wait-state and guard-priority concepts stay
 * visible to the author.
 */
export function PathsPanel({
  paths,
  steps,
  fields,
  stepId,
  onChange,
  registryTypes,
  registrySchemas,
  selectedPathId,
  terminal,
  contentLocale,
  baseLocale,
}: Props) {
  const list = paths ?? [];
  const [newPathTarget, setNewPathTarget] = useState("");

  const sourceStep = steps.find((s) => s.id === stepId);
  const targetStep = steps.find((s) => s.id === newPathTarget);

  const addPath = () => {
    if (!sourceStep || !targetStep?.id) return;
    onChange([...list, newPath(sourceStep, targetStep, targetStep.id, "manual", contentLocale, baseLocale, t("steps.unnamedStep"))]);
    setNewPathTarget("");
  };

  const removePath = (index: number) => onChange(removeAt(list, index));
  const updatePath = (index: number, patch: Partial<DraftPath>) => onChange(updateAt(list, index, patch));

  return (
    <div {...stylex.props(styles.pathsPanel)}>
      {list.length === 0 && <p className="empty">{t("paths.empty")}</p>}
      {list.map((path, index) => (
        <div
          {...stylex.props(styles.pathRow, path.id !== undefined && path.id === selectedPathId && styles.pathRowSelected)}
          key={path.id ?? index}
        >
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
          <fieldset {...stylex.props(styles.studioSegmented)} aria-label={t("paths.triggeredByLabel")}>
            <legend {...stylex.props(styles.studioSegmentedLegend)}>{t("paths.triggeredByLabel")}</legend>
            <button
              type="button"
              {...stylex.props(styles.segmentedOption, (path.trigger ?? "manual") === "manual" && styles.segmentedOptionPressed)}
              aria-pressed={(path.trigger ?? "manual") === "manual"}
              onClick={() => updatePath(index, { trigger: "manual" as PathTrigger })}
            >
              {t("paths.triggeredByManual")}
            </button>
            <button
              type="button"
              {...stylex.props(
                styles.segmentedOption,
                styles.segmentedOptionSecond,
                path.trigger === "automatic" && styles.segmentedOptionPressed,
              )}
              aria-pressed={path.trigger === "automatic"}
              onClick={() => updatePath(index, { trigger: "automatic" as PathTrigger })}
            >
              {t("paths.triggeredByAutomatic")}
            </button>
          </fieldset>

          {path.trigger === "automatic" && (
            <fieldset {...stylex.props(styles.studioOnlyWhen)}>
              <legend {...stylex.props(styles.studioOnlyWhenLegend)}>{t("condition.onlyWhenHeading")}</legend>
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
      <label>
        {t("paths.newPathTargetLabel")}
        <select value={newPathTarget} onChange={(e) => setNewPathTarget(e.target.value)}>
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
      <button type="button" className="btn btn-secondary" onClick={addPath} disabled={steps.length === 0 || terminal || !newPathTarget}>
        {t("paths.addPath")}
      </button>
    </div>
  );
}

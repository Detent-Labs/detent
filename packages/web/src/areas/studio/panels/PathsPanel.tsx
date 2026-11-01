import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Path, Step, StepId } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { newPath, pathWithTrigger, triggerForNewPath } from "../draft/createPath";
import { removeAt, replaceAt, updateAt } from "../draft/list-ops";
import { t } from "../catalog.js";
import { stepTextMap, wayOutHeading } from "./shared/optionText";
import { StudioSelect } from "./shared/StudioSelect";
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
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
  },
  pathRowSelected: {
    boxShadow: `inset 3px 0 0 ${colors.accent}`,
    borderColor: colors.accent,
  },
  // Copied from `StepPage.tsx`'s masthead rather than imported: compiled
  // StyleX styles stay beside their own module (design.md).
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  fieldLabelText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  // The row's heading sentence: the way out's name, an arrow, the target
  // step. It follows the Forms tab card name (`FormsTab.tsx`, the `name`
  // style): a heading carrying an authored name at the body size, in weight
  // 800. No font size, so it inherits the body step. Text, not a control.
  rowHeading: {
    marginBlockStart: 0,
    marginBlockEnd: space.s2,
    marginInline: 0,
    fontFamily: fonts.body,
    fontWeight: 800,
    overflowWrap: "anywhere",
  },
  // Modeled on `StepPage.tsx`'s Developer view, declared here because
  // compiled StyleX styles stay beside their own module (design.md). The
  // step page draws a 2px `colors.divider` top rule; this draws a 1px
  // `colors.border` one, since the row's own 1px frame would make a 2px rule
  // read heavier than the frame. The padding is `space.s2` on both edges
  // where the step page pads `space.s3`, with no focus-ring floor: the
  // Remove button below, not this block, closes the row.
  developer: {
    paddingBlock: space.s2,
    marginBlock: space.s2,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  developerKey: {
    marginBlockStart: space.s2,
  },
  // The gap between the Name label and the Leads to label below it.
  nameLabel: {
    marginBlockEnd: space.s2,
  },
  // The same shorthand StyleX drops on the step page's own picker: a
  // `<fieldset>` keeps the UA's `2px groove` when it goes, so the longhand
  // says it instead. `global.css` now clears the groove for every fieldset,
  // and this stays because a picker with no frame is this component's own
  // intent, not something to read out of a global sheet.
  studioSegmented: {
    display: "flex",
    gap: 0,
    borderStyle: "none",
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
    // `background: none` leaves the UA's own `buttonface` color standing, so
    // this picker kept a grey plate: rgb(240, 240, 240) light, rgb(107, 107,
    // 107) dark. On the step page, where the section now stands open, that
    // dropped the pressed option's accent text to 1.69:1.
    backgroundColor: "transparent",
    color: colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    font: "inherit",
    cursor: "pointer",
    ":hover": {
      backgroundColor: colors.surfaceMuted,
    },
  },
  // `.studio-segmented-option + .studio-segmented-option`: this file always
  // renders exactly two options, so the second one's own style applies the
  // sibling override statically.
  segmentedOptionSecond: {
    borderLeftStyle: "none",
  },
  segmentedOptionPressed: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  // A fieldset that means to carry the ledger hairline. StyleX emits no
  // `border` shorthand at all, so this asked for 1px and drew the UA's 2px
  // groove instead; the longhands are what actually reach the element, and
  // they have to stand here or `global.css`'s fieldset reset takes the frame.
  studioOnlyWhen: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s2,
    marginInline: 0,
    // The UA gives a fieldset `min-inline-size: min-content`, so a wide select
    // inside would push it past a narrow column.
    minInlineSize: 0,
    minWidth: 0,
  },
  studioOnlyWhenLegend: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  // Copied from `StepPage.tsx`'s `note` rather than imported: compiled StyleX
  // styles stay beside their own module (design.md).
  note: {
    color: colors.textMuted,
    marginBlock: space.s2,
    marginInline: 0,
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

  // One text per step: the step selects and every row heading read the same
  // map, so "Review (step 6)" names one step everywhere.
  const stepTexts = stepTextMap(steps, contentLocale, baseLocale);
  const stepOptions = steps.map((s) => (
    <option key={s.id} value={s.id}>
      {s.id !== undefined ? stepTexts.get(s.id) : undefined}
    </option>
  ));

  const addPath = () => {
    if (!sourceStep || !targetStep?.id) return;
    const trigger = triggerForNewPath(sourceStep);
    onChange([...list, newPath(sourceStep, targetStep, targetStep.id, trigger, contentLocale, baseLocale, t("steps.unnamedStep"))]);
    setNewPathTarget("");
  };

  const removePath = (index: number) => onChange(removeAt(list, index));
  const updatePath = (index: number, patch: Partial<DraftPath>) => onChange(updateAt(list, index, patch));
  // A whole-path replace, not a patch: `updateAt` merges, so it cannot drop
  // the `priority` key a switch to manual removes.
  const replacePath = (index: number, next: DraftPath) => onChange(replaceAt(list, index, next));

  return (
    <div {...stylex.props(styles.pathsPanel)}>
      {list.length === 0 && <p className="empty">{t("paths.empty")}</p>}
      {list.map((path, index) => (
        <div
          {...stylex.props(styles.pathRow, path.id !== undefined && path.id === selectedPathId && styles.pathRowSelected)}
          key={path.id ?? index}
        >
          {/* An h4: the step page's section heading above is an h3. */}
          <h4 {...stylex.props(styles.rowHeading)}>{wayOutHeading(path, stepTexts)}</h4>
          <label {...stylex.props(styles.fieldLabel, styles.nameLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>
              {t("paths.labelCaption")}
            </span>
            <input
              type="text"
              value={path.label ?? ""}
              onChange={(e) => updatePath(index, { label: e.target.value })}
            />
          </label>
          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>
              {t("paths.toCaption")}
            </span>
            <StudioSelect value={path.to ?? ""} onChange={(e) => updatePath(index, { to: e.target.value as StepId })}>
              <option value="" disabled>
                {t("paths.selectTargetStep")}
              </option>
              {stepOptions}
            </StudioSelect>
          </label>

          {/* "How it is taken": a two-option restyle of the existing `trigger`
              field (studio-condition-builder). Sets the same field the plain
              select used to set; adds nothing new. */}
          <fieldset {...stylex.props(styles.studioSegmented)} aria-label={t("paths.triggeredByLabel")}>
            <legend {...stylex.props(styles.studioSegmentedLegend)}>{t("paths.triggeredByLabel")}</legend>
            <button
              type="button"
              {...stylex.props(styles.segmentedOption, (path.trigger ?? "manual") === "manual" && styles.segmentedOptionPressed)}
              aria-pressed={(path.trigger ?? "manual") === "manual"}
              onClick={() => replacePath(index, pathWithTrigger(path, "manual"))}
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
              onClick={() => replacePath(index, pathWithTrigger(path, "automatic"))}
            >
              {t("paths.triggeredByAutomatic")}
            </button>
          </fieldset>

          {/* The guard editor stands for either trigger: on an automatic path
              the guard decides whether the path fires, on a manual path
              whether the participant gets the button. Only `priority`
              depends on the trigger. */}
          <fieldset {...stylex.props(styles.studioOnlyWhen)}>
            <legend {...stylex.props(styles.studioOnlyWhenLegend)}>{t("condition.onlyWhenHeading")}</legend>
            {path.trigger === "automatic" ? (
              <label>
                {t("paths.priorityCaption")}
                <input
                  type="number"
                  value={path.priority ?? ""}
                  onChange={(e) =>
                    updatePath(index, { priority: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                />
              </label>
            ) : (
              <p {...stylex.props(styles.note)}>{t("paths.manualGuardNote")}</p>
            )}
            {/* A div, not a label: a label here would give the builder's own
                buttons a name run together from the hint and the sentence. */}
            <div>
              <p {...stylex.props(styles.note)}>
                {path.trigger === "automatic" ? t("paths.automaticGuardHint") : t("paths.manualGuardHint")}
              </p>
              <ConditionInput
                value={path.guard}
                stepId={stepId}
                onChange={(guard) => updatePath(index, { guard })}
              />
            </div>
          </fieldset>

          <ActionListEditor
            label={t("paths.onPathLegend")}
            actions={path.onPath}
            onChange={(onPath) => updatePath(index, { onPath })}
            fields={fields}
            contentLocale={contentLocale}
            baseLocale={baseLocale}
            registryTypes={registryTypes}
            registrySchemas={registrySchemas}
          />

          <IssueList entityId={path.id} />

          {/* The way out's key, one disclosure away and still writable. It
              stands closed until an author opens it, `<details>`'s own
              default. */}
          <details {...stylex.props(styles.developer)}>
            <summary {...stylex.props(styles.developerSummary)}>{t("paths.developerView")}</summary>
            <label {...stylex.props(styles.fieldLabel, styles.developerKey)}>
              <span {...stylex.props(styles.fieldLabelText)}>
                {t("paths.keyCaption")}
              </span>
              <input
                type="text"
                {...stylex.props(styles.monoInput)}
                value={path.key ?? ""}
                onChange={(e) => updatePath(index, { key: e.target.value })}
              />
            </label>
          </details>

          <button type="button" className="btn btn-secondary" onClick={() => removePath(index)}>
            {t("paths.removePath")}
          </button>
        </div>
      ))}
      <label {...stylex.props(styles.fieldLabel)}>
        <span {...stylex.props(styles.fieldLabelText)}>{t("paths.newPathTargetLabel")}</span>
        <StudioSelect value={newPathTarget} onChange={(e) => setNewPathTarget(e.target.value)}>
          <option value="" disabled>
            {t("paths.selectTargetStep")}
          </option>
          {stepOptions}
        </StudioSelect>
      </label>
      <button type="button" className="btn btn-secondary" onClick={addPath} disabled={steps.length === 0 || terminal || !newPathTarget}>
        {t("paths.addPath")}
      </button>
    </div>
  );
}

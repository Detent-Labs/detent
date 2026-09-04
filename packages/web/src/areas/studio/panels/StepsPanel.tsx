import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
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
import { missingTranslationWarning, resolveDraftLocalizedText } from "../draft/localized-text";
import { stepIssueCount } from "../draft/panel-rail";
import { nextStepKey, configuredFieldCount } from "./stepsPanelLogic.js";

type DraftStep = DraftOf<Step>;

const styles = stylex.create({
  // `.steps-panel label`: a descendant selector on every bare `<label>`
  // inside the identity zone.
  stepsPanelLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  stepsPanelEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
  },
  stepsPanelEmptyCopy: {
    color: colors.textMuted,
    margin: 0,
  },
  stepInspectorHeading: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    paddingBottom: space.s2,
    borderBottom: `2px solid ${colors.divider}`,
    marginBottom: space.s2,
  },
  stepIdentityZone: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    paddingBottom: space.s3,
    borderBottom: `2px solid ${colors.divider}`,
    marginBottom: space.s3,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeft: `3px solid ${colors.accent400}`,
    paddingLeft: space.s2,
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
  // `.studio-segmented-option + .studio-segmented-option`: every option
  // after the first in this row.
  segmentedOptionAfterFirst: {
    borderLeft: "none",
  },
  segmentedOptionPressed: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  studioNote: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
  stepIdentityView: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
  },
  stepIdentityViewBuild: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.accent,
  },
  stepBehaviorTabs: {
    display: "flex",
    gap: space.s3,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: space.s3,
  },
  stepBehaviorTab: {
    background: "none",
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    paddingBlock: space.s1,
    paddingInline: 0,
    fontFamily: fonts.body,
    color: colors.textMuted,
    cursor: "pointer",
  },
  // `[aria-selected="true"]`: a JS-computed choice reading the same
  // `aria-selected` the tab already carries.
  stepBehaviorTabSelected: {
    borderBottomColor: colors.accent,
    color: colors.text,
  },
  studioDeveloperViewPre: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    background: colors.surfaceMuted,
    border: `1px solid ${colors.border}`,
    padding: space.s2,
  },
  stepDiagnostics: {
    borderTop: `2px solid ${colors.divider}`,
    marginTop: space.s3,
    paddingTop: space.s3,
  },
  stepSectionIssues: {
    marginBlock: space.s2,
    marginInline: 0,
  },
  stepSectionIssueStamp: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.refusal,
    border: "2px solid currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  stepSectionIssueClear: {
    color: colors.textMuted,
  },
});

/** The behavior zone's tab row. Subprocess joins only when the step's
 * performed-by control reads Subprocess. Unlike the retired `openSection`,
 * this state carries no "nothing shown" value — the behavior zone always
 * shows exactly one tab's content. */
type BehaviorTab = "assignment" | "paths" | "timers" | "actions" | "subprocess";

const TAB_LABEL: Record<BehaviorTab, CatalogKey> = {
  assignment: "stepSections.assignment",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  actions: "stepSections.actions",
  subprocess: "stepSections.subprocess",
};

const PERFORMED_BY_LABEL: Record<PerformedBy, CatalogKey> = {
  participant: "stepSections.performedByParticipant",
  subprocess: "stepSections.performedBySubprocess",
  terminal: "stepSections.performedByTerminal",
};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/** Selecting a step defaults to Assignment; a path-edge click resolves to its
 * source step and defaults to Paths instead (studio-canvas). */
function defaultTabFor(selection: { selectedPathId?: string }): BehaviorTab {
  return selection.selectedPathId ? "paths" : "assignment";
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
   * step (its source) and opens the Paths tab with that row
   * highlighted, per "Selecting a path edge shows its source step's
   * inspector". */
  selectedPathId?: string;
  /** Navigates to the form editor's routed page for a step (task 2.2): the
   * view button's replacement for its former local dialog-open state. Takes
   * the step id alone — `EditorArea` owns `processId` and the `Route`
   * shape, so this component stays free of both. */
  navigate: (stepId: string) => void;
  /** Passed straight through to the `ChecksRail` docked at this inspector's
   * bottom edge, which states a publish verdict beside its validation one.
   * This panel reads it for nothing else. */
  canPublish: boolean;
}

export function StepsPanel({ fields, token, selectedStepId, onSelectStep, selectedPathId, navigate, canPublish }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const baseLocale = draft.baseLocale ?? "en";
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<BehaviorTab>("assignment");

  const index = steps.findIndex((s) => s.id === selectedStepId);
  const step = index >= 0 ? steps[index] : undefined;

  // Selecting a path edge shows its source step's Paths tab; any other
  // selection change resets to Assignment (studio-canvas).
  useEffect(() => {
    setActiveTab(defaultTabFor({ selectedPathId }));
  }, [selectedStepId, selectedPathId]);

  // Changing performed-by away from Subprocess while its tab shows moves the
  // shown tab back to Assignment. A functional update, not a plain
  // `setActiveTab("assignment")`: a path-edge click can change both
  // `selectedStepId` and `step?.type` in the same commit, and the effect
  // above's "paths" value must survive that same-batch race (design.md).
  useEffect(() => {
    setActiveTab((prev) => (prev === "subprocess" && step?.type !== "subprocess" ? "assignment" : prev));
  }, [step?.type]);

  const chooseTab = (tab: BehaviorTab) => setActiveTab(tab);

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

  /** The identity zone's own label input, gated by `nextStepKey`'s lock
   * check and deduped against every sibling step's key (design.md). */
  const updateStepLabel = (next: DraftStep["label"]) => {
    if (!step) return;
    const siblingKeys = new Set(steps.filter((s) => s.id !== step.id).map((s) => s.key ?? ""));
    const derivedKey = nextStepKey(step.key ?? "", step.label, next, baseLocale, siblingKeys);
    const patch: Partial<DraftStep> = derivedKey === undefined ? { label: next } : { label: next, key: derivedKey };
    updateStep(patch);
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
      <div className="steps-panel" {...stylex.props(styles.stepsPanelEmpty)}>
        <p {...stylex.props(styles.stepsPanelEmptyCopy)}>{t("stepSections.noSelection")}</p>
      </div>
    );
  }

  const tabs: BehaviorTab[] = ["assignment", "paths", "actions", "timers", ...(step.type === "subprocess" ? (["subprocess"] as const) : [])];
  const issueTotal = stepIssueCount(validation.issues, step);
  const isInitialStep = draft.workflow?.initialStep === step.id;
  const configuredFieldCountValue = configuredFieldCount(step.view?.fields);
  // A step with no assignment still works: the assignment-less floor in
  // `submitAndTransition` is starter-or-`system:admin`. That is not thereby
  // an invariant a self-service step must avoid, so this is a warning, never
  // an `EditorIssue`. Nothing here reaches the publish path. A terminal step
  // suppresses the warning entirely, same rule as the paths tab's empty state.
  const assignmentWarningText =
    step.terminal === true || step.assignment !== undefined
      ? undefined
      : "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.";

  return (
    <div className="steps-panel">
      <div {...stylex.props(styles.stepInspectorHeading)}>
        <strong>{resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}</strong>
        <span>{step.type ?? "task"}</span>
        {step.terminal && <span className="badge">{t("steps.terminalBadge")}</span>}
      </div>

      <div {...stylex.props(styles.stepIdentityZone)}>
        <label {...stylex.props(styles.stepsPanelLabel)}>
          key
          <input type="text" value={step.key ?? ""} onChange={(e) => updateStep({ key: e.target.value })} />
        </label>
        <label {...stylex.props(styles.stepsPanelLabel)}>
          label
          <LocalizedTextInput value={step.label} onChange={updateStepLabel} />
        </label>
        {/* Sibling of the label, never nested inside it: a <label> takes
            phrasing content, and the design language keeps a field's own
            messages beside the label. */}
        {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}</p>
        )}
        <label {...stylex.props(styles.stepsPanelLabel)}>
          description
          <LocalizedTextInput value={step.description} onChange={(description) => updateStep({ description })} />
        </label>
        {missingTranslationWarning(step.description, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.studioWarning)}>{missingTranslationWarning(step.description, contentLocale, draft.baseLocale)}</p>
        )}

        {/* "performed by": a three-option restyle of the existing type/terminal
            controls (studio-canvas). Sets the same two fields; adds nothing new. */}
        <fieldset {...stylex.props(styles.studioSegmented)} aria-label={t("stepSections.performedByLabel")}>
          <legend {...stylex.props(styles.studioSegmentedLegend)}>{t("stepSections.performedByLabel")}</legend>
          {PERFORMED_BY_OPTIONS.map((option, optionIndex) => (
            <button
              key={option}
              type="button"
              {...stylex.props(
                styles.segmentedOption,
                optionIndex > 0 && styles.segmentedOptionAfterFirst,
                performedByFor(step.type, step.terminal) === option && styles.segmentedOptionPressed,
              )}
              aria-pressed={performedByFor(step.type, step.terminal) === option}
              onClick={() => updateStep(performedByPatch(option) as Partial<DraftStep>)}
            >
              {t(PERFORMED_BY_LABEL[option])}
            </button>
          ))}
        </fieldset>
        {step.terminal && (
          <label {...stylex.props(styles.stepsPanelLabel)}>
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
          <p {...stylex.props(styles.studioNote)}>{t("stepSections.isInitialStep")}</p>
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

        <button type="button" className="btn btn-secondary" {...stylex.props(styles.stepIdentityView)} onClick={() => navigate(step.id!)}>
          <span className="step-section-name">
            {configuredFieldCountValue} / {fields.length} {t("stepSections.viewFieldsConfigured")}
          </span>
          <span {...stylex.props(styles.stepIdentityViewBuild)}>{t("stepSections.viewBuildForm")}</span>
        </button>
      </div>

      <div {...stylex.props(styles.stepBehaviorTabs)} role="tablist" aria-label={t("stepSections.behaviorZoneLabel")}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            {...stylex.props(styles.stepBehaviorTab, activeTab === tab && styles.stepBehaviorTabSelected)}
            aria-selected={activeTab === tab}
            onClick={() => chooseTab(tab)}
          >
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </div>

      {activeTab === "assignment" && (
        <section>
          <PluginEnvelopeEditor
            label={t("steps.assignmentStrategyLabel")}
            value={step.assignment?.strategy}
            onChange={(strategy) => updateStep({ assignment: { strategy } })}
            registryTypes={registry?.assignmentStrategyTypes}
            registrySchemas={registry?.assignmentStrategySchemas}
          />
          {assignmentWarningText && <p {...stylex.props(styles.studioWarning)}>{assignmentWarningText}</p>}
        </section>
      )}

      {activeTab === "paths" && (
        <section>
          <h4>{t("steps.pathsHeading")}</h4>
          {step.terminal ? (
            <p {...stylex.props(styles.studioNote)}>{t("stepSections.pathsEmptyTerminal")}</p>
          ) : (
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
              contentLocale={contentLocale}
              baseLocale={baseLocale}
            />
          )}
        </section>
      )}

      {activeTab === "timers" && (
        <section>
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
      )}

      {activeTab === "actions" && (
        <section>
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
      )}

      {activeTab === "subprocess" && step.type === "subprocess" && (
        <section>
          <SubprocessSpecEditor value={step.subprocess} fields={fields} onChange={(subprocess) => updateStep({ subprocess })} />
          {/* The only route to a loaded child body in the whole studio.
              checkSubprocessChildRefs runs against nothing without it, so
              the tab keeps it. */}
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

      <div {...stylex.props(styles.stepDiagnostics)}>
        <p {...stylex.props(styles.stepSectionIssues)}>
          {issueTotal > 0 ? (
            <span {...stylex.props(styles.stepSectionIssueStamp)}>
              {t("stepSections.issueCount")}: {issueTotal}
            </span>
          ) : (
            <span {...stylex.props(styles.stepSectionIssueClear)}>{t("stepSections.noIssues")}</span>
          )}
        </p>

        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={rawJsonOpen}
          aria-controls="step-raw-json"
          onClick={() => setRawJsonOpen((prev) => !prev)}
        >
          {t("stepSections.developerView")}
        </button>
        {rawJsonOpen && (
          <section id="step-raw-json" className="studio-developer-view">
            <pre {...stylex.props(styles.studioDeveloperViewPre)}>{JSON.stringify(step, null, 2)}</pre>
          </section>
        )}

        <IssueList entityId={step.id} />

        <button type="button" className="btn btn-secondary" onClick={() => removeStep(step.id)}>
          {t("steps.removeStep")}
        </button>

        {/* Docked at the inspector's bottom edge whenever a step or a path is
            selected (studio-checks-rail's collapsed-summary requirement).
            `collapsed` reads the same `validation.issues[]` traversal the
            standalone, expanded rail beside the canvas reads — one counting
            path, per design.md. */}
        <ChecksRail validation={validation} canPublish={canPublish} collapsed />
      </div>
    </div>
  );
}

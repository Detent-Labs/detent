import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import type { ProcessSummary } from "../api/types.js";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { performedByFor, performedByPatch, type PerformedBy } from "../draft/performedBy";
import { assignmentWord, isCuratedAssignmentStrategy, stepKindPhrase, assignmentStrategyLabel } from "../draft/guided-labels";
import { ActionListEditor } from "./ActionListEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueItems, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { missingTranslationWarning } from "../draft/localized-text";
import { nextStepKey, configuredFieldCount } from "./stepsPanelLogic.js";
import { sectionColumns, sectionsFor, type SectionName } from "./sectionsFor.js";
import { headingIssues, sectionOfIssue } from "./sectionIssues.js";

type DraftStep = DraftOf<Step>;

/** The width below which two columns are too narrow. The page falls to one,
 * and the gutter rule goes with the second column. The steps rail turns at
 * this same width (design.md). */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingBlock: 0,
    paddingInline: space.s3,
  },
  empty: {
    color: colors.textMuted,
    marginBlock: space.s3,
    marginInline: 0,
  },
  // The masthead takes its own height first; the sections below it scroll
  // with the page.
  masthead: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    paddingBlock: space.s3,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  mastheadTop: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    flexWrap: "wrap",
  },
  // The kicker: the step's place in the walk and its kind, over the name
  // line. The number aligns with the rail's own, so it takes mono.
  kicker: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flex: "1 1 auto",
    minWidth: 0,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  kickerNumber: {
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  // The design language's field label: 11px, uppercase, tracked 0.1em, in
  // slate. It sits on a span rather than the <label> because both
  // `textTransform` and `letterSpacing` inherit into the control the label
  // wraps, and a tracked uppercase input is not the rule.
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
  // The mark naming the draft's first step. A stamp, in the accent: the step
  // work starts at is a state the page names, not an action.
  firstStep: {
    flex: "none",
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.accent,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  // The rule derives from the message's own tone, not the accent:
  // `design-language.md` keeps the accent a stamp rather than a paint, and a
  // component reads a semantic role rather than a ramp step.
  //
  // It is a structural rule at 2px, the weight that separates one subject
  // from another, since a warning stands apart from the prose beside it and
  // is no row of a register. `design-language.md` declares those two weights
  // and nothing between them, and neither ever softens into a tint — so the
  // refusal role stands at full strength rather than mixed toward the ground.
  warning: {
    color: colors.refusal,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.refusal,
    paddingLeft: space.s2,
    marginBlock: 0,
  },
  note: {
    color: colors.textMuted,
    marginBlock: space.s2,
    marginInline: 0,
  },
  hint: {
    color: colors.textMuted,
    fontSize: "0.8rem",
  },
  // A `<fieldset>`, so the UA draws it a 2px groove until something says
  // otherwise. StyleX drops the `border: none` shorthand the way it dropped
  // `background: none` on the option below, and all ten fieldsets on this
  // page kept the groove: measured `2px groove rgb(240, 240, 240)`, a bevel
  // in a color no token declares, on a system that is flat everywhere. The
  // longhand clears it.
  segmented: {
    display: "flex",
    gap: 0,
    borderStyle: "none",
    padding: 0,
    marginBlock: space.s1,
    marginInline: 0,
  },
  segmentedLegend: {
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
    // `background: none` leaves the UA's own `buttonface` color standing, so a
    // button keeps a grey plate the page has no surface for. Measured: rgb(240,
    // 240, 240) light and rgb(107, 107, 107) dark, the latter dropping the
    // pressed option's accent text to 1.69:1. The longhand clears it.
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
  // Every option after the first in this row.
  segmentedOptionAfterFirst: {
    borderLeftWidth: 0,
  },
  segmentedOptionPressed: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  // The two columns. The leading one takes about three fifths: it carries
  // Path to and Assignment, the pair an author reads first and changes most.
  // The 1px track between them is the ledger rule (design.md).
  columns: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 3fr) 1px minmax(0, 2fr)", [NARROW]: "minmax(0, 1fr)" },
    columnGap: space.s4,
    alignItems: "stretch",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  // Drawn only where the two columns stand. Below the breakpoint the page
  // holds one column, so the gutter separates nothing.
  gutter: {
    display: { default: "block", [NARROW]: "none" },
    backgroundColor: colors.border,
  },
  // The 2px divider between sections down each column, the structural rule.
  section: {
    paddingBlock: space.s3,
    paddingInline: 0,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: space.s2,
    paddingBottom: space.s2,
  },
  sectionHeading: {
    flex: "none",
    margin: 0,
    fontFamily: fonts.body,
    fontSize: "11px",
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  sectionIssues: {
    flex: "1 1 12rem",
    minWidth: 0,
    marginBlock: 0,
  },
  // The one word the Assignment section leads with. Mono only where it falls
  // back to a registry type, which is a value the engine matches.
  plainWord: {
    marginBlock: 0,
  },
  monoWord: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    marginBlock: 0,
  },
  formSummary: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
  },
  errorText: {
    color: colors.refusal,
    marginBlock: space.s1,
  },
  walk: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    paddingBlock: space.s3,
  },
  developer: {
    paddingBlock: space.s3,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  developerId: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    color: colors.textMuted,
    marginBlock: space.s2,
  },
  rawJson: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    padding: space.s2,
    marginBlock: space.s2,
  },
});

const SECTION_LABEL: Record<SectionName, CatalogKey> = {
  entry: "stepSections.entry",
  assignment: "stepSections.assignment",
  form: "stepSections.form",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  exit: "stepSections.exit",
  subprocess: "stepSections.subprocess",
  howItEnds: "stepSections.howItEnds",
};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/** The word one registered assignment strategy reads as in the envelope
 * editor's type picker. A type the curated table misses keeps its registry
 * type, which is what an unnamed plugin has to be picked by. */
function strategyOptionLabel(type: string): string {
  return isCuratedAssignmentStrategy(type) ? assignmentStrategyLabel(type).name : type;
}

/** One end of the walk: the step a previous or next control opens, already
 * resolved to a label so this page reads no locale for it. */
export interface WalkNeighbour {
  id: string;
  label: string;
}

interface Props {
  fields: DraftField[];
  token: string;
  /** The step the page holds, and its 1-based place in the rail's order. */
  step: DraftStep | undefined;
  stepNumber: number;
  previous: WalkNeighbour | undefined;
  next: WalkNeighbour | undefined;
  onSelectStep: (stepId: string) => void;
  onRemoveStep: (stepId: string) => void;
  /** The path a canvas edge click selected: resolves to this step (its
   * source) and highlights that row in the Path to section. */
  selectedPathId?: string;
  /** Navigates to the form editor's routed page for a step: the Step form
   * fields section's "Build the form" control. */
  navigate: (stepId: string) => void;
  /** The processes a subprocess step may call. Empty until the fetch
   * resolves, and after a failed one. */
  processes: readonly ProcessSummary[];
}

/**
 * The Steps tab's wide page (`studio-step-page`). One step, whole: a
 * masthead, every section its kind declares standing open in two columns, the
 * walk to the previous and next step, and a read-only Developer view.
 *
 * The section bodies are the configuration pane's own, reparented. The
 * collapse chrome and the runtime ordering go: two columns cannot carry one
 * runtime order, so the page groups by subject instead (design.md).
 */
export function StepPage({
  fields,
  token,
  step,
  stepNumber,
  previous,
  next,
  onSelectStep,
  onRemoveStep,
  selectedPathId,
  navigate,
  processes,
}: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const baseLocale = draft.baseLocale ?? "en";
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);

  const index = steps.findIndex((s) => s.id === step?.id);

  const loadChildFile = async (id: string | undefined, file: File | undefined) => {
    if (!id || !file) return;
    try {
      setChildForStep(id, parseChildProcessJson(await file.text()));
      setChildLoadError(null);
    } catch (e) {
      setChildLoadError(e instanceof Error ? e.message : t("steps.loadChildError"));
    }
  };

  const updateStep = (patch: Partial<DraftStep>) => {
    updateInDraftArray(mutate, (d) => d.workflow?.steps?.[index], patch);
  };

  /** The masthead's own name line, gated by `nextStepKey`'s lock check and
   * deduped against every sibling step's key. */
  const updateStepLabel = (next_: DraftStep["label"]) => {
    if (!step) return;
    const siblingKeys = new Set(steps.filter((s) => s.id !== step.id).map((s) => s.key ?? ""));
    const derivedKey = nextStepKey(step.key ?? "", step.label, next_, baseLocale, siblingKeys);
    updateStep(derivedKey === undefined ? { label: next_ } : { label: next_, key: derivedKey });
  };

  if (!step) {
    // Only reachable on a draft holding no step, or while a selection points
    // at a step the draft no longer holds.
    return <p {...stylex.props(styles.empty)}>{t("stepSections.noSelection")}</p>;
  }

  const performedBy = performedByFor(step.type, step.terminal);
  const sections = sectionsFor(performedBy);
  const columns = sectionColumns(sections);
  const bySection = headingIssues(step, validation.issues, sections);
  // What the masthead keeps: a step-level issue no section claims, a Zod
  // issue on the step's own `key` among them. Every other issue prints at
  // exactly one place below, so the page never says one sentence twice.
  const mastheadIssues = validation.issues.filter(
    (i) => i.entityId === step.id && sectionOfIssue(step, i, sections) === undefined,
  );
  const isInitialStep = draft.workflow?.initialStep === step.id;
  // A step with no assignment still works: the assignment-less floor in
  // `submitAndTransition` is starter-or-`system:admin`. That is not thereby an
  // invariant a self-service step must avoid, so this is a warning, never an
  // `EditorIssue`. A terminal step suppresses it entirely.
  const showAssignmentWarning = step.terminal !== true && step.assignment === undefined;
  // One word for the step's assignment, read by both the section and the rail
  // row, so the two cannot name it differently (`studio-guided-vocabulary`).
  const assignment = assignmentWord(step.assignment?.strategy);

  const sectionBody = (section: SectionName) => {
    switch (section) {
      case "entry":
        return (
          <ActionListEditor
            label="onEntry"
            actions={step.onEntry}
            fields={fields}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
            onChange={(onEntry) => updateStep({ onEntry })}
          />
        );
      case "assignment":
        // The plain name and its note stand above the envelope editor, so the
        // section says who ends up able to act on the step before it says how
        // (`studio-guided-vocabulary`). A registered type the curated table
        // misses reads as its registry type, in mono.
        return (
          <>
            <p {...stylex.props(assignment.mono ? styles.monoWord : styles.plainWord)}>{assignment.text}</p>
            {assignment.note !== undefined && <p {...stylex.props(styles.hint)}>{assignment.note}</p>}
            <PluginEnvelopeEditor
              label={t("steps.assignmentLabel")}
              value={step.assignment?.strategy}
              onChange={(strategy) => updateStep({ assignment: { strategy } })}
              registryTypes={registry?.assignmentStrategyTypes}
              registrySchemas={registry?.assignmentStrategySchemas}
              typeLabel={strategyOptionLabel}
            />
            {showAssignmentWarning && <p {...stylex.props(styles.warning)}>{t("stepSections.noAssignmentWarning")}</p>}
          </>
        );
      case "form":
        // The count and one control. The editor itself lives on its own
        // routed page, so nothing here mounts it.
        return (
          <div {...stylex.props(styles.formSummary)}>
            <span>
              {configuredFieldCount(step.view?.fields)} / {fields.length} {t("stepSections.viewFieldsConfigured")}
            </span>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(step.id!)}>
              {t("stepSections.viewBuildForm")}
            </button>
          </div>
        );
      case "paths":
        return (
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
        );
      case "timers":
        return (
          <TimersPanel
            timers={step.timers}
            paths={step.paths ?? []}
            fields={fields}
            onChange={(timers) => updateStep({ timers })}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
          />
        );
      case "exit":
        return (
          <>
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
          </>
        );
      case "howItEnds":
        // An end step declares its outcome on departure (`studio-canvas`).
        // It stood inside Exit while a terminal step still carried one.
        return (
          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.outcomeField")}</span>
            {draft.contract?.outcomes?.length ? (
              <select value={step.outcome ?? ""} onChange={(e) => updateStep({ outcome: e.target.value || undefined })}>
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
            <span {...stylex.props(styles.hint)}>{t("stepSections.outcomeHint")}</span>
          </label>
        );
      case "subprocess":
        return (
          <>
            <SubprocessSpecEditor
              value={step.subprocess}
              fields={fields}
              onChange={(subprocess) => updateStep({ subprocess })}
              processes={[...processes]}
              contentLocale={contentLocale}
            />
            {/* The only route to a loaded child body in the whole studio.
                checkSubprocessChildRefs runs against nothing without it. */}
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
              {childLoadError && <p {...stylex.props(styles.errorText)}>{childLoadError}</p>}
            </fieldset>
          </>
        );
    }
  };

  /** One section, standing open. Its own open issues print beside its
   * heading, and each issue stands at exactly one section
   * (`studio-step-page`). */
  const renderSection = (section: SectionName) => (
    <section key={section} {...stylex.props(styles.section)} aria-labelledby={`step-section-${section}`}>
      <div {...stylex.props(styles.sectionHead)}>
        <h3 {...stylex.props(styles.sectionHeading)} id={`step-section-${section}`}>
          {t(SECTION_LABEL[section])}
        </h3>
        <IssueItems issues={bySection.get(section) ?? []} style={styles.sectionIssues} />
      </div>
      {sectionBody(section)}
    </section>
  );

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.masthead)}>
        <div {...stylex.props(styles.mastheadTop)}>
          <span {...stylex.props(styles.kicker)}>
            <span {...stylex.props(styles.kickerNumber)}>
              {t("stepPage.stepNumber").replace("{number}", String(stepNumber))}
            </span>
            <span>{stepKindPhrase(performedBy)}</span>
          </span>
          {isInitialStep && <span {...stylex.props(styles.firstStep)}>{t("stepRole.initial")}</span>}
          <button type="button" className="btn btn-secondary" onClick={() => step.id !== undefined && onRemoveStep(step.id)}>
            {t("stepPage.removeStep")}
          </button>
        </div>

        <label {...stylex.props(styles.fieldLabel)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.labelField")}</span>
          <LocalizedTextInput value={step.label} onChange={updateStepLabel} />
        </label>
        {/* Sibling of the label, never nested inside it: a <label> takes
            phrasing content, and the design language keeps a field's own
            messages beside the label. */}
        {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.warning)}>{missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}</p>
        )}

        <label {...stylex.props(styles.fieldLabel)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.keyField")}</span>
          <input
            type="text"
            {...stylex.props(styles.monoInput)}
            value={step.key ?? ""}
            onChange={(e) => updateStep({ key: e.target.value })}
          />
        </label>

        <label {...stylex.props(styles.fieldLabel)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.descriptionField")}</span>
          <LocalizedTextInput value={step.description} onChange={(description) => updateStep({ description })} />
        </label>
        {missingTranslationWarning(step.description, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.warning)}>{missingTranslationWarning(step.description, contentLocale, draft.baseLocale)}</p>
        )}

        {/* The step's kind: a three-option restyle of the type/terminal
            controls (`studio-canvas`). Sets the same two fields; adds nothing
            new. It governs which sections stand below. The model keeps its
            `performedBy` name; only the printed phrases changed. */}
        <fieldset {...stylex.props(styles.segmented)} aria-label={t("stepKind.legend")}>
          <legend {...stylex.props(styles.segmentedLegend)}>{t("stepKind.legend")}</legend>
          {PERFORMED_BY_OPTIONS.map((option, optionIndex) => (
            <button
              key={option}
              type="button"
              {...stylex.props(
                styles.segmentedOption,
                optionIndex > 0 && styles.segmentedOptionAfterFirst,
                performedBy === option && styles.segmentedOptionPressed,
              )}
              aria-pressed={performedBy === option}
              onClick={() => updateStep(performedByPatch(option) as Partial<DraftStep>)}
            >
              {stepKindPhrase(option)}
            </button>
          ))}
        </fieldset>

        {isInitialStep ? (
          <p {...stylex.props(styles.note)}>{t("stepSections.isInitialStep")}</p>
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

        <IssueItems issues={mastheadIssues} />
      </div>

      <div {...stylex.props(styles.columns)} aria-label={t("stepPage.sectionsLabel")} role="group">
        <div {...stylex.props(styles.column)}>{columns.leading.map(renderSection)}</div>
        <div {...stylex.props(styles.gutter)} aria-hidden="true" />
        <div {...stylex.props(styles.column)}>{columns.trailing.map(renderSection)}</div>
      </div>

      {/* Where Path to and Time limit stood on a step that is not an end. */}
      {performedBy === "terminal" && <p {...stylex.props(styles.note)}>{t("stepSections.terminalNoPathsOrTimers")}</p>}

      <nav {...stylex.props(styles.walk)} aria-label={t("stepPage.walkLabel")}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={previous === undefined}
          onClick={() => previous !== undefined && onSelectStep(previous.id)}
        >
          {previous === undefined ? t("stepPage.previousNone") : t("stepPage.previous").replace("{step}", previous.label)}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={next === undefined}
          onClick={() => next !== undefined && onSelectStep(next.id)}
        >
          {next === undefined ? t("stepPage.nextNone") : t("stepPage.next").replace("{step}", next.label)}
        </button>
      </nav>

      {/* The step's own JSON, read-only. A `<pre>` accepts no typing, so the
          JSON surface stays the one place for hand-authoring a definition
          (`studio-step-page`). The disclosure stands closed until an author
          opens it, which is `<details>`'s own default. */}
      <details {...stylex.props(styles.developer)}>
        <summary {...stylex.props(styles.developerSummary)}>{t("stepPage.developerView")}</summary>
        <p {...stylex.props(styles.developerId)}>
          {t("stepSections.idField")} {step.id}
        </p>
        <pre {...stylex.props(styles.rawJson)}>{JSON.stringify(step, null, 2)}</pre>
        <p {...stylex.props(styles.hint)}>{t("stepPage.developerViewNote")}</p>
      </details>
    </div>
  );
}

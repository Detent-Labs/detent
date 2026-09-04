import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { performedByFor, performedByPatch, type PerformedBy } from "../draft/performedBy";
import { roleStampFor, type StampTone, type StepRole } from "../draft/roleStamp";
import { ActionListEditor } from "./ActionListEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { missingTranslationWarning } from "../draft/localized-text";
import { stepIssueCount } from "../draft/panel-rail";
import { nextStepKey, configuredFieldCount } from "./stepsPanelLogic.js";
import { sectionsFor, type SectionName } from "./sectionsFor.js";
import { defaultOpenSections, sectionSummaries } from "./sectionSummary.js";

type DraftStep = DraftOf<Step>;

const styles = stylex.create({
  pane: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    height: "100%",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
  },
  emptyCopy: {
    color: colors.textMuted,
    margin: 0,
  },
  // The masthead takes its own height first and stays put; only the section
  // register below it scrolls.
  masthead: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    paddingBottom: space.s3,
    borderBottom: `2px solid ${colors.divider}`,
  },
  mastheadTop: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
  },
  mastheadLabel: {
    flex: "1 1 auto",
    minWidth: 0,
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
  monoRow: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    color: colors.textMuted,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  stamp: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  stampOpen: {
    color: colors.accent,
  },
  stampSettled: {
    color: colors.text,
  },
  stampDormant: {
    color: { default: "#726e6e", "@media (prefers-color-scheme: dark)": colors.neutral500 },
  },
  stampRefusal: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  // The rule derives from the message's own tone, not the accent:
  // `design-language.md` keeps the accent a stamp rather than a paint, and a
  // component reads a semantic role rather than a ramp step. `ChecksRail.tsx`'s
  // held-back group already carries this exact form.
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: `color-mix(in srgb, ${colors.refusal} 55%, transparent)`,
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
  segmented: {
    display: "flex",
    gap: 0,
    border: "none",
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
  overflow: {
    position: "relative",
    marginLeft: "auto",
  },
  overflowPanel: {
    position: "absolute",
    insetInlineEnd: 0,
    insetBlockStart: "100%",
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    minWidth: "12rem",
    background: colors.surface,
    border: `1px solid ${colors.border}`,
  },
  overflowItem: {
    background: "none",
    borderWidth: 0,
    font: "inherit",
    color: colors.text,
    textAlign: "left",
    paddingBlock: space.s1,
    paddingInline: space.s2,
    cursor: "pointer",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  rawJson: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    background: colors.surfaceMuted,
    border: `1px solid ${colors.border}`,
    padding: space.s2,
    marginBlock: space.s2,
  },
  register: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
  },
  sectionHeading: {
    margin: 0,
    fontSize: "inherit",
    fontWeight: 400,
  },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    background: { default: "none", ":hover": colors.surfaceMuted },
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: 0,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  sectionName: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  sectionValue: {
    marginLeft: "auto",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.8rem",
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
  sectionBody: {
    paddingBlock: space.s3,
    paddingInline: 0,
    borderBottom: `1px solid ${colors.border}`,
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
});

const STAMP_TONE: Record<StampTone, typeof styles.stampOpen> = {
  open: styles.stampOpen,
  settled: styles.stampSettled,
  dormant: styles.stampDormant,
};

const ROLE_LABEL: Record<StepRole, CatalogKey> = {
  initial: "stepRole.initial",
  task: "stepRole.task",
  subprocess: "stepRole.subprocess",
  end: "stepRole.end",
};

const SECTION_LABEL: Record<SectionName, CatalogKey> = {
  entry: "stepSections.entry",
  assignment: "stepSections.assignment",
  form: "stepSections.form",
  paths: "stepSections.paths",
  timers: "stepSections.timers",
  exit: "stepSections.exit",
  subprocess: "stepSections.subprocess",
};

const PERFORMED_BY_LABEL: Record<PerformedBy, CatalogKey> = {
  participant: "stepSections.performedByParticipant",
  subprocess: "stepSections.performedBySubprocess",
  terminal: "stepSections.performedByTerminal",
};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/**
 * Which sections stand open, per step id. It lives in `EditorArea` for the
 * reason the dock's own flag did: this component unmounts whenever the
 * selection leaves a step, and the draft's `layout` blob is per-draft, so one
 * author's open set must not reach another (design.md).
 *
 * A step with no entry here has not been touched yet and takes
 * `defaultOpenSections`. Storing the seed would make every first render a
 * write.
 */
export type SectionOpenState = [
  Record<string, SectionName[]>,
  Dispatch<SetStateAction<Record<string, SectionName[]>>>,
];

interface Props {
  fields: DraftField[];
  token: string;
  /** Selection is driven from `EditorArea` (canvas click, palette
   * placement, section-index navigation) — this component holds no
   * uncontrolled fallback of its own. */
  selectedStepId: string | undefined;
  onSelectStep: (stepId: string | undefined) => void;
  /** The path a canvas edge click selected: resolves to this step (its
   * source) and opens the Paths section with that row highlighted, per
   * "A path edge opens its source step's Paths section". */
  selectedPathId?: string;
  /** Navigates to the form editor's routed page for a step: the Form
   * section's "Build the form" control. Takes the step id alone —
   * `EditorArea` owns `processId` and the `Route` shape, so this component
   * stays free of both. */
  navigate: (stepId: string) => void;
  /** The per-step open set, lifted to `EditorArea`. */
  sectionOpen: SectionOpenState;
}

export function StepsPanel({ fields, token, selectedStepId, onSelectStep, selectedPathId, navigate, sectionOpen }: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const baseLocale = draft.baseLocale ?? "en";
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [openByStep, setOpenByStep] = sectionOpen;

  const index = steps.findIndex((s) => s.id === selectedStepId);
  const step = index >= 0 ? steps[index] : undefined;
  const stepId = step?.id;

  // A path-edge click opens Paths even where the author had collapsed it. A
  // step the author has never touched needs nothing here: it holds the path
  // the edge belongs to, so `defaultOpenSections` already opens Paths.
  useEffect(() => {
    if (selectedPathId === undefined || stepId === undefined) return;
    setOpenByStep((prev) => {
      const open = prev[stepId];
      return open === undefined || open.includes("paths") ? prev : { ...prev, [stepId]: [...open, "paths"] };
    });
  }, [selectedPathId, stepId, setOpenByStep]);

  const loadChildFile = async (id: string | undefined, file: File | undefined) => {
    if (!id || !file) return;
    try {
      setChildForStep(id, parseChildProcessJson(await file.text()));
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

  /** The masthead's own label input, gated by `nextStepKey`'s lock check and
   * deduped against every sibling step's key (design.md). */
  const updateStepLabel = (next: DraftStep["label"]) => {
    if (!step) return;
    const siblingKeys = new Set(steps.filter((s) => s.id !== step.id).map((s) => s.key ?? ""));
    const derivedKey = nextStepKey(step.key ?? "", step.label, next, baseLocale, siblingKeys);
    const patch: Partial<DraftStep> = derivedKey === undefined ? { label: next } : { label: next, key: derivedKey };
    updateStep(patch);
  };

  if (!step) {
    // Only reachable when a selection points at a step the draft no longer
    // holds.
    return (
      <div {...stylex.props(styles.empty)}>
        <p {...stylex.props(styles.emptyCopy)}>{t("stepSections.noSelection")}</p>
      </div>
    );
  }

  const performedBy = performedByFor(step.type, step.terminal);
  const sections = sectionsFor(performedBy);
  const summaries = sectionSummaries(step, validation.issues, sections);
  const stored = stepId !== undefined ? openByStep[stepId] : undefined;
  const open = stored !== undefined ? new Set(stored) : defaultOpenSections(summaries);
  const toggleSection = (section: SectionName) => {
    if (stepId === undefined) return;
    const next = new Set(open);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setOpenByStep((prev) => ({ ...prev, [stepId]: [...next] }));
  };

  const { role, tone } = roleStampFor(step, draft.workflow?.initialStep);
  const issueTotal = stepIssueCount(validation.issues, step);
  const isInitialStep = draft.workflow?.initialStep === step.id;
  // A step with no assignment still works: the assignment-less floor in
  // `submitAndTransition` is starter-or-`system:admin`. That is not thereby an
  // invariant a self-service step must avoid, so this is a warning, never an
  // `EditorIssue`. A terminal step suppresses it entirely.
  const showAssignmentWarning = step.terminal !== true && step.assignment === undefined;

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
        return (
          <>
            <PluginEnvelopeEditor
              label={t("steps.assignmentStrategyLabel")}
              value={step.assignment?.strategy}
              onChange={(strategy) => updateStep({ assignment: { strategy } })}
              registryTypes={registry?.assignmentStrategyTypes}
              registrySchemas={registry?.assignmentStrategySchemas}
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
            {step.terminal === true && (
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
            )}
          </>
        );
      case "subprocess":
        return (
          <>
            <SubprocessSpecEditor value={step.subprocess} fields={fields} onChange={(subprocess) => updateStep({ subprocess })} />
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

  return (
    <div {...stylex.props(styles.pane)}>
      <div {...stylex.props(styles.masthead)}>
        <div {...stylex.props(styles.mastheadTop)}>
          <span {...stylex.props(styles.stamp, STAMP_TONE[tone])}>{t(ROLE_LABEL[role])}</span>
          {issueTotal > 0 && (
            <span {...stylex.props(styles.stamp, styles.stampRefusal)}>
              {t("stepSections.issueCount")}: {issueTotal}
            </span>
          )}
          <div {...stylex.props(styles.overflow)} onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOverflowOpen(false);
          }}>
            <button
              type="button"
              className="btn btn-secondary"
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={() => setOverflowOpen((prev) => !prev)}
            >
              {t("stepSections.moreActions")}
            </button>
            {overflowOpen && (
              <div {...stylex.props(styles.overflowPanel)} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  {...stylex.props(styles.overflowItem)}
                  aria-expanded={rawJsonOpen}
                  aria-controls="step-raw-json"
                  onClick={() => {
                    setRawJsonOpen((prev) => !prev);
                    setOverflowOpen(false);
                  }}
                >
                  {t("stepSections.developerView")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  {...stylex.props(styles.overflowItem)}
                  onClick={() => {
                    setOverflowOpen(false);
                    removeStep(step.id);
                  }}
                >
                  {t("steps.removeStep")}
                </button>
              </div>
            )}
          </div>
        </div>

        <label {...stylex.props(styles.fieldLabel, styles.mastheadLabel)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.labelField")}</span>
          <LocalizedTextInput value={step.label} onChange={updateStepLabel} />
        </label>
        {/* Sibling of the label, never nested inside it: a <label> takes
            phrasing content, and the design language keeps a field's own
            messages beside the label. */}
        {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.warning)}>{missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}</p>
        )}

        <div {...stylex.props(styles.monoRow)}>
          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.keyField")}</span>
            <input
              type="text"
              {...stylex.props(styles.monoInput)}
              value={step.key ?? ""}
              onChange={(e) => updateStep({ key: e.target.value })}
            />
          </label>
          <span>
            {t("stepSections.idField")} {step.id}
          </span>
        </div>

        <label {...stylex.props(styles.fieldLabel)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.descriptionField")}</span>
          <LocalizedTextInput value={step.description} onChange={(description) => updateStep({ description })} />
        </label>
        {missingTranslationWarning(step.description, contentLocale, draft.baseLocale) && (
          <p {...stylex.props(styles.warning)}>{missingTranslationWarning(step.description, contentLocale, draft.baseLocale)}</p>
        )}

        {/* "performed by": a three-option restyle of the type/terminal
            controls (studio-canvas). Sets the same two fields; adds nothing
            new. It governs which sections list below. */}
        <fieldset {...stylex.props(styles.segmented)} aria-label={t("stepSections.performedByLabel")}>
          <legend {...stylex.props(styles.segmentedLegend)}>{t("stepSections.performedByLabel")}</legend>
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
              {t(PERFORMED_BY_LABEL[option])}
            </button>
          ))}
        </fieldset>

        {/* The stamp already reads Initial when the step is the initial one,
            so no control shows there. */}
        {!isInitialStep && (
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

        {rawJsonOpen && (
          <pre id="step-raw-json" {...stylex.props(styles.rawJson)}>
            {JSON.stringify(step, null, 2)}
          </pre>
        )}

        <IssueList entityId={step.id} />
      </div>

      <section {...stylex.props(styles.register)} aria-label={t("stepSections.registerLabel")}>
        {summaries.map(({ section, value, issues }) => (
          <div key={section}>
            <h3 {...stylex.props(styles.sectionHeading)}>
              <button
                type="button"
                {...stylex.props(styles.sectionHead)}
                aria-expanded={open.has(section)}
                aria-controls={`step-section-${section}`}
                onClick={() => toggleSection(section)}
              >
                <span {...stylex.props(styles.sectionName)}>{t(SECTION_LABEL[section])}</span>
                {issues > 0 && <span {...stylex.props(styles.stamp, styles.stampRefusal)}>{issues}</span>}
                <span {...stylex.props(styles.sectionValue)}>{value ?? t("stepSections.emptyValue")}</span>
              </button>
            </h3>
            {open.has(section) && (
              <section id={`step-section-${section}`} {...stylex.props(styles.sectionBody)}>
                {sectionBody(section)}
              </section>
            )}
            {/* Where Paths and Timers stood on a non-terminal step. */}
            {section === "form" && performedBy === "terminal" && (
              <p {...stylex.props(styles.note)}>{t("stepSections.terminalNoPathsOrTimers")}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

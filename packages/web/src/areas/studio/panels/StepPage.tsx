import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import { colors, focus, fonts, space } from "form-ui/tokens.stylex";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { focusAfterWalk, STEP_WALK_NEXT_ID, STEP_WALK_PREVIOUS_ID } from "./stepRailRow.js";
import type { DraftField } from "../draft/fields";
import type { ProcessSummary } from "../api/types.js";
import { useDraft } from "../draft/store";
import { t, type CatalogKey } from "../catalog.js";
import { updateInDraftArray } from "../draft/draft-array-crud";
import { performedByEdit, performedByFor, performedByReach, outcomePatch, pressDecision, type PerformedBy } from "../draft/performedBy";
import { assignmentWord, isCuratedAssignmentStrategy, stepKindPhrase, assignmentStrategyLabel } from "../draft/guided-labels";
import { ActionListEditor } from "./ActionListEditor";
import { SubprocessSpecEditor } from "./SubprocessSpecEditor";
import { KindSwitchDialog } from "./KindSwitchDialog";
import { RemoveStepDialog } from "./RemoveStepDialog";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { useRegistry } from "./shared/useRegistry.js";
import { useChildInputFields } from "./shared/useChildInputFields";
import { childVersionFor } from "../draft/subprocessSpec";
import { PathsPanel } from "./PathsPanel";
import { TimersPanel } from "./TimersPanel";
import { IssueItems, NotCheckedBadge } from "./shared/IssueList";
import { LocalizedTextInput } from "./shared/LocalizedTextInput";
import { parseChildProcessJson } from "../draft/io";
import { missingTranslationWarning } from "../draft/localized-text";
import { nextStepKey, nextCollaborationOverride } from "./stepsPanelLogic.js";
import { formCounts } from "./formCardRows.js";
import { sectionLabel, sectionsFor, type SectionName } from "./sectionsFor.js";
import { headingIssues, issuesBySection, mastheadIssues, namesStepKey } from "./sectionIssues.js";
import { sectionHeaderId, STEP_PAGE_NAME_ID } from "../draft/process-tabs.js";
import {
  defaultOpenSection,
  nextOpenSection,
  fixOpensDeveloperView,
  openSectionFor,
  sectionForRequest,
  sectionSummary,
  type SectionRequest,
  type SectionState,
  type SectionSummary,
} from "./stepSummaries.js";
import { stepRemovalReach } from "../draft/stepRemoval.js";
import { fill, stepText, stepTextMap } from "./shared/optionText.js";
import type { EditorIssue } from "../draft/issues.js";

type DraftStep = DraftOf<Step>;

/** The width below which the steps rail stands above the page. The page
 * then scrolls with the tab body rather than on its own. The steps rail turns
 * at this same width (design.md). */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  page: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    // Below 64rem the rail stands above the page, and the tab body scrolls
    // both. The page then takes its content's height and has no scroll box of
    // its own.
    overflowY: { default: "auto", [NARROW]: "visible" },
    overscrollBehavior: "contain",
    // The box sets no block padding of its own: the masthead's and the
    // walk's own padding clear the ring at either end instead
    // (`studio-focus-ring-clipping`, design.md's Outcome). Adding a block
    // padding here would stack on top of theirs and move content that
    // already clears the ring. `space.s3` (12px) on the inline axis already
    // clears the reach; `max()` keeps that value while reading `focus.reach`,
    // so the two move together if the reach ever grows.
    paddingBlock: 0,
    paddingInline: `max(${space.s3}, ${focus.reach})`,
    // Mid-scroll, a focus scroll would align a control flush with the edge
    // and clip its ring.
    scrollPaddingBlock: focus.reach,
  },
  // The one reading column: the masthead, the sections and the walk, flush
  // left and capped at 52rem.
  column: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "52rem",
    minWidth: 0,
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
    // Only the top edge faces the page box's own top edge; the bottom edge
    // sits against the divider below, not that edge, and keeps the literal
    // token.
    paddingBlockStart: `max(${space.s3}, ${focus.reach})`,
    paddingBlockEnd: space.s3,
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
  // line. The number aligns with the rail's own, so it takes mono. It is the
  // page's `h2`, so the section headings nest under the step. `shell/global.css`
  // gives every `h2` the heading face, a size, a weight and margins; the
  // first four declarations reset them, and the compiled class outranks that
  // element selector.
  kicker: {
    margin: 0,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 400,
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    flex: "1 1 auto",
    minWidth: 0,
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
  // A warning callout: refusal text beside a 3px rule in the advisory role
  // (`DESIGN.md`, Warning Callout). A component reads a semantic role rather
  // than a ramp step, and the accent stays a stamp rather than a paint. The
  // rule never softens into a tint. The missing-translation warnings under the
  // name and description share it.
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
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
  // The 2px divider under each section, the structural rule.
  section: {
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  sectionHeading: {
    margin: 0,
    fontSize: "inherit",
    fontWeight: 400,
  },
  // The header: one button filling the row, flush left. The name, the
  // summary and the mark stand in three columns, so every summary down the
  // page starts at one edge, as a register's column does. A name too long
  // for its column wraps inside it. Below the breakpoint the name stands
  // above the summary, and the mark keeps the trailing edge of both rows.
  sectionHeader: {
    display: "grid",
    gridTemplateColumns: { default: "minmax(0, 11rem) minmax(0, 1fr) auto", [NARROW]: "minmax(0, 1fr) auto" },
    alignItems: "baseline",
    columnGap: space.s3,
    width: "100%",
    // The visually hidden "Done" positions against the header.
    position: "relative",
    paddingBlock: space.s3,
    paddingInline: 0,
    // `background: none` leaves the UA's own `buttonface` plate standing, so
    // each longhand clears the UA button.
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: colors.text,
    borderWidth: 0,
    borderStyle: "none",
    font: "inherit",
    textAlign: "start",
    cursor: "pointer",
  },
  // The open header takes the current mark the steps rail's current row
  // draws (`DESIGN.md`'s Shapes). Picked in code from the same flag that
  // sets `aria-expanded`. The header's text stands flush left, so the mark
  // stands in the page's inline padding instead of over the name: `left`
  // mirrors the `page` style's `paddingInline`, and the header's own
  // `position: relative` anchors it.
  sectionHeaderOpen: {
    "::before": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      left: `calc(-1 * max(${space.s3}, ${focus.reach}))`,
      width: 3,
      backgroundColor: colors.accent,
    },
  },
  // The Legend style (`DESIGN.md`'s Typography).
  sectionName: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    overflowWrap: "anywhere",
  },
  // The open section's name prints in ink; the closed ones stay in slate.
  sectionNameOpen: {
    color: colors.text,
  },
  // The summary takes the body text, and wraps after one line; nothing clips.
  // Below the breakpoint it takes the first column's second row, under the
  // name.
  sectionSummary: {
    gridColumn: { default: "auto", [NARROW]: "1" },
    minWidth: 0,
    overflowWrap: "anywhere",
    color: colors.textMuted,
  },
  sectionSummaryDone: {
    color: colors.text,
  },
  // A machine value takes the mono face at the size around it.
  sectionSummaryMono: {
    fontFamily: fonts.mono,
  },
  // The check badge the steps rail draws (`DESIGN.md`'s The Check Badge).
  badge: {
    alignSelf: "center",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: 11,
    fontWeight: 600,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
  },
  badgeBlocker: {
    color: colors.refusal,
  },
  badgeAdvisory: {
    color: colors.textMuted,
  },
  doneMark: {
    alignSelf: "center",
    display: "inline-flex",
    color: colors.textMuted,
  },
  // A section still to do says so in the Legend style.
  todoMark: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  // Below the breakpoint the mark stands in the second column across both
  // rows, beside the name and the summary under it.
  markPlace: {
    gridColumn: { default: "auto", [NARROW]: "2" },
    gridRow: { default: "auto", [NARROW]: "1 / span 2" },
  },
  // Off screen, never `display: none`, so the word stays in the header's
  // accessible name.
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  // The open body stands clear of its header at the top. The hidden style
  // below still wins while the section is closed.
  sectionBody: {
    paddingBlockStart: space.s3,
    paddingBlockEnd: space.s3,
  },
  // `hidden` alone would lose against a compiled `display`, so the closed
  // state picks its own named style from the same flag the element carries.
  sectionBodyHidden: {
    display: "none",
  },
  bodyIssues: {
    marginBlockStart: 0,
    marginBlockEnd: space.s2,
  },
  errorText: {
    color: colors.refusal,
    marginBlock: space.s1,
  },
  walk: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    // Only the bottom edge faces the page box's own bottom edge, so it clears
    // the ring there; the top edge keeps the literal token.
    paddingBlockStart: space.s3,
    paddingBlockEnd: `max(${space.s3}, ${focus.reach})`,
  },
  // Last in More's body. More's own section rule and padding frame it.
  developer: {
    marginBlockStart: space.s3,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // The key input under the summary: the one writable control in the
  // disclosure.
  developerKey: {
    marginBlockStart: space.s2,
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

const NOOP = () => {};

const PERFORMED_BY_OPTIONS: PerformedBy[] = ["participant", "subprocess", "terminal"];

/** The word one registered assignment strategy reads as in the envelope
 * editor's type picker. A type the curated table misses keeps its registry
 * type, which is what an unnamed plugin has to be picked by. */
function strategyOptionLabel(type: string): string {
  return isCuratedAssignmentStrategy(type) ? assignmentStrategyLabel(type).name : type;
}

/** More's per-field three-state collaboration control
 * (`studio-step-page`: "The Collaboration section offers a three-state
 * control per field"). `undefined` reads as Default, inheriting the
 * process-wide value at once, including any later change to it. */
type CollabOption = "default" | "on" | "off";
const COLLAB_OPTIONS: CollabOption[] = ["default", "on", "off"];
const COLLAB_OPTION_LABEL: Record<CollabOption, CatalogKey> = {
  default: "collaboration.optionDefault",
  on: "collaboration.optionOn",
  off: "collaboration.optionOff",
};

function collabOptionFor(override: boolean | undefined): CollabOption {
  return override === undefined ? "default" : override ? "on" : "off";
}

/** One field's Segmented Control: Default, On or Off. Reuses the step-kind
 * control's own `segmented`/`segmentedOption` styles above. While Default
 * stands pressed, a caption beside it names the process-wide default's
 * current resolved value, so an author sees the effective setting without
 * widening the control's own per-option text (design.md). */
function CollaborationControl({
  legend,
  value,
  resolvedDefault,
  onChange,
}: {
  legend: CatalogKey;
  value: boolean | undefined;
  resolvedDefault: boolean;
  onChange: (next: boolean | undefined) => void;
}) {
  const selected = collabOptionFor(value);
  return (
    <fieldset {...stylex.props(styles.segmented)} aria-label={t(legend)}>
      <legend {...stylex.props(styles.segmentedLegend)}>{t(legend)}</legend>
      {COLLAB_OPTIONS.map((option, optionIndex) => (
        <button
          key={option}
          type="button"
          {...stylex.props(
            styles.segmentedOption,
            optionIndex > 0 && styles.segmentedOptionAfterFirst,
            selected === option && styles.segmentedOptionPressed,
          )}
          aria-pressed={selected === option}
          onClick={() => onChange(option === "default" ? undefined : option === "on")}
        >
          {t(COLLAB_OPTION_LABEL[option])}
        </button>
      ))}
      {selected === "default" && (
        <p {...stylex.props(styles.hint)}>
          {t("collaboration.currently").replace("{value}", t(resolvedDefault ? "collaboration.valueOn" : "collaboration.valueOff"))}
        </p>
      )}
    </fieldset>
  );
}

/** A header's closing mark. The check badge where the section counts open
 * issues; else the check mark where it is done; else the word To do where
 * the step still needs it; else nothing. The badge prints in refusal where
 * any counted issue blocks a publish. */
function SectionMark({ issues, state }: { issues: readonly EditorIssue[]; state: SectionState }) {
  if (issues.length > 0) {
    const blocker = issues.some((i) => i.source !== "view");
    return (
      <span
        {...stylex.props(styles.badge, blocker ? styles.badgeBlocker : styles.badgeAdvisory, styles.markPlace)}
        aria-label={`${issues.length} ${t(issues.length === 1 ? "stepsRail.issueMarkOne" : "stepsRail.issueMark")}`}
      >
        {issues.length}
      </span>
    );
  }
  if (state === "todo") return <span {...stylex.props(styles.todoMark, styles.markPlace)}>{t("stepPage.sectionTodo")}</span>;
  if (state !== "done") return null;
  // The icon stands in for the word beside the name: the word stays its
  // tooltip and part of the header's accessible name.
  return (
    <span {...stylex.props(styles.doneMark, styles.markPlace)} title={t("stepPage.sectionDone")}>
      <Check size={18} strokeWidth={1.75} aria-hidden="true" />
      <span {...stylex.props(styles.visuallyHidden)}>{t("stepPage.sectionDone")}</span>
    </span>
  );
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
   * source) and highlights that row in the Ways out section. */
  selectedPathId?: string;
  /** Bumps on every canvas request to open a way out. A new value reopens Ways
   * out, even for the way out already selected. */
  waysOutRequest?: number;
  /** A Fix's request to open one section. It does nothing on another step's
   * page. */
  sectionRequest?: SectionRequest;
  /** Called once the page took `sectionRequest`, which clears it, so a later
   * visit to the step does not reopen the section. */
  onSectionOpened?: () => void;
  /** Opens the form editor for a step: the Form section's control. */
  navigate: (stepId: string) => void;
  /** The processes a subprocess step may call. Empty until the fetch
   * resolves, and after a failed one. */
  processes: readonly ProcessSummary[];
}

/** A called process's file that failed to load. */
export function ChildLoadError({ message }: { message: string }) {
  return (
    <p {...stylex.props(styles.errorText)} role="alert">
      {message}
    </p>
  );
}

/**
 * The Steps tab's wide page (`studio-step-page`). One step, in one column: a
 * masthead, the sections its kind declares folded into an accordion, and the
 * walk to the previous and next step. Each header names its section, sums up
 * what it holds and marks its state; one section stands open at a time. More,
 * the last section, holds the Developer view with the writable key input and
 * the read-only JSON.
 *
 * Every body stays mounted, and `hidden` folds the closed ones, so a body
 * keeps its half-typed state across a fold.
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
  waysOutRequest,
  sectionRequest,
  onSectionOpened = NOOP,
  navigate,
  processes,
}: Props) {
  const { draft, mutate, validation, setChildForStep, contentLocale } = useDraft();
  const steps = draft.workflow?.steps ?? [];
  const baseLocale = draft.baseLocale ?? "en";
  const registry = useRegistry(token);
  const [childLoadError, setChildLoadError] = useState<string | null>(null);
  // The kind a press waits on while the dialog confirms, and the button that
  // opened it. The edit does not remount that button, so focus returns to it.
  const [pendingKind, setPendingKind] = useState<PerformedBy | null>(null);
  const kindTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Whether the removal dialog stands open, and the control that opened it.
  const [removing, setRemoving] = useState(false);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  // The author's own toggle of More's Developer view. A key check opens it too.
  const [developerOpen, setDeveloperOpen] = useState(false);
  const developerRef = useRef<HTMLDetailsElement | null>(null);

  const index = steps.findIndex((s) => s.id === step?.id);

  // The page remounts per step through its `key`, so these derive from the
  // step it opens on. A missing step stands no section.
  const stepKind = step ? performedByFor(step.type, step.terminal) : undefined;
  const sections = stepKind ? sectionsFor(stepKind) : [];
  // Every issue a section owns, row issues included: the header counts them.
  const counted = step ? issuesBySection(step, validation.issues, sections) : new Map<SectionName, EditorIssue[]>();
  const summaries = new Map<SectionName, SectionSummary>(
    step
      ? sections.map((section) => [
          section,
          sectionSummary(section, { step, draft, fields, steps, processes, contentLocale, baseLocale }),
        ])
      : [],
  );
  const opening = () =>
    defaultOpenSection(
      sections,
      new Map(sections.map((s) => [s, counted.get(s)?.length ?? 0])),
      new Map(sections.map((s) => [s, summaries.get(s)!.state])),
      selectedPathId,
    );
  const requestedSection = sectionForRequest(sectionRequest, step?.id, sections);
  const [openSection, setOpenSection] = useState<SectionName | undefined>(() => requestedSection ?? opening());
  // A kind switch keeps the page mounted, and can drop the open section from
  // the new kind's list. The page's opening section then stands open instead.
  const shownOpen = openSectionFor(openSection, sections, opening());
  // A way out selected on the canvas opens Ways out, where its row carries
  // the current mark. A repeated request for the same way out reopens it.
  const holdsPaths = sections.includes("paths");
  useEffect(() => {
    if (selectedPathId !== undefined && holdsPaths) setOpenSection("paths");
  }, [selectedPathId, holdsPaths, waysOutRequest]);
  const keyChecked = validation.issues.some((i) => i.entityId === step?.id && namesStepKey(i.loc));
  // A Fix opens its section on the page already mounted too. Taking the request
  // clears it, and a request for another step waits untouched. The Developer
  // view's `open` prop stays true under a key check, so React writes nothing
  // after a hand close, and the Fix writes the element itself. Its `toggle`
  // syncs `developerOpen`.
  const requestHere = sectionRequest !== undefined && sectionRequest.stepId === step?.id;
  useEffect(() => {
    if (!requestHere) return;
    if (requestedSection !== undefined) setOpenSection(requestedSection);
    if (fixOpensDeveloperView(requestedSection, keyChecked) && developerRef.current !== null) developerRef.current.open = true;
    onSectionOpened();
  }, [requestHere, requestedSection, keyChecked, sectionRequest, onSectionOpened]);

  // The page remounts for the step it opens, which drops the focus the pressed
  // walk button held. One animation frame later the new page's control in the
  // same direction takes it, or the opposite one when that direction has ended.
  const walkTo = (stepId: string, pressed: "previous" | "next") => {
    onSelectStep(stepId);
    requestAnimationFrame(() => {
      const same = document.getElementById(pressed === "previous" ? STEP_WALK_PREVIOUS_ID : STEP_WALK_NEXT_ID);
      const goesOn = same instanceof HTMLButtonElement && !same.disabled;
      document.getElementById(focusAfterWalk(pressed, goesOn))?.focus();
    });
  };

  // The child's input fields feed the subprocess editor's inputMapping. The
  // version is the pinned one, or the process's newest for latest-at-spawn. A
  // step of another kind, or one with no process, leaves the hook idle.
  const callSpec = step?.type === "subprocess" ? step.subprocess : undefined;
  const childInputs = useChildInputFields(token, callSpec?.processId, childVersionFor(callSpec, processes));

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
  // The step-level issues, printed at the top of their section's body. A
  // row's own issue stays at its row.
  const bySection = headingIssues(step, validation.issues, sections);
  // What the masthead keeps: a step-level issue no section claims. Every other
  // issue prints at exactly one place below, so the page never says one sentence
  // twice.
  const masthead = mastheadIssues(step, validation.issues, sections);
  const isInitialStep = draft.workflow?.initialStep === step.id;
  // A step with no assignment still works: the assignment-less floor in
  // `submitAndTransition` is starter-or-`system:admin`. That is not thereby an
  // invariant a self-service step must avoid, so this is a warning, never an
  // `EditorIssue`. A terminal step suppresses it entirely.
  const showAssignmentWarning = step.terminal !== true && step.assignment === undefined;
  // One word for the step's assignment, read by both the section and the rail
  // row, so the two cannot name it differently (`studio-guided-vocabulary`).
  // The body reads its note alone; the header's summary names it.
  const assignment = assignmentWord(step.assignment?.strategy);

  const actionList = (label: CatalogKey, list: "onEntry" | "onExit" | "onCancel") => (
    <ActionListEditor
      label={t(label)}
      actions={step[list]}
      fields={fields}
      contentLocale={contentLocale}
      baseLocale={baseLocale}
      registryTypes={registry?.actionTypes}
      registrySchemas={registry?.actionSchemas}
      onChange={(actions) => updateStep({ [list]: actions })}
    />
  );

  const sectionBody = (section: SectionName) => {
    switch (section) {
      case "lifecycle":
        // An end step is never left, so it carries the entry list alone.
        return (
          <>
            {actionList("steps.onEntryLegend", "onEntry")}
            {performedBy !== "terminal" && (
              <>
                {actionList("steps.onExitLegend", "onExit")}
                {actionList("steps.onCancelLegend", "onCancel")}
              </>
            )}
          </>
        );
      case "assignment":
        // The header's summary names the strategy, and its note leads the
        // body above the envelope editor, so the section says who ends up able
        // to act on the step before it says how (`studio-guided-vocabulary`).
        return (
          <>
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
      case "form": {
        // The header already states the form's size in the Forms card's
        // words, so the body holds the one control. The editor itself stands
        // in this tab's body once opened, so nothing here mounts it.
        const { fieldCount } = formCounts(step, fields);
        return (
          <button type="button" className="btn btn-secondary" onClick={() => navigate(step.id!)}>
            {t(fieldCount === 0 ? "formsTab.startForm" : "formsTab.openForm")}
          </button>
        );
      }
      case "more":
        return moreBody();
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
            steps={steps}
            fields={fields}
            onChange={(timers) => updateStep({ timers })}
            registryTypes={registry?.actionTypes}
            registrySchemas={registry?.actionSchemas}
            contentLocale={contentLocale}
            baseLocale={baseLocale}
          />
        );
      case "howItEnds":
        // An end step declares its outcome on departure (`studio-canvas`).
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
              <input type="text" value={step.outcome ?? ""} onChange={(e) => updateStep(outcomePatch(e.target.value))} />
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
              childInputs={childInputs}
              onChange={(subprocess) => updateStep({ subprocess })}
              processes={[...processes]}
              contentLocale={contentLocale}
              baseLocale={baseLocale}
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
                  <NotCheckedBadge text={t("issues.crossProcessNotChecked")} />
                  <input type="file" accept="application/json" onChange={(e) => loadChildFile(step.id, e.target.files?.[0])} />
                </>
              )}
              {childLoadError && <ChildLoadError message={childLoadError} />}
            </fieldset>
          </>
        );
    }
  };

  /** More's body, in order: the cancelling control where the kind carries
   * `cancellable` (task and subprocess), the two collaboration controls where
   * it carries them (task and end), then the Developer view last. */
  const moreBody = () => {
    // Three states over one optional key: unset reads as "inherit", so the
    // draft's step carries no `cancellable` key until an author picks an
    // explicit state (`studio-step-page`).
    const cancellableValue = step.cancellable === undefined ? "inherit" : String(step.cancellable);
    const processDefault = draft.cancellable ?? true;
    return (
      <>
        {performedBy !== "terminal" && (
          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.cancellableField")}</span>
            <select
              value={cancellableValue}
              onChange={(e) => {
                const selected = e.target.value;
                updateStep({ cancellable: selected === "inherit" ? undefined : selected === "true" });
              }}
            >
              <option value="inherit">{t("stepSections.cancellableInherit")}</option>
              <option value="true">{t("stepSections.cancellableYes")}</option>
              <option value="false">{t("stepSections.cancellableNo")}</option>
            </select>
            {cancellableValue === "inherit" && (
              <span {...stylex.props(styles.hint)}>
                {t(processDefault ? "stepSections.cancellableResolvesYes" : "stepSections.cancellableResolvesNo")}
              </span>
            )}
          </label>
        )}
        {performedBy !== "subprocess" && (
          <>
            <CollaborationControl
              legend="collaboration.commentLegend"
              value={step.collaboration?.comments}
              resolvedDefault={draft.collaboration?.comments ?? true}
              onChange={(comments) => updateStep({ collaboration: nextCollaborationOverride(step.collaboration, "comments", comments) })}
            />
            <CollaborationControl
              legend="collaboration.attachmentsLegend"
              value={step.collaboration?.attachments}
              resolvedDefault={draft.collaboration?.attachments ?? true}
              onChange={(attachments) => updateStep({ collaboration: nextCollaborationOverride(step.collaboration, "attachments", attachments) })}
            />
          </>
        )}

        {/* The step's key and its own JSON. The key input is the one writable
            control here, and the JSON re-renders from the draft as it changes.
            A `<pre>` accepts no typing, so the JSON surface stays the one place
            for hand-authoring a definition (`studio-step-page`). The disclosure
            stands closed until an author opens it or a check names the key. Its
            summary stays a native toggle: a press closes it under the check, and
            the `open` prop holds still until the check clears or a Fix reopens it. */}
        <details
          ref={developerRef}
          {...stylex.props(styles.developer)}
          open={developerOpen || keyChecked}
          onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}
        >
          <summary {...stylex.props(styles.developerSummary)}>{t("stepPage.developerView")}</summary>
          <label {...stylex.props(styles.fieldLabel, styles.developerKey)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.keyField")}</span>
            <input
              type="text"
              {...stylex.props(styles.monoInput)}
              value={step.key ?? ""}
              onChange={(e) => updateStep({ key: e.target.value })}
            />
          </label>
          <p {...stylex.props(styles.developerId)}>
            {t("stepSections.idField")} {step.id}
          </p>
          <pre {...stylex.props(styles.rawJson)}>{JSON.stringify(step, null, 2)}</pre>
          <p {...stylex.props(styles.hint)}>{t("stepPage.developerViewNote")}</p>
        </details>
      </>
    );
  };

  /** One section of the accordion: a header button over a body region. The
   * header names the section, sums up what it holds and closes on its mark;
   * the body prints the section's step-level issues above its controls. Every
   * body renders, and a closed one carries `hidden` (`studio-step-page`). */
  const renderSection = (section: SectionName) => {
    const summary = summaries.get(section)!;
    const open = shownOpen === section;
    const headerId = sectionHeaderId(section);
    const bodyId = `${headerId}-body`;
    return (
      <section key={section} {...stylex.props(styles.section)}>
        <h3 {...stylex.props(styles.sectionHeading)}>
          <button
            type="button"
            id={headerId}
            aria-expanded={open}
            aria-controls={bodyId}
            {...stylex.props(styles.sectionHeader, open && styles.sectionHeaderOpen)}
            onClick={() => setOpenSection(nextOpenSection(shownOpen, section))}
          >
            <span {...stylex.props(styles.sectionName, open && styles.sectionNameOpen)}>{t(sectionLabel(section, performedBy))}</span>
            <span
              {...stylex.props(
                styles.sectionSummary,
                summary.state === "done" && styles.sectionSummaryDone,
                summary.mono && styles.sectionSummaryMono,
              )}
            >
              {summary.text}
            </span>
            <SectionMark issues={counted.get(section) ?? []} state={summary.state} />
          </button>
        </h3>
        <div
          id={bodyId}
          role="region"
          aria-labelledby={headerId}
          hidden={!open}
          {...stylex.props(styles.sectionBody, !open && styles.sectionBodyHidden)}
        >
          <IssueItems issues={bySection.get(section) ?? []} style={styles.bodyIssues} />
          {sectionBody(section)}
        </div>
      </section>
    );
  };

  // The removal dialog names the step as every step select does, so two steps
  // that share a label read apart.
  const label =
    (step.id === undefined ? undefined : stepTextMap(draft.workflow?.steps ?? [], contentLocale, baseLocale).get(step.id)) ??
    stepText(step, contentLocale, baseLocale);

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.column)}>
        <div {...stylex.props(styles.masthead)}>
          <div {...stylex.props(styles.mastheadTop)}>
            <h2 {...stylex.props(styles.kicker)}>
              <span {...stylex.props(styles.kickerNumber)}>
                {t("stepPage.stepNumber").replace("{number}", String(stepNumber))}
              </span>
              <span>{stepKindPhrase(performedBy)}</span>
            </h2>
            {isInitialStep && <span {...stylex.props(styles.firstStep)}>{t("stepRole.initial")}</span>}
            <button
              ref={removeTriggerRef}
              type="button"
              className="btn btn-secondary btn-destructive"
              onClick={() => setRemoving(true)}
            >
              {t("stepPage.removeStep")}
            </button>
          </div>
          {removing && (
            <RemoveStepDialog
              label={label}
              reach={stepRemovalReach(draft, step.id!, fields)}
              triggerRef={removeTriggerRef}
              onCancel={() => setRemoving(false)}
              onConfirm={() => {
                // The page remounts on the next step, so the trigger the
                // dialog's cleanup would focus is detached by then, and
                // `onRemoveStep` hands focus to the rail's current row.
                if (step.id !== undefined) onRemoveStep(step.id);
                setRemoving(false);
              }}
            />
          )}

          {/* The name line takes the page's full width. The step's key stands
              in the Developer view, inside More. */}
          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.labelField")}</span>
            <LocalizedTextInput id={STEP_PAGE_NAME_ID} value={step.label} onChange={updateStepLabel} />
          </label>
          {/* Sibling of the label, never nested inside it: a <label> takes
              phrasing content, and the design language keeps a field's own
              messages beside the label. */}
          <IssueItems issues={masthead.name} />
          {missingTranslationWarning(step.label, contentLocale, draft.baseLocale) && (
            <p {...stylex.props(styles.warning)}>{missingTranslationWarning(step.label, contentLocale, draft.baseLocale)}</p>
          )}

          <label {...stylex.props(styles.fieldLabel)}>
            <span {...stylex.props(styles.fieldLabelText)}>{t("stepSections.descriptionField")}</span>
            <LocalizedTextInput value={step.description} onChange={(description) => updateStep({ description })} />
          </label>
          <IssueItems issues={masthead.description} />
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
                onClick={(e) => {
                  if (pressDecision(step, option) === "apply") {
                    updateStep(performedByEdit(step, option) as Partial<DraftStep>);
                    return;
                  }
                  kindTriggerRef.current = e.currentTarget;
                  setPendingKind(option);
                }}
              >
                {stepKindPhrase(option)}
              </button>
            ))}
          </fieldset>
          {pendingKind && (
            <KindSwitchDialog
              kind={pendingKind}
              reach={performedByReach(step, pendingKind)}
              triggerRef={kindTriggerRef}
              onCancel={() => setPendingKind(null)}
              onConfirm={() => {
                updateStep(performedByEdit(step, pendingKind) as Partial<DraftStep>);
                setPendingKind(null);
              }}
            />
          )}

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

          <IssueItems issues={masthead.end} />
        </div>

        <div aria-label={t("stepPage.sectionsLabel")} role="group">
          {sections.map(renderSection)}
        </div>

        {/* Where Ways out and Time limit stand on a step that is not an end. */}
        {performedBy === "terminal" && <p {...stylex.props(styles.note)}>{t("stepSections.terminalNoPathsOrTimers")}</p>}

        <nav {...stylex.props(styles.walk)} aria-label={t("stepPage.walkLabel")}>
          <button
            type="button"
            className="btn btn-secondary"
            id={STEP_WALK_PREVIOUS_ID}
            disabled={previous === undefined}
            onClick={() => previous !== undefined && walkTo(previous.id, "previous")}
          >
            {previous === undefined ? t("stepPage.previousNone") : fill(t("stepPage.previous"), { step: previous.label })}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            id={STEP_WALK_NEXT_ID}
            disabled={next === undefined}
            onClick={() => next !== undefined && walkTo(next.id, "next")}
          >
            {next === undefined ? t("stepPage.nextNone") : fill(t("stepPage.next"), { step: next.label })}
          </button>
        </nav>
      </div>
    </div>
  );
}

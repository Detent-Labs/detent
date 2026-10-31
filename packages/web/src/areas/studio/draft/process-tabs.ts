import type { DraftField } from "./fields";
import type { DraftViewEntry } from "./view-layout";
import type { EditorIssue } from "./issues";
import { flattenRailFields } from "./panel-rail";
import type { ProcessTab, TabView } from "../routing";

/** An action as the Checks hand-off reads it: its id alone. */
interface TabCountAction {
  id?: string;
}

/** The step shape the tab counts and the Checks hand-off read. Every id is
 * optional, as on any draft: a half-built entity may carry none yet. */
export interface TabCountStep {
  id?: string;
  view?: { fields?: DraftViewEntry[] };
  paths?: { id?: string; onPath?: TabCountAction[] }[];
  timers?: { id?: string; onFire?: { actions?: TabCountAction[] } }[];
  onEntry?: TabCountAction[];
  onExit?: TabCountAction[];
  onCancel?: TabCountAction[];
}

/** The draft shape the tab counts read. Structural, not `Draft`, so a unit
 * test can hand in the keys a count needs and nothing else. */
export interface TabCountDraft {
  fields?: DraftField[];
  workflow?: { steps?: TabCountStep[] };
}

/**
 * What each tab prints beside its name (`studio-process-tabs`). `undefined`
 * is a tab that prints no number: Map draws a graph, and Settings holds four
 * views of process-wide settings, so neither has a total to report.
 *
 * Forms counts the steps that carry a view, the whole set the Forms tab
 * plates: a view holding no field entry still draws its card, marked as an
 * empty form. The step page's own Form section counts field entries alone
 * (`studio-app`), so the two numbers legitimately differ on a note-only view.
 */
export function processTabCounts(draft: TabCountDraft, issues: readonly EditorIssue[]): Record<ProcessTab, number | undefined> {
  const steps = draft.workflow?.steps ?? [];
  return {
    map: undefined,
    steps: steps.length,
    fields: flattenRailFields(draft.fields).length,
    forms: steps.filter((step) => step.view !== undefined).length,
    checks: issues.length,
    settings: undefined,
  };
}

/** Where a press on a Checks row lands: the tab, its view, and the step and
 * the way out the tab selects. */
export interface CheckTarget {
  tab: ProcessTab;
  view?: TabView;
  stepId?: string;
  pathId?: string;
}

/** A step's actions in all five positions: `onEntry`, `onExit`, `onCancel`,
 * each path's `onPath` and each timer's `onFire.actions`. */
function stepActions(step: TabCountStep): TabCountAction[] {
  return [
    ...(step.onEntry ?? []),
    ...(step.onExit ?? []),
    ...(step.onCancel ?? []),
    ...(step.paths ?? []).flatMap((path) => path.onPath ?? []),
    ...(step.timers ?? []).flatMap((timer) => timer.onFire?.actions ?? []),
  ];
}

/** The Steps tab on the step `owns` picks, or on no step where none does. */
function onOwningStep(steps: readonly TabCountStep[], owns: (step: TabCountStep) => boolean): CheckTarget {
  const stepId = steps.find(owns)?.id;
  return stepId === undefined ? { tab: "steps" } : { tab: "steps", stepId };
}

/**
 * The place that owns an issue's subject, for a press on a Checks row
 * (`studio-process-tabs`: "A check opens the tab that owns its subject").
 *
 * A timer, an action and a path all hang off a step, so each sends the author
 * to the step that carries it. A path also names itself, so the step page's
 * Ways out section marks its row. A subject the draft no longer holds lands
 * on the Steps tab with no step. A process-level issue has no owning tab: the
 * header bar carries it on every tab, so the press leaves the author on
 * Checks.
 */
export function checkTarget(
  issue: Pick<EditorIssue, "entityType" | "entityId">,
  steps: readonly TabCountStep[],
): CheckTarget {
  const id = issue.entityId;
  switch (issue.entityType) {
    case "step":
      return onOwningStep(steps, (step) => step.id === id);
    case "timer":
      return onOwningStep(steps, (step) => (step.timers ?? []).some((timer) => timer.id === id));
    case "action":
      return onOwningStep(steps, (step) => stepActions(step).some((action) => action.id === id));
    case "path": {
      const owner = steps.find((step) => (step.paths ?? []).some((path) => path.id === id));
      return owner?.id === undefined ? { tab: "steps" } : { tab: "steps", stepId: owner.id, pathId: id };
    }
    case "field":
      return { tab: "fields", view: "catalog" };
    case "dataSource":
      return { tab: "settings", view: "sources" };
    case "contract":
      return { tab: "settings", view: "contract" };
    case "process":
      return { tab: "checks" };
  }
}

/**
 * The tab leaving the form editor returns to (`studio-forms-overview`:
 * "Leaving the form editor SHALL return to the Forms tab where the author
 * started"; `studio-form-editor`: "An author who came from the step page
 * returns to that step").
 *
 * The form editor's address carries no tab of its own, so the surface
 * remembers the tab that opened it and hands it back here. A surface holding
 * no origin returns to Steps, the editor's other entrance.
 */
export function formEditorReturnTab(openedFrom: ProcessTab | undefined): ProcessTab {
  return openedFrom ?? "steps";
}

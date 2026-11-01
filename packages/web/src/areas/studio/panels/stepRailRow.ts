import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";
import type { EditorIssue } from "../draft/issues.js";
import { stepEntityIds } from "../draft/panel-rail.js";

type DraftStep = DraftOf<Step>;

/**
 * A rail row's own issue badge (`studio-step-page`: "A rail row carries its
 * own open issue count"). `count` at zero draws no badge.
 *
 * `blocker` is true where any of the counted issues refuses a publish. Every
 * check source but `view` is an engine validator, so one open entry there
 * blocks — the rule `checksDotState` already applies to the whole draft,
 * narrowed here to one step.
 */
export function railRowIssues(issues: readonly EditorIssue[], step: DraftStep): { count: number; blocker: boolean } {
  const ids = new Set(stepEntityIds(step));
  const mine = issues.filter((i) => ids.has(i.entityId));
  return { count: mine.length, blocker: mine.some((i) => i.source !== "view") };
}

/** The DOM id of the current row's main button. One row is current at a time,
 * so one fixed id names it. */
export const STEPS_RAIL_CURRENT_ID = "studio-steps-rail-current";

/** How the rail brings the current row into view: by the least distance, so a
 * row already whole in the rail's view does not move the page. */
export const STEPS_RAIL_SCROLL: ScrollIntoViewOptions = { block: "nearest" };

/** Scrolls the current row into view. Returns whether a row stood to scroll. */
export function scrollCurrentRowIntoView(doc: Pick<Document, "getElementById">): boolean {
  const row = doc.getElementById(STEPS_RAIL_CURRENT_ID);
  if (row === null) return false;
  row.scrollIntoView(STEPS_RAIL_SCROLL);
  return true;
}

/** The DOM id of the rail's first add control, the one `ADD_CONTROLS` lists
 * first. */
export const STEPS_RAIL_ADD_FIRST_ID = "studio-steps-rail-add-first";

/**
 * Where focus lands after the step page removes a step: the rail's current
 * row while `remaining` steps stay, else the first add control, since an empty
 * rail holds no row. The removed step's page remounts, so the control that
 * pressed Remove this step is gone.
 */
export function focusAfterStepRemove(remaining: number): string {
  return remaining > 0 ? STEPS_RAIL_CURRENT_ID : STEPS_RAIL_ADD_FIRST_ID;
}

/** The DOM ids of the step page's two walk buttons. The page remounts per step,
 * so the button that was pressed is gone; a fixed id lets focus find its
 * successor. */
export const STEP_WALK_PREVIOUS_ID = "studio-step-walk-previous";
export const STEP_WALK_NEXT_ID = "studio-step-walk-next";

/**
 * Where focus lands after a walk press: the control in the pressed direction
 * while the walk goes on that way, else the opposite control, since the
 * pressed one is now disabled. `furtherExists` reports whether the new page
 * has a neighbour in the pressed direction.
 */
export function focusAfterWalk(pressed: "previous" | "next", furtherExists: boolean): string {
  const same = pressed === "previous" ? STEP_WALK_PREVIOUS_ID : STEP_WALK_NEXT_ID;
  const other = pressed === "previous" ? STEP_WALK_NEXT_ID : STEP_WALK_PREVIOUS_ID;
  return furtherExists ? same : other;
}

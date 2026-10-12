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

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

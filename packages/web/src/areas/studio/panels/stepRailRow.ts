import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";
import type { EditorIssue } from "../draft/issues.js";
import type { ProcessSummary } from "../api/types.js";
import { t } from "../catalog.js";
import { performedByFor } from "../draft/performedBy.js";
import { assignmentWord, processLabel } from "../draft/guided-labels.js";
import { stepEntityIds } from "../draft/panel-rail.js";
import { configuredFieldCount } from "./stepsPanelLogic.js";

type DraftStep = DraftOf<Step>;

/**
 * The one summary line a rail row carries under its label
 * (`studio-step-page`: "The steps rail numbers every step in reachability
 * order").
 *
 * Three shapes, one per step kind. A step someone works reads who works it
 * and how many fields its form carries. A call to another process reads the
 * process it calls, by label and never by its `proc_` id. An end reads the
 * outcome it declares.
 *
 * Every string comes from the catalog, so a deployment override reaches the
 * line. Nothing here mutates and nothing here renders.
 */
export function railRowSummary(
  step: DraftStep,
  processes: readonly ProcessSummary[],
  contentLocale: string,
): string {
  switch (performedByFor(step.type, step.terminal)) {
    case "terminal": {
      const outcome = step.outcome ?? "";
      return outcome === "" ? t("stepsRail.endsNoOutcome") : t("stepsRail.ends").replace("{outcome}", outcome);
    }
    case "subprocess": {
      const called = processes.find((p) => p.processId === step.subprocess?.processId);
      return called === undefined
        ? t("stepsRail.callsNothing")
        : t("stepsRail.calls").replace("{process}", processLabel(called, contentLocale));
    }
    case "participant": {
      const who = assignmentWord(step.assignment?.strategy).text;
      const fields = t("stepsRail.fieldCount").replace("{count}", String(configuredFieldCount(step.view?.fields)));
      return `${who} · ${fields}`;
    }
  }
}

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

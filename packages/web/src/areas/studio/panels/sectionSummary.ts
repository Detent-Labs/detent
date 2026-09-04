import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";
import type { EditorIssue } from "../draft/issues.js";
import { configuredFieldCount } from "./stepsPanelLogic.js";
import type { SectionName } from "./sectionsFor.js";

type DraftStep = DraftOf<Step>;

/**
 * What one section head shows, beside its name.
 *
 * `value` is a count for a section holding a list, a resolved string for one
 * holding a single value, and `undefined` for an empty section — which the
 * head prints as `—`. A zero count is `undefined`, not `0`: an empty Entry and
 * an absent Assignment read the same to an author, and both stay closed.
 *
 * `issues` is the section's own issue count, printed as a refusal-tone stamp
 * above zero.
 */
export interface SectionSummary {
  section: SectionName;
  value: number | string | undefined;
  issues: number;
}

/** A count sections shows nothing at zero. */
function countOrNone(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

function actionIds(actions: DraftStep["onEntry"]): string[] {
  return (actions ?? []).flatMap((a) => (a.id !== undefined ? [a.id] : []));
}

/**
 * The entity ids whose issues count on one section head (`studio-app`: "Each
 * section head in the configuration pane SHALL carry its own count").
 *
 * `resolveLoc` has already collapsed each issue to the deepest entity it
 * found, so a guard's CEL issue carries the path's id and a timer's duration
 * issue carries the timer's. Filtering by id is therefore all a section needs.
 *
 * Assignment, Form and Subprocess own no entity of their own. Every issue
 * their bodies can raise resolves to the step itself, and `studio-app` puts a
 * step-level issue on the masthead alone. They read zero here by that rule,
 * not by omission.
 */
function sectionEntityIds(step: DraftStep, section: SectionName): string[] {
  switch (section) {
    case "entry":
      return actionIds(step.onEntry);
    case "exit":
      return [...actionIds(step.onExit), ...actionIds(step.onCancel)];
    case "paths":
      return (step.paths ?? []).flatMap((p) => [...(p.id !== undefined ? [p.id] : []), ...actionIds(p.onPath)]);
    case "timers":
      return (step.timers ?? []).flatMap((t) => [...(t.id !== undefined ? [t.id] : []), ...actionIds(t.onFire?.actions)]);
    case "assignment":
    case "form":
    case "subprocess":
      return [];
  }
}

function sectionValue(step: DraftStep, section: SectionName): number | string | undefined {
  switch (section) {
    case "entry":
      return countOrNone((step.onEntry ?? []).length);
    case "assignment":
      return step.assignment?.strategy?.type;
    case "form":
      return countOrNone(configuredFieldCount(step.view?.fields));
    case "paths":
      return countOrNone((step.paths ?? []).length);
    case "timers":
      return countOrNone((step.timers ?? []).length);
    case "exit":
      return countOrNone((step.onExit ?? []).length + (step.onCancel ?? []).length);
    case "subprocess":
      return step.subprocess?.processId;
  }
}

/**
 * One summary per listed section, in the order given. The caller supplies the
 * list from `sectionsFor`, so a section the performed-by value drops is never
 * summarized.
 *
 * Nothing here mutates, and nothing here reads a locale or the catalog. A head
 * resolves its own name from the catalog and prints `—` for an absent value.
 */
export function sectionSummaries(
  step: DraftStep,
  issues: readonly EditorIssue[],
  sections: readonly SectionName[],
): SectionSummary[] {
  return sections.map((section) => {
    const ids = new Set(sectionEntityIds(step, section));
    return {
      section,
      value: sectionValue(step, section),
      issues: ids.size === 0 ? 0 : issues.filter((i) => ids.has(i.entityId)).length,
    };
  });
}

/**
 * Which sections open when the author first selects a step. A section carrying
 * content or an issue opens; an empty one stays closed.
 *
 * The pane seeds its per-step open set from this once and then keeps the
 * author's own toggles, so this runs on first selection, never on every
 * render.
 */
export function defaultOpenSections(summaries: readonly SectionSummary[]): Set<SectionName> {
  return new Set(summaries.filter((s) => s.value !== undefined || s.issues > 0).map((s) => s.section));
}

import type { Draft } from "./types";
import type { ValidationResult } from "./validation";

/** The two parts of a Zod issue the start-gap tests read. */
interface ZodIssueShape {
  path: readonly PropertyKey[];
  code: string;
}

function pathIs(issue: ZodIssueShape, ...path: string[]): boolean {
  return issue.path.length === path.length && path.every((seg, i) => issue.path[i] === seg);
}

/** True when the draft's step list is an empty array. */
export function hasNoSteps(draft: Draft): boolean {
  const steps = draft.workflow?.steps;
  return Array.isArray(steps) && steps.length === 0;
}

/** A draft with no step has no resolvable `initialStep`. The engine reports
 * that as a type error or as an unresolved reference. Studio reads every issue
 * at `workflow.initialStep` as part of the start state, not as an issue. */
export function isStartGap(draft: Draft, issue: ZodIssueShape): boolean {
  return hasNoSteps(draft) && pathIs(issue, "workflow", "initialStep");
}

/** The process's own `label` lacks its base-locale entry: the process has no name. */
export function isProcessNameGap(issue: ZodIssueShape): boolean {
  return issue.code === "custom" && pathIs(issue, "label");
}

/** The structural banner stands for a Zod issue that is no plain sentence. */
export function showsStructuralBanner(validation: Pick<ValidationResult, "issues">): boolean {
  return validation.issues.some((i) => i.source === "zod" && !i.plain);
}

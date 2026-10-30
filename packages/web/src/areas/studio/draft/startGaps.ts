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

/** A draft with no step has no `initialStep`, and the engine reports that as a
 * type error. Studio reads it as a start state, not an issue. */
export function isStartGap(draft: Draft, issue: ZodIssueShape): boolean {
  const steps = draft.workflow?.steps;
  return Array.isArray(steps) && steps.length === 0 && issue.code === "invalid_type" && pathIs(issue, "workflow", "initialStep");
}

/** The process's own `label` lacks its base-locale entry: the process has no name. */
export function isProcessNameGap(issue: ZodIssueShape): boolean {
  return issue.code === "custom" && pathIs(issue, "label");
}

/** The structural banner stands for a Zod issue that is no plain sentence. */
export function showsStructuralBanner(validation: Pick<ValidationResult, "issues">): boolean {
  return validation.issues.some((i) => i.source === "zod" && !i.plain);
}

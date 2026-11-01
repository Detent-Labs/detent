import type { Draft } from "./types.js";
import type { DraftField } from "./fields.js";
import { formCounts } from "../panels/formCardRows.js";

/** What removing one step reaches, measured before the removal. */
export interface StepRemovalReach {
  /** Ways out of other steps whose target is this step. They stay after the
   * removal, and the checks report them. */
  incomingPaths: number;
  /** Field entries on the step's form, counted as a Forms card counts them. */
  formFields: number;
  /** Whether the step is the process's first step. */
  isInitial: boolean;
}

/**
 * The counts the Remove this step dialog prints (`studio-step-page`: "The
 * removal dialog counts what the removal reaches"). A step's own ways out,
 * a loop back to itself among them, lead nowhere once it goes, so none of
 * them counts as incoming.
 */
export function stepRemovalReach(draft: Draft, stepId: string, fields: DraftField[]): StepRemovalReach {
  const steps = draft.workflow?.steps ?? [];
  let incomingPaths = 0;
  for (const other of steps) {
    if (other.id === stepId) continue;
    for (const path of other.paths ?? []) if (path.to === stepId) incomingPaths += 1;
  }
  const step = steps.find((s) => s.id === stepId);
  return {
    incomingPaths,
    formFields: step === undefined ? 0 : formCounts(step, fields).fieldCount,
    isInitial: draft.workflow?.initialStep === stepId,
  };
}

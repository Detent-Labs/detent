import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import { guardPhrase, type Operand } from "../panels/shared/conditionLogic";

export interface GuardedPathNote {
  pathId: string | undefined;
  label: string;
  /** The guard in the words a canvas way out's sentence reads. */
  condition: string;
}

/**
 * One note per manual path that carries a guard, in the step's own path
 * order (`studio-form-editor`). The runtime offers such a path's control only
 * while its guard holds; the form preview has no instance data to test it, so
 * it draws the control and prints these notes under the controls. An
 * unguarded manual path, one whose guard source is blank, and every automatic
 * path get none.
 */
export function guardedManualPathNotes(step: DraftOf<Step>, operands: Operand[]): GuardedPathNote[] {
  return (step.paths ?? []).flatMap((path) => {
    const src = path.guard?.src;
    if (path.trigger !== "manual" || !src?.trim()) return [];
    return [{ pathId: path.id, label: path.label ?? "", condition: guardPhrase(src, operands) }];
  });
}

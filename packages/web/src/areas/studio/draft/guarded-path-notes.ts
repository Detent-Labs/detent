import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import { edgeGuardLabel, type Operand } from "../panels/shared/conditionLogic";

export interface GuardedPathNote {
  pathId: string | undefined;
  label: string;
  /** The guard in the canvas edge's words, or its CEL text where the builder
   * cannot read it. */
  condition: string;
  /** `condition` is the guard's CEL text, which prints in the mono face. */
  raw: boolean;
}

/**
 * One note per manual path that carries a guard, in the step's own path
 * order (`studio-form-editor`). The runtime offers such a path's control only
 * while its guard holds; the form preview has no instance data to test it, so
 * it draws the control and prints these notes under the controls. An
 * unguarded manual path and every automatic path get none.
 */
export function guardedManualPathNotes(step: DraftOf<Step>, operands: Operand[]): GuardedPathNote[] {
  return (step.paths ?? []).flatMap((path) => {
    if (path.trigger !== "manual") return [];
    const condition = edgeGuardLabel(path, operands);
    if (condition === undefined) return [];
    // `guardEdgeLabel` hands back the source itself when no row reads.
    return [{ pathId: path.id, label: path.label ?? "", condition, raw: condition === path.guard?.src }];
  });
}

import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";

type DraftStep = DraftOf<Step>;

/**
 * The set of step ids the draft's initial step reaches over paths
 * (`studio-canvas`'s "The canvas bar reports one selected step's
 * reachability"). Breadth-first from `initialStep`; its one consumer, the
 * canvas bar's reachability report, reads membership only, never order.
 *
 * A terminal step reached over paths belongs in the set, the same as any
 * other step.
 *
 * Nothing here mutates, and nothing here reads a locale. A draft is mid-edit,
 * so a step may carry no id and a path may name a step the draft no longer
 * holds. Neither throws: an id-less step is never visited, and a dangling
 * `to` is skipped.
 */
export function reachableStepIds(steps: DraftStep[] | undefined, initialStep: string | undefined): Set<string> {
  const list = steps ?? [];
  const byId = new Map(list.filter((s) => s.id !== undefined).map((s) => [s.id as string, s]));

  const seen = new Set<string>();
  const queue: string[] = initialStep !== undefined && byId.has(initialStep) ? [initialStep] : [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    const step = byId.get(id);
    if (step === undefined) continue;
    seen.add(id);
    for (const path of step.paths ?? []) {
      if (path.to !== undefined && !seen.has(path.to)) queue.push(path.to);
    }
  }
  return seen;
}

import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";

type DraftStep = DraftOf<Step>;

/**
 * The order the steps register lists a draft's steps in (`studio-canvas`'s
 * "The steps register lists every step in reachability order").
 *
 * Three groups, concatenated. Reachable non-terminal steps come first, in
 * breadth-first order from `initialStep`. A step no path reaches follows, in
 * the draft's own order. Terminal steps come last, also in the draft's own
 * order, whether or not a path reaches them.
 *
 * Breadth-first, not depth-first: the register reads as distance from the
 * start, so a step the initial step reaches directly outranks one two hops
 * down another branch. Over `examples/expense-approval.json` that is what
 * puts `escalated_review` (two hops) ahead of `booking_error` (three).
 *
 * `canvas/traversal.ts` walks the same graph for roving keyboard focus. It
 * orders visible steps and groups for focus, not steps for a list, so this
 * walk stands on its own.
 *
 * Nothing here mutates, and nothing here reads a locale. A draft is mid-edit,
 * so a step may carry no id and a path may name a step the draft no longer
 * holds. Neither throws: an id-less step falls into the unreachable group, and
 * a dangling `to` is skipped.
 */
export function registerOrder(steps: DraftStep[] | undefined, initialStep: string | undefined): DraftStep[] {
  const list = steps ?? [];
  const byId = new Map(list.filter((s) => s.id !== undefined).map((s) => [s.id as string, s]));

  const seen = new Set<string>();
  const reachable: DraftStep[] = [];
  const queue: string[] = initialStep !== undefined && byId.has(initialStep) ? [initialStep] : [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = byId.get(id);
    if (step === undefined) continue;
    if (step.terminal !== true) reachable.push(step);
    for (const path of step.paths ?? []) {
      if (path.to !== undefined && !seen.has(path.to)) queue.push(path.to);
    }
  }

  const unreachable = list.filter((s) => s.terminal !== true && (s.id === undefined || !seen.has(s.id)));
  const terminal = list.filter((s) => s.terminal === true);
  return [...reachable, ...unreachable, ...terminal];
}

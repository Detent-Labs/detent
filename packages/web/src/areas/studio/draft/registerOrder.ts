import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";

type DraftStep = DraftOf<Step>;

/**
 * The set of step ids the draft's initial step reaches over paths
 * (`studio-canvas`'s "The canvas bar reports one selected step's
 * reachability"). Breadth-first from `initialStep`, so the set's iteration
 * order is distance-from-start order; `registerOrder` relies on that order
 * for its own reachable group.
 *
 * A terminal step reached over paths belongs in the set, the same as any
 * other step. `registerOrder`'s terminal group holds every terminal step
 * regardless, which is why it cannot answer this question on its own.
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

/**
 * The order the steps rail lists a draft's steps in (`studio-step-page`'s
 * "The steps rail lists each step by number and label").
 *
 * Three groups, concatenated. Reachable non-terminal steps come first, in
 * breadth-first order from `initialStep`, per `reachableStepIds`. A step no
 * path reaches follows, in the draft's own order. Terminal steps come last,
 * also in the draft's own order, whether or not a path reaches them.
 *
 * Breadth-first, not depth-first: the rail reads as distance from the
 * start, so a step the initial step reaches directly outranks one two hops
 * down another branch. Over `examples/expense-approval.json` that is what
 * puts `escalated_review` (two hops) ahead of `booking_error` (three).
 *
 * `canvas/traversal.ts` walks the same graph for roving keyboard focus. It
 * orders visible steps and groups for focus, not steps for a list, so this
 * walk stands on its own.
 */
export function registerOrder(steps: DraftStep[] | undefined, initialStep: string | undefined): DraftStep[] {
  const list = steps ?? [];
  const byId = new Map(list.filter((s) => s.id !== undefined).map((s) => [s.id as string, s]));
  const seen = reachableStepIds(list, initialStep);

  const reachable: DraftStep[] = [];
  for (const id of seen) {
    const step = byId.get(id);
    if (step !== undefined && step.terminal !== true) reachable.push(step);
  }

  const unreachable = list.filter((s) => s.terminal !== true && (s.id === undefined || !seen.has(s.id)));
  const terminal = list.filter((s) => s.terminal === true);
  return [...reachable, ...unreachable, ...terminal];
}

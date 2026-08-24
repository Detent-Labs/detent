import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import { newPath } from "./createPath";

type DraftStep = DraftOf<Step>;

/** The pure transform behind the edit-rail's drop-on-a-path gesture
 * (design.md: "The mutation is the pure part, and it lives in `draft/`").
 * Retargets `pathId` (on `sourceStepId`) to `insertedStep`, keeping the
 * path's own id/key/guard/priority, then gives `insertedStep` one new path
 * (via `newPath`, so it shares the same creation shape every other
 * path-creating entry point uses) that carries the retargeted path's old
 * target and its trigger alone. Returns a new list; mutates no input. A
 * missing source step or path is a no-op — the caller resolves both from a
 * live DOM hit test before calling this. */
export function insertOnPath(
  steps: DraftStep[],
  sourceStepId: string,
  pathId: string,
  insertedStep: DraftStep,
  contentLocale: string,
  baseLocale: string,
  unnamedStepPlaceholder: string,
): DraftStep[] {
  const sourceStep = steps.find((s) => s.id === sourceStepId);
  const splitPath = sourceStep?.paths?.find((p) => p.id === pathId);
  if (!sourceStep || !splitPath) return steps;

  const oldTarget = splitPath.to;
  const trigger = splitPath.trigger ?? "manual";
  const resolvedTargetStep = steps.find((s) => s.id === oldTarget);

  const next = steps.map((s) => {
    if (s !== sourceStep) return s;
    return { ...s, paths: s.paths!.map((p) => (p !== splitPath ? p : { ...p, to: insertedStep.id })) };
  });

  next.push({
    ...insertedStep,
    paths: [newPath(insertedStep, resolvedTargetStep, oldTarget, trigger, contentLocale, baseLocale, unnamedStepPlaceholder)],
  });
  return next;
}

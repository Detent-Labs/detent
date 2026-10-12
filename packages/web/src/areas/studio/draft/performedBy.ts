import type { StepType } from "workflow-engine/schema";

/**
 * The identity section's "performed by" segmented control (task 3.10):
 * `type`/`terminal` read back as one of three options, and written back as
 * the same pair. Adds no field of its own — `stepType`/`terminal` stay
 * exactly `src/schema/definition.ts`'s own fields.
 */
export type PerformedBy = "participant" | "subprocess" | "terminal";

/** `terminal` wins the read direction: a terminal step's `type` still reads
 * `task` or `subprocess`, but "performed by" has nothing left to say once a
 * step is terminal — nothing runs past it. */
export function performedByFor(type: StepType | undefined, terminal: boolean | undefined): PerformedBy {
  if (terminal) return "terminal";
  return type === "subprocess" ? "subprocess" : "participant";
}

/** The `terminal` option pins `type` back to `task`: a step chosen as "the
 * process ends here" carries no subprocess spec, so `type: "subprocess"`
 * would leave `SubprocessSpec` orphaned (`compile.ts`'s "a subprocess step
 * needs a subprocess spec" rule). */
export function performedByPatch(option: PerformedBy): { type: StepType; terminal: boolean | undefined } {
  switch (option) {
    case "participant":
      return { type: "task", terminal: undefined };
    case "subprocess":
      return { type: "subprocess", terminal: undefined };
    case "terminal":
      return { type: "task", terminal: true };
  }
}

/** A key a step carries only for some kinds (`definition.ts`'s step
 * superRefine): `subprocess` and `outcome` have a kind, the rest belong to a
 * step that goes somewhere. */
export type KindBoundKey = "subprocess" | "outcome" | "paths" | "timers" | "onExit" | "onCancel" | "cancellable";

/** The keys the target kind cannot carry. A task step drops `subprocess` and
 * `outcome`, a subprocess step drops `outcome`, and an end drops everything
 * that leaves the step. */
export function performedByRemovals(option: PerformedBy): KindBoundKey[] {
  switch (option) {
    case "participant":
      return ["subprocess", "outcome"];
    case "subprocess":
      return ["outcome"];
    case "terminal":
      return ["subprocess", "paths", "timers", "onExit", "onCancel", "cancellable"];
  }
}

/** What a switch would remove: an entry count per key, 1 for a single key.
 * A key the step does not hold stays absent. */
export type PerformedByReach = Partial<Record<KindBoundKey, number>>;

type ReachSource = {
  [K in KindBoundKey]?: unknown;
};

export function performedByReach(step: ReachSource, option: PerformedBy): PerformedByReach {
  const reach: PerformedByReach = {};
  for (const key of performedByRemovals(option)) {
    const value = step[key];
    const count = Array.isArray(value) ? value.length : value !== undefined ? 1 : 0;
    if (count > 0) reach[key] = count;
  }
  return reach;
}

/** The full patch of a switch: the `type`/`terminal` pair, plus `undefined`
 * for every key the target kind cannot carry, so the draft drops it. */
export function performedByEdit(
  _step: ReachSource,
  option: PerformedBy,
): { type: StepType; terminal: boolean | undefined } & Partial<Record<KindBoundKey, undefined>> {
  const edit: { type: StepType; terminal: boolean | undefined } & Partial<Record<KindBoundKey, undefined>> = {
    ...performedByPatch(option),
  };
  for (const key of performedByRemovals(option)) edit[key] = undefined;
  return edit;
}

/** A press applies at once when it removes nothing, and confirms otherwise. */
export function pressDecision(step: ReachSource, option: PerformedBy): "apply" | "confirm" {
  return Object.keys(performedByReach(step, option)).length === 0 ? "apply" : "confirm";
}

/** The outcome text field's patch: an emptied field removes the key, since an
 * empty string would stay on the step and fail the end-step-only outcome rule
 * after a later kind switch. */
export function outcomePatch(text: string): { outcome: string | undefined } {
  return { outcome: text || undefined };
}

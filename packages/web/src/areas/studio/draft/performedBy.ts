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

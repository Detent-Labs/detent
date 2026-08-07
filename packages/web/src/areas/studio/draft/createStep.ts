import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import { mintId } from "./ids";
import type { DraftLocalizedText } from "./localized-text";

type DraftStep = DraftOf<Step>;

/** The three kinds the palette (task 2.1) and `StepsPanel`'s own "+ Add
 * step" button (task 2.2) both create through this one function. `end` sets
 * `terminal` on an otherwise ordinary `task` step: `Step.type` stays
 * `task`/`subprocess` regardless of `terminal` (`src/schema/definition.ts`
 * comment: "terminal is a property, not a type"). */
export type StepKind = "task" | "subprocess" | "end";

/** One Draft mutation for every "add a step" entry point: the palette's
 * drag-to-place, and `StepsPanel`'s own button. Two call sites, one function,
 * so neither can drift in which fields it sets (design.md). */
export function newStep(kind: StepKind, label: DraftLocalizedText): DraftStep {
  const id = mintId("step");
  const base: DraftStep = { id, key: "", label, type: "task" };
  if (kind === "subprocess") return { ...base, type: "subprocess" };
  if (kind === "end") return { ...base, terminal: true };
  return base;
}

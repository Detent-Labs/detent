import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "./types";

type DraftStep = DraftOf<Step>;

/**
 * The role a step's stamp reads, on the Forms tab's cards and in the step
 * page's masthead (`studio-canvas`'s masthead requirement).
 *
 * `initial` outranks the rest. A draft's `initialStep` is the one step a
 * reader has to place before anything else, and a step is at most one of
 * these four.
 */
export type StepRole = "initial" | "task" | "subprocess" | "end";

/** The four tones `design-language.md` already fixes, as a class suffix. The
 * app area's `statusTone` names the same set; this adds no tone of its own and
 * uses three of the four. `refusal` stays reserved for an issue count. */
export type StampTone = "open" | "settled" | "dormant";

/**
 * A step's role and the tone its stamp wears.
 *
 * `initial` takes open, because the initial step is where work starts.
 * `task` and `subprocess` take settled, because both are ordinary states.
 * `end` takes dormant, because nothing runs past a terminal step.
 *
 * Precedence follows the requirement's own reading order: the draft's
 * `initialStep` first, then `terminal: true`, then `type: "subprocess"`, then
 * task. A terminal initial step is degenerate rather than impossible, and it
 * reads `initial` here.
 */
export function roleStampFor(step: DraftStep, initialStep: string | undefined): { role: StepRole; tone: StampTone } {
  if (step.id !== undefined && step.id === initialStep) return { role: "initial", tone: "open" };
  if (step.terminal === true) return { role: "end", tone: "dormant" };
  if (step.type === "subprocess") return { role: "subprocess", tone: "settled" };
  return { role: "task", tone: "settled" };
}

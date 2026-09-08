import type { PerformedBy } from "../draft/performedBy.js";

/**
 * The step page's sections (`studio-step-page`'s "The step page stands its
 * sections open in two columns"). Eight names, grouped by subject rather than
 * by runtime order: two columns cannot carry one order, since an author
 * reading side by side reads neither.
 *
 * `howItEnds` is the end step's own section. It carries the outcome an end
 * step declares on departure, which stood inside Exit while a terminal step
 * still had one.
 */
export type SectionName = "paths" | "assignment" | "subprocess" | "howItEnds" | "entry" | "exit" | "timers" | "form";

/** The leading column, in reading order. It takes about three fifths of the
 * page: Path to and Assignment carry the routing and the actor, the pair an
 * author reads first and changes most (design.md). */
const LEADING: SectionName[] = ["paths", "assignment", "subprocess", "howItEnds"];

/** The trailing column, in reading order. Four narrower sections. */
const TRAILING: SectionName[] = ["entry", "exit", "timers", "form"];

const PARTICIPANT: SectionName[] = ["paths", "assignment", "entry", "exit", "timers", "form"];
const TERMINAL: SectionName[] = ["howItEnds", "assignment", "entry", "form"];
const SUBPROCESS: SectionName[] = ["paths", "subprocess", "entry", "exit", "timers"];

/**
 * Which sections stand for a performed-by value (`studio-step-page`: "A
 * section SHALL stand only where the step's kind declares it").
 *
 * An end step carries How the case ends, and no outgoing path: it therefore
 * carries neither On exit nor Time limit. A subprocess step drops Assignment
 * and Step form fields and gains Which process it calls, since it is a
 * wait-state with no participant form.
 *
 * The returned array is fresh on every call, so a caller may sort or slice it
 * without reaching the module's own lists.
 */
export function sectionsFor(performedBy: PerformedBy): SectionName[] {
  switch (performedBy) {
    case "terminal":
      return [...TERMINAL];
    case "subprocess":
      return [...SUBPROCESS];
    case "participant":
      return [...PARTICIPANT];
  }
}

/**
 * One section set, split into the page's two columns. A section the set omits
 * appears in neither, so the columns of an end step are shorter than a task
 * step's rather than carrying a blank.
 */
export function sectionColumns(sections: readonly SectionName[]): {
  leading: SectionName[];
  trailing: SectionName[];
} {
  return {
    leading: LEADING.filter((s) => sections.includes(s)),
    trailing: TRAILING.filter((s) => sections.includes(s)),
  };
}

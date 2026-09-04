import type { PerformedBy } from "../draft/performedBy.js";

/**
 * The configuration pane's sections, in runtime order (`studio-canvas`'s
 * "The configuration pane shows the step as a register of sections in runtime
 * order"). Entry, Assignment, Form, Paths, Timers, Exit, with Subprocess
 * joining after Exit.
 *
 * The order is the step's own life, and it is also a dependency order: a timer
 * names a path, a guard reads a field, an assignment can name a person field.
 * Each section references only what sits above it.
 */
export type SectionName = "entry" | "assignment" | "form" | "paths" | "timers" | "exit" | "subprocess";

const PARTICIPANT: SectionName[] = ["entry", "assignment", "form", "paths", "timers", "exit"];
const TERMINAL: SectionName[] = ["entry", "assignment", "form", "exit"];
const SUBPROCESS: SectionName[] = ["entry", "paths", "timers", "exit", "subprocess"];

/**
 * Which sections list for a performed-by value (`studio-canvas`'s "The
 * configuration pane's sections follow the performed-by control").
 *
 * Terminal drops Paths and Timers: nothing runs past a terminal step, so it
 * carries no outgoing path and no timer. The pane states that in one line
 * where the two heads stood.
 *
 * Subprocess drops Assignment and Form and gains Subprocess: a subprocess step
 * is a wait-state with no participant form.
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

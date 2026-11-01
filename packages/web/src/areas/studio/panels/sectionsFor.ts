import type { PerformedBy } from "../draft/performedBy.js";
import type { CatalogKey } from "../catalog.js";

/**
 * The step page's sections (`studio-step-page`: "A step's kind decides its
 * sections"). Eight names; a step stands six at most, folded into one
 * accordion in reading order.
 *
 * `lifecycle` holds what happens when the step is entered or left: the
 * `onEntry`, `onExit` and `onCancel` lists. `more` holds the step's
 * overrides of the process settings, cancelling and collaboration, and the
 * Developer view. `howItEnds` is the end step's own section, over the outcome
 * it declares.
 */
export type SectionName = "assignment" | "form" | "subprocess" | "paths" | "howItEnds" | "timers" | "lifecycle" | "more";

const PARTICIPANT: SectionName[] = ["assignment", "form", "paths", "timers", "lifecycle", "more"];
const SUBPROCESS: SectionName[] = ["subprocess", "paths", "timers", "lifecycle", "more"];
const TERMINAL: SectionName[] = ["assignment", "form", "howItEnds", "lifecycle", "more"];

/**
 * Which sections stand for a performed-by value, in reading order.
 *
 * An end step carries How the case ends and no outgoing path, so it carries
 * neither Ways out nor Time limit. A subprocess step drops Who acts and Form
 * and leads with Which process it calls, since it is a wait-state with no
 * participant form.
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

const SECTION_LABEL: Record<SectionName, CatalogKey> = {
  assignment: "stepSections.assignment",
  form: "stepSections.form",
  subprocess: "stepSections.subprocess",
  paths: "stepSections.paths",
  howItEnds: "stepSections.howItEnds",
  timers: "stepSections.timers",
  lifecycle: "stepSections.lifecycle",
  more: "stepSections.more",
};

/** The catalog key a section's header reads. An end step is never left, so
 * its `lifecycle` header reads When entered alone. */
export function sectionLabel(section: SectionName, performedBy: PerformedBy): CatalogKey {
  if (section === "lifecycle" && performedBy === "terminal") return "stepSections.lifecycleEntryOnly";
  return SECTION_LABEL[section];
}

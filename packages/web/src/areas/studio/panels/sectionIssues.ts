import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";
import type { EditorIssue } from "../draft/issues.js";
import type { SectionName } from "./sectionsFor.js";

type DraftStep = DraftOf<Step>;

/**
 * Which section one open issue belongs beside (`studio-step-page`: "A section
 * prints its own open issues beside its heading"). An issue stands at exactly
 * one section, which this guarantees by construction: the function answers
 * with one name or with none.
 *
 * Two routes, tried in order. An issue `resolveLoc` already collapsed onto a
 * path, a timer or an action names that entity, so its id decides. An issue
 * that resolved to the step itself carries no such id, so its `loc` decides:
 * the body key it names is the section it belongs to.
 *
 * An issue naming neither this step nor anything under it belongs to no
 * section here. So does one whose `loc` names no section, a step's own `key`
 * among them. Both still stand on the masthead and on the Checks tab.
 */
const LOC_SECTION: Record<string, SectionName> = {
  assignment: "assignment",
  view: "form",
  subprocess: "subprocess",
  outcome: "howItEnds",
  onEntry: "lifecycle",
  onExit: "lifecycle",
  onCancel: "lifecycle",
  cancellable: "more",
  collaboration: "more",
  paths: "paths",
  timers: "timers",
};

/** Every entity id under one step, mapped onto the section that owns it. The
 * step's own id is absent on purpose: a step-level issue routes through its
 * `loc` instead. */
export function sectionByEntityId(step: DraftStep): Map<string, SectionName> {
  const owners = new Map<string, SectionName>();
  const claim = (id: string | undefined, section: SectionName) => {
    if (id !== undefined) owners.set(id, section);
  };
  const claimActions = (actions: DraftStep["onEntry"], section: SectionName) => {
    for (const action of actions ?? []) claim(action.id, section);
  };

  claimActions(step.onEntry, "lifecycle");
  // An end step's section draws the entry list alone, so a left list's
  // action has no row to print at there.
  if (step.terminal !== true) {
    claimActions(step.onExit, "lifecycle");
    claimActions(step.onCancel, "lifecycle");
  }
  for (const path of step.paths ?? []) {
    claim(path.id, "paths");
    claimActions(path.onPath, "paths");
  }
  for (const timer of step.timers ?? []) {
    claim(timer.id, "timers");
    claimActions(timer.onFire?.actions, "timers");
  }
  return owners;
}

/** The body keys one `loc` names, with every array index dropped:
 * `workflow.steps[0].view.fields[1].required` reads as five plain keys. */
function locKeys(loc: string): string[] {
  return loc
    .split(".")
    .map((segment) => segment.replace(/\[\d+\]$/, ""))
    .filter((segment) => segment.length > 0);
}

/**
 * One issue's section, or `undefined` where it belongs to none of the
 * sections this step's kind stands. An end step carries no Time limit
 * section, so a `timers` issue on one lands nowhere rather than at a header
 * the page does not draw.
 */
export function sectionOfIssue(
  step: DraftStep,
  issue: Pick<EditorIssue, "entityId" | "loc">,
  sections: readonly SectionName[],
  owners: Map<string, SectionName> = sectionByEntityId(step),
): SectionName | undefined {
  const owned = owners.get(issue.entityId);
  const named =
    issue.entityId === step.id
      ? locKeys(issue.loc)
          .map((key) => (Object.hasOwn(LOC_SECTION, key) ? LOC_SECTION[key] : undefined))
          .find((section) => section !== undefined)
      : undefined;
  const section = owned ?? named;
  return section !== undefined && sections.includes(section) ? section : undefined;
}

const OUTPUT_TARGET_UNKNOWN = /^action output targets unknown field: (.+)$/;

/**
 * The section of the action "action output targets unknown field" complains
 * about. The engine locates that message on the step alone, so the field id in
 * the message finds the action: the first whose `output` holds it, across the
 * step's five positions. Answers `undefined` for any other message, and where no
 * drawn action holds the id. As in `sectionByEntityId`, an end step draws its
 * entry list alone.
 */
export function sectionOfOutputTarget(step: DraftStep, message: string): SectionName | undefined {
  const fieldId = OUTPUT_TARGET_UNKNOWN.exec(message)?.[1];
  if (fieldId === undefined) return undefined;
  const holds = (actions: DraftStep["onEntry"]) => (actions ?? []).some((action) => action.output !== undefined && Object.hasOwn(action.output, fieldId));

  if (holds(step.onEntry)) return "lifecycle";
  if (step.terminal !== true && (holds(step.onExit) || holds(step.onCancel))) return "lifecycle";
  if ((step.paths ?? []).some((path) => holds(path.onPath))) return "paths";
  if ((step.timers ?? []).some((timer) => holds(timer.onFire?.actions))) return "timers";
  return undefined;
}

/**
 * The open issues each listed section prints, keyed by section. A section
 * carrying none is absent from the map, so a caller reads `?? []`.
 *
 * The Checks tab keeps listing every issue, including those a section prints
 * here. This routes; it never filters the rail.
 */
export function issuesBySection(
  step: DraftStep,
  issues: readonly EditorIssue[],
  sections: readonly SectionName[],
): Map<SectionName, EditorIssue[]> {
  const owners = sectionByEntityId(step);
  const bySection = new Map<SectionName, EditorIssue[]>();
  for (const issue of issues) {
    const section = sectionOfIssue(step, issue, sections, owners);
    if (section === undefined) continue;
    const held = bySection.get(section);
    if (held) held.push(issue);
    else bySection.set(section, [issue]);
  }
  return bySection;
}

/**
 * The step-level issues one section prints at the top of its body, above its
 * controls. The header counts these and the row issues together, through
 * `issuesBySection`.
 *
 * A path's, a timer's and an action's issue already prints at its own row
 * inside the section's body: `PathsPanel`, `TimersPanel` and
 * `ActionListEditor` each mount an `IssueList` per entity. Printing it above
 * the controls too would say one sentence twice, so this leaves those to the
 * row that names the entity they belong to.
 *
 * An issue that resolved to the step itself has no row to stand at. The top
 * of the body is its one place, and it is what the assignment, the form, the
 * subprocess spec and the outcome all raise.
 */
export function headingIssues(
  step: DraftStep,
  issues: readonly EditorIssue[],
  sections: readonly SectionName[],
): Map<SectionName, EditorIssue[]> {
  return issuesBySection(
    step,
    issues.filter((i) => i.entityId === step.id),
    sections,
  );
}

import type { DraftField } from "./fields";
import type { DraftViewEntry } from "./view-layout";
import type { EditorIssue } from "./issues";
import { flattenRailFields } from "./panel-rail";
import type { Draft } from "./types";
import { checkPlace, checkStep, type CheckSite } from "./checkSentence";
import type { ProcessTab, TabTarget } from "../routing";
import { fieldCheckZone, type FieldCheckZone } from "../panels/fieldCheckZone";
import { namesStepKey } from "../panels/sectionIssues";
import type { SectionRequest } from "../panels/stepSummaries";
import type { OutsidePlace } from "../panels/readByRows";
import type { SectionName } from "../panels/sectionsFor";

/** The step shape the tab counts read. */
export interface TabCountStep {
  id?: string;
  view?: { fields?: DraftViewEntry[] };
}

/** The draft shape the tab counts read. Structural, not `Draft`, so a unit
 * test can hand in the keys a count needs and nothing else. */
export interface TabCountDraft {
  fields?: DraftField[];
  workflow?: { steps?: TabCountStep[] };
}

/**
 * What each tab prints beside its name (`studio-process-tabs`). `undefined`
 * is a tab that prints no number: Map draws a graph, and Settings holds three
 * views of process-wide settings, so neither has a total to report.
 *
 * Forms counts the steps that carry a view, the whole set the Forms tab
 * plates: a view holding no field entry still draws its card, marked as an
 * empty form. The step page's own Form section counts field entries alone
 * (`studio-app`), so the two numbers legitimately differ on a note-only view.
 */
export function processTabCounts(draft: TabCountDraft, issues: readonly EditorIssue[]): Record<ProcessTab, number | undefined> {
  const steps = draft.workflow?.steps ?? [];
  return {
    map: undefined,
    steps: steps.length,
    fields: flattenRailFields(draft.fields).length,
    forms: steps.filter((step) => step.view !== undefined).length,
    checks: issues.length,
    settings: undefined,
  };
}

/** The step page's name input, a Fix's landing and a new step's. */
export const STEP_PAGE_NAME_ID = "step-page-name";
/** The element id of the key input in More's Developer view. */
export const STEP_PAGE_KEY_ID = "step-page-key";
/** The process's name input in the header bar. */
export const PROCESS_HEADER_NAME_ID = "process-header-name";
/** The JSON surface's input. */
export const JSON_SURFACE_INPUT_ID = "json-surface-input";

/** The DOM id of one section's header on the step page. */
export function sectionHeaderId(section: SectionName): string {
  return `step-section-${section}`;
}

/** Where a press on a Checks row lands: the tab, its view, what the tab selects
 * and opens there, and what takes focus. A target naming no finer place hands
 * focus to its tab. */
export interface CheckTarget extends TabTarget {
  stepId?: string;
  pathId?: string;
  section?: SectionName;
  fieldId?: string;
  zone?: FieldCheckZone;
  dataSourceId?: string;
  focusId?: string;
  json?: true;
}

/** A focus hand-off waiting for its tab's commit. `toTop` scrolls the element to
 * its scroll box's top, so what opens under it stands in view. */
export interface PendingFocus {
  tab: ProcessTab;
  elementId?: string;
  toTop?: true;
}

/** The focus hand-off of a Fix. A section header alone scrolls to the top, since
 * its body opens under it. The key input and the Name input keep the least
 * scroll a plain focus takes. */
export function fixPendingFocus(target: CheckTarget): PendingFocus {
  const header = target.section !== undefined && target.focusId === sectionHeaderId(target.section);
  return { tab: target.tab, elementId: target.focusId, ...(header ? { toTop: true } : {}) };
}

/**
 * Whether a hand-off acts on this commit: its tab stands open, and the step page
 * has taken any section request. The page takes one in its effect, and the
 * section opens a commit later. A closed section's body is `hidden` until then,
 * so the key input takes no focus, and the opening moves the headers below it.
 * More's Developer view opens in that same effect, so the input stands ready on
 * the commit that clears the request.
 */
export function pendingFocusLands(
  pending: PendingFocus | undefined,
  openTab: ProcessTab,
  sectionRequest: SectionRequest | undefined,
): pending is PendingFocus {
  return pending !== undefined && pending.tab === openTab && sectionRequest === undefined;
}

/** What the Fields tab selects for a Fix, since its selection lives there. */
export type FixRequest = Pick<CheckTarget, "fieldId" | "zone" | "dataSourceId">;

/** A step's own place, or the Steps tab alone where the draft no longer holds
 * the step. */
function onStepPage(issue: CheckSite, body: Draft, place: SectionName | "page"): CheckTarget {
  const stepId = checkStep(body, issue)?.id;
  if (stepId === undefined) return { tab: "steps" };
  if (place === "page") return { tab: "steps", stepId, focusId: STEP_PAGE_NAME_ID };
  const focusId = place === "more" && namesStepKey(issue.loc) ? STEP_PAGE_KEY_ID : sectionHeaderId(place);
  const target: CheckTarget = { tab: "steps", stepId, section: place, focusId };
  return issue.entityType === "path" ? { ...target, pathId: issue.entityId } : target;
}

/**
 * The place one check's Fix control lands on (`studio-process-tabs`, design.md
 * D7). `checkPlace` decides first, so a sentence and its landing cannot
 * disagree.
 *
 * `fields` and `sources` serve a field's or a source's own rule and the
 * process's duplicate-key rules alike, so the entity tells them apart: only an
 * entity the rail lists gets selected. Only a process-wide fallback and a
 * subject the draft no longer holds answer no place. The fallback's sentence
 * sends the author to the Checks tab, so it stays there.
 */
export function checkTarget(issue: CheckSite, body: Draft): CheckTarget {
  const place = checkPlace(body, issue);
  switch (place) {
    case "json":
      return { tab: "checks", json: true, focusId: JSON_SURFACE_INPUT_ID };
    case "name":
      return { tab: "checks", focusId: PROCESS_HEADER_NAME_ID };
    case "steps":
      return { tab: "steps" };
    case "settings":
      return { tab: "settings", view: "process" };
    case "contract":
      return { tab: "settings", view: "contract" };
    case "fields": {
      const target: CheckTarget = { tab: "fields", view: "catalog" };
      if (issue.entityType !== "field" || !flattenRailFields(body.fields).some((row) => row.id === issue.entityId)) return target;
      return { ...target, fieldId: issue.entityId, zone: fieldCheckZone(issue.loc) };
    }
    case "sources": {
      const target: CheckTarget = { tab: "fields", view: "sources" };
      if (issue.entityType !== "dataSource" || !body.dataSources?.some((source) => source.id === issue.entityId)) return target;
      return { ...target, dataSourceId: issue.entityId };
    }
    case undefined:
      return issue.entityType === "process" ? { tab: "checks" } : { tab: "steps" };
    default:
      return onStepPage(issue, body, place);
  }
}

/**
 * The tab leaving the form editor returns to (`studio-forms-overview`:
 * "Leaving the form editor SHALL return to the Forms tab where the author
 * started"; `studio-form-editor`: "An author who came from the step page
 * returns to that step").
 *
 * The form editor's address carries no tab of its own, so the surface
 * remembers the tab that opened it and hands it back here. A surface holding
 * no origin returns to Steps, the editor's other entrance.
 */
export function formEditorReturnTab(openedFrom: ProcessTab | undefined): ProcessTab {
  return openedFrom ?? "steps";
}

/**
 * The open tab (`studio-process-tabs`: "On the form editor's address, the tab
 * row SHALL stand Steps current. An open from a Forms card SHALL stand Forms
 * current until the author leaves the editor").
 *
 * While the route carries a form step, the editor stands inside the origin
 * tab's body, so that tab stands current whatever tab the route names.
 * Otherwise the route's own tab does.
 */
export function surfaceTab(routeTab: ProcessTab, formStepId: string | undefined, formOrigin: ProcessTab | undefined): ProcessTab {
  return formStepId !== undefined ? formEditorReturnTab(formOrigin) : routeTab;
}

/** What a Read by row's "Open" on a place outside the Fields tab does: open
 * a step's form in the form editor, or open a tab on a target. */
export type PlaceAction = { kind: "form"; stepId: string } | { kind: "tab"; target: CheckTarget };

/**
 * The dispatch behind a Read by row's "Open" (design.md D4). A form opens the
 * form editor on its step. A way out opens the Steps tab on its step with that
 * way out marked, and a step opens the Steps tab on that step. A `field`
 * target never reaches here: the Fields tab selects it itself.
 */
export function placeAction(place: OutsidePlace): PlaceAction {
  switch (place.kind) {
    case "form":
      return { kind: "form", stepId: place.stepId };
    case "wayOut":
      return { kind: "tab", target: { tab: "steps", stepId: place.stepId, pathId: place.pathId } };
    case "step":
      return { kind: "tab", target: { tab: "steps", stepId: place.stepId } };
  }
}

import type { DraftField } from "./fields";
import type { DraftViewEntry } from "./view-layout";
import type { EditorIssue, EntityType } from "./issues";
import { flattenRailFields, issueCountForSource } from "./panel-rail";
import type { ProcessTab } from "../routing";

/** The draft shape the tab counts read. Structural, not `Draft`, so a unit
 * test can hand in the four keys a count needs and nothing else. */
export interface TabCountDraft {
  fields?: DraftField[];
  dataSources?: unknown[];
  workflow?: { steps?: { view?: { fields?: DraftViewEntry[] }; paths?: unknown[] }[] };
}

/**
 * What each tab prints beside its name (`studio-process-tabs`). `undefined`
 * is a tab that prints no number: Canvas draws a graph and Contract holds one
 * editor, so neither has a total to report.
 *
 * Field matrix reads its own view findings rather than an entity total. Its
 * declared-entry total stays in the matrix toolbar's own count line, where an
 * author reads it beside the three numbers that explain it.
 *
 * Forms counts the steps that carry a view, the whole set the Forms tab
 * plates: a view holding no field entry still draws its card, marked as an
 * empty form. The step page's own Form section counts field entries alone
 * (`studio-app`), so the two numbers legitimately differ on a note-only view.
 *
 * Changes takes the count `ChangesView` reports up, since the difference
 * against the base version needs a fetch no draft-only expression can make.
 * `undefined` there means that fetch has not landed, so the tab prints
 * nothing rather than a zero it cannot yet stand behind.
 */
export function processTabCounts(
  draft: TabCountDraft,
  issues: readonly EditorIssue[],
  changesCount: number | undefined,
): Record<ProcessTab, number | undefined> {
  const steps = draft.workflow?.steps ?? [];
  return {
    canvas: undefined,
    steps: steps.length,
    fields: flattenRailFields(draft.fields).length,
    dataSources: (draft.dataSources ?? []).length,
    paths: steps.reduce((sum, step) => sum + (step.paths?.length ?? 0), 0),
    forms: steps.filter((step) => step.view !== undefined).length,
    matrix: issueCountForSource(issues, "view"),
    contract: undefined,
    changes: changesCount,
    checks: issues.length,
  };
}

/**
 * The tab that owns an issue's subject, for a press on a Checks row
 * (`studio-process-tabs`: "A check opens the tab that owns its subject").
 *
 * A timer and an action both hang off a step, so both send the author to the
 * step. A process-level issue has no owning tab: the header bar carries it,
 * and that bar stands on every tab, so the press leaves the author on Checks.
 */
export function tabForIssue(entityType: EntityType): ProcessTab {
  switch (entityType) {
    case "step":
    case "timer":
    case "action":
      return "steps";
    case "path":
      return "paths";
    case "field":
      return "fields";
    case "dataSource":
      return "dataSources";
    case "contract":
      return "contract";
    case "process":
      return "checks";
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

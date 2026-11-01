import { describe, expect, it } from "bun:test";
import { checkTarget, formEditorReturnTab, placeAction, processTabCounts, surfaceTab, type TabCountStep } from "../src/areas/studio/draft/process-tabs.js";
import * as processTabs from "../src/areas/studio/draft/process-tabs.js";
import { checksDotState, groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
import type { EditorIssue, EntityType } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { PROCESS_TABS, TAB_VIEWS } from "../src/areas/studio/routing.js";

const FIELD = "field_00000000-0000-4000-8000-0000000000a1";
const GROUP = "field_00000000-0000-4000-8000-0000000000a2";
const CHILD = "field_00000000-0000-4000-8000-0000000000a3";

function issue(entityType: EntityType, source: EditorIssue["source"] = "cel"): EditorIssue {
  return { entityType, entityId: "x", message: "bad", source, loc: `${entityType}.x` };
}

/** Two task steps, one carrying a view and one not, plus one path. */
const draft = {
  fields: [
    { id: FIELD, key: "amount", type: "number" },
    { id: GROUP, key: "address", type: "group", fields: [{ id: CHILD, key: "city", type: "string" }] },
  ],
  dataSources: [{ id: "ds_1" }, { id: "ds_2" }],
  workflow: {
    steps: [
      { view: { fields: [{ ref: FIELD }] }, paths: [{ id: "path_1" }, { id: "path_2" }] },
      { view: { fields: [{ kind: "note", text: { en: "Note" } }] } },
      {},
    ],
  },
} as any;

describe("processTabCounts", () => {
  it("answers exactly the six tabs, in the row's order", () => {
    expect(Object.keys(processTabCounts(draft, []))).toEqual([...PROCESS_TABS]);
  });

  it("counts the steps and the catalog's fields, groups and their members included", () => {
    const counts = processTabCounts(draft, []);

    expect(counts.steps).toBe(3);
    expect(counts.fields).toBe(3);
  });

  it("prints no number on Map and none on Settings", () => {
    const counts = processTabCounts(draft, []);

    expect(counts.map).toBeUndefined();
    expect(counts.settings).toBeUndefined();
  });

  it("counts every step that carries a view under Forms", () => {
    // `studio-process-tabs`: "Forms counts the steps that carry a view". The
    // second step's view holds a note alone and still carries a view, so it
    // counts and the Forms tab plates it; the third declares none.
    expect(processTabCounts(draft, []).forms).toBe(2);
  });

  it("counts every open issue under Checks", () => {
    expect(processTabCounts(draft, [issue("step"), issue("field", "view")]).checks).toBe(2);
  });

  // The count follows an edit at once, with no reload: it is derived from the
  // draft the surface holds, never fetched or cached.
  it("raises the Steps count by one when an author adds a step", () => {
    const before = processTabCounts(draft, []).steps;
    const after = processTabCounts({ ...draft, workflow: { steps: [...draft.workflow.steps, { id: "step_new" }] } }, []).steps;

    expect(after).toBe((before ?? 0) + 1);
  });
});

/** Three steps carrying every position an action, a timer or a path can
 * hold, so each lookup below has one right answer and two wrong ones. */
const STEPS: TabCountStep[] = [
  { id: "step_a", onEntry: [{ id: "act_entry" }], onExit: [{ id: "act_exit" }] },
  {
    id: "step_b",
    onCancel: [{ id: "act_cancel" }],
    paths: [{ id: "path_b1", onPath: [{ id: "act_path" }] }],
    timers: [{ id: "timer_b1", onFire: { actions: [{ id: "act_fire" }] } }],
  },
  { id: "step_c", paths: [{ id: "path_c1" }], timers: [{ id: "timer_c1" }] },
];

const target = (entityType: EntityType, entityId: string) => checkTarget({ entityType, entityId }, STEPS);

describe("checkTarget", () => {
  it("opens the Steps tab on the step a step issue names", () => {
    expect(target("step", "step_b")).toEqual({ tab: "steps", stepId: "step_b" });
  });

  it("opens the Steps tab on the step that carries a timer", () => {
    expect(target("timer", "timer_b1")).toEqual({ tab: "steps", stepId: "step_b" });
    expect(target("timer", "timer_c1")).toEqual({ tab: "steps", stepId: "step_c" });
  });

  it("opens the Steps tab on the step that carries an action, at each of the five positions", () => {
    expect(target("action", "act_entry")).toEqual({ tab: "steps", stepId: "step_a" });
    expect(target("action", "act_exit")).toEqual({ tab: "steps", stepId: "step_a" });
    expect(target("action", "act_cancel")).toEqual({ tab: "steps", stepId: "step_b" });
    expect(target("action", "act_path")).toEqual({ tab: "steps", stepId: "step_b" });
    expect(target("action", "act_fire")).toEqual({ tab: "steps", stepId: "step_b" });
  });

  it("opens the Steps tab on the step a path leaves, naming the path", () => {
    expect(target("path", "path_c1")).toEqual({ tab: "steps", stepId: "step_c", pathId: "path_c1" });
  });

  it("opens the Steps tab alone for a subject the draft no longer holds", () => {
    for (const entityType of ["step", "timer", "action", "path"] as const) {
      expect(target(entityType, "gone")).toEqual({ tab: "steps" });
    }
  });

  it("opens the Fields tab's Catalog view for a field issue", () => {
    expect(target("field", FIELD)).toEqual({ tab: "fields", view: "catalog" });
  });

  it("opens the Settings tab's sources view for a data source issue", () => {
    expect(target("dataSource", "ds_1")).toEqual({ tab: "fields", view: "sources" });
  });

  it("opens the Settings tab's contract view for a contract issue", () => {
    expect(target("contract", "contract")).toEqual({ tab: "settings", view: "contract" });
  });

  it("leaves a process-level issue on Checks, since the header bar carries it on every tab", () => {
    expect(target("process", "process")).toEqual({ tab: "checks" });
  });

  it("names a tab the row holds and a view that tab holds, for every entity type", () => {
    const every: EntityType[] = ["process", "field", "dataSource", "step", "path", "timer", "action", "contract"];

    for (const entityType of every) {
      const found = target(entityType, "x");
      expect(PROCESS_TABS).toContain(found.tab);
      if (found.view !== undefined) expect(TAB_VIEWS[found.tab]).toContain(found.view);
    }
  });

  it("leaves the retired hand-offs out of the module", () => {
    expect("tabForIssue" in processTabs).toBe(false);
    expect("tabForChangeGroup" in processTabs).toBe(false);
  });
});

const RAN = {
  zod: "ran",
  duration: "ran",
  structural: "ran",
  actionType: "ran",
  assignmentType: "ran",
  dataSourceType: "ran",
  registryConfig: "not-run",
  cel: "ran",
} as const;

function validationOf(issues: EditorIssue[], zodValid = true): ValidationResult {
  return {
    zodValid,
    issues,
    dimensions: zodValid ? { ...RAN } : { ...RAN, structural: "not-run" },
    subprocessStepStatus: {},
    chainingSiteStatus: {},
  };
}

describe("checksDotState", () => {
  it("reads blocker for an open issue an engine validator raised", () => {
    expect(checksDotState(groupChecksBySource(validationOf([issue("step", "structural")])))).toBe("blocker");
  });

  it("reads advisory for the studio's own view findings alone", () => {
    expect(checksDotState(groupChecksBySource(validationOf([issue("step", "view")])))).toBe("advisory");
  });

  it("reads clear for a draft with no open issue", () => {
    expect(checksDotState(groupChecksBySource(validationOf([])))).toBe("clear");
  });

  it("refuses to read clear while a group holds back", () => {
    expect(checksDotState(groupChecksBySource(validationOf([], false)))).toBe("blocker");
  });

  it("reads the worst issue, so a blocker outranks an advisory one", () => {
    const both = validationOf([issue("step", "view"), issue("step", "cel")]);

    expect(checksDotState(groupChecksBySource(both))).toBe("blocker");
  });
});

/**
 * Both directions of the form editor's own address (task 4.4). The card and
 * the step page's Form section both open `edit/form/:stepId`, and leaving it
 * returns to whichever of the two opened it.
 */
describe("formEditorReturnTab", () => {
  it("returns to Forms for an author who opened the editor from a card", () => {
    expect(formEditorReturnTab("forms")).toBe("forms");
  });

  it("returns to Steps for an author who opened the editor from the step page", () => {
    expect(formEditorReturnTab("steps")).toBe("steps");
  });

  it("returns to Steps where the surface holds no origin", () => {
    expect(formEditorReturnTab(undefined)).toBe("steps");
  });
});

/**
 * The tab standing current on the process surface. On the form editor's
 * address the editor stands inside its origin tab's body.
 */
describe("surfaceTab", () => {
  it("answers the route's tab while no form step is open", () => {
    expect(surfaceTab("fields", undefined, undefined)).toBe("fields");
  });

  it("ignores a stale origin while no form step is open", () => {
    expect(surfaceTab("map", undefined, "forms")).toBe("map");
  });

  it("answers Forms on the form editor's address after a Forms card", () => {
    expect(surfaceTab("map", "step_1", "forms")).toBe("forms");
  });

  it("answers Steps on the form editor's address after the step page", () => {
    expect(surfaceTab("map", "step_1", "steps")).toBe("steps");
  });

  it("answers Steps on a direct load of the form editor's address", () => {
    expect(surfaceTab("map", "step_1", undefined)).toBe("steps");
  });
});

// design.md D4: a Read by row's "Open" on a place outside the Fields tab.
describe("placeAction", () => {
  it("opens the Steps tab on a way out's step, with the way out marked", () => {
    expect(placeAction({ kind: "wayOut", stepId: "step_a", pathId: "path_1" })).toEqual({
      kind: "tab",
      target: { tab: "steps", stepId: "step_a", pathId: "path_1" },
    });
  });

  it("opens the Steps tab on a step, with no way out marked", () => {
    expect(placeAction({ kind: "step", stepId: "step_b" })).toEqual({ kind: "tab", target: { tab: "steps", stepId: "step_b" } });
  });

  it("opens a form's step in the form editor", () => {
    expect(placeAction({ kind: "form", stepId: "step_c" })).toEqual({ kind: "form", stepId: "step_c" });
  });
});

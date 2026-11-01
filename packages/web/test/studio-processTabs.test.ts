import { describe, expect, it } from "bun:test";
import { checkTarget, formEditorReturnTab, placeAction, processTabCounts, sectionHeaderId, surfaceTab } from "../src/areas/studio/draft/process-tabs.js";
import * as processTabs from "../src/areas/studio/draft/process-tabs.js";
import { checkAnswer } from "../src/areas/studio/draft/checkSentence.js";
import { checksDotState, groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
import { runValidation } from "../src/areas/studio/draft/validation.js";
import type { EditorIssue, EntityType } from "../src/areas/studio/draft/issues.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
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
 * hold, so each lookup below has one right answer and two wrong ones. Each
 * carries a `type`: the section lookup reads the step's kind. */
const BODY = {
  baseLocale: "en",
  fields: [
    { id: "field_a", key: "amount", type: "string", label: { en: "Amount" } },
    { id: "field_g", key: "group", type: "group", label: { en: "Group" }, fields: [{ id: "field_c", key: "city", type: "string", label: { en: "City" } }] },
  ],
  dataSources: [{ id: "ds_1", key: "countries", type: "static" }],
  contract: { outcomes: ["done"] },
  workflow: {
    steps: [
      { id: "step_a", type: "task", label: { en: "A" }, onEntry: [{ id: "act_entry" }], onExit: [{ id: "act_exit" }] },
      {
        id: "step_b",
        type: "task",
        label: { en: "B" },
        onCancel: [{ id: "act_cancel" }],
        paths: [{ id: "path_b1", label: "Go", onPath: [{ id: "act_path" }] }],
        timers: [{ id: "timer_b1", onFire: { actions: [{ id: "act_fire" }] } }],
      },
      { id: "step_c", type: "task", label: { en: "C" }, paths: [{ id: "path_c1", label: "On" }], timers: [{ id: "timer_c1" }] },
    ],
  },
} as unknown as Draft;

/** A message no rule knows, so the entity's own fallback answers. */
const UNKNOWN = "no rule knows this";
const MISSING = "missing baseLocale ('en') entry";
const BUILT_IN = "Invalid input: expected string, received object";

const at = (entityType: EntityType, entityId: string, loc = "", message = UNKNOWN) => checkTarget({ entityType, entityId, loc, message }, BODY);

describe("checkTarget", () => {
  describe("on a step", () => {
    it("opens the section that owns a step's check, with focus on its header", () => {
      expect(at("step", "step_a", "workflow.steps[0].assignment.strategy", BUILT_IN)).toEqual({
        tab: "steps",
        stepId: "step_a",
        section: "assignment",
        focusId: "step-section-assignment",
      });
    });

    it("opens More for a check on the step's key", () => {
      expect(at("step", "step_a", "workflow.steps[0].key", BUILT_IN)).toMatchObject({ stepId: "step_a", section: "more" });
    });

    it("opens the step alone for its name, its description and its kind, with focus on Name", () => {
      const onName = { tab: "steps", stepId: "step_a", focusId: "step-page-name" } as const;

      expect(at("step", "step_a", "workflow.steps[0].label", MISSING)).toEqual(onName);
      expect(at("step", "step_a", "workflow.steps[0].description", MISSING)).toEqual(onName);
      expect(at("step", "step_a", "workflow.steps[0].type", BUILT_IN)).toEqual(onName);
    });

    it("opens Ways out on the step a path leaves, and marks the path", () => {
      expect(at("path", "path_c1", "workflow.steps[2].paths[0].label", BUILT_IN)).toEqual({
        tab: "steps",
        stepId: "step_c",
        pathId: "path_c1",
        section: "paths",
        focusId: "step-section-paths",
      });
    });

    it("opens Time limit on the step that carries a timer", () => {
      expect(at("timer", "timer_b1")).toEqual({ tab: "steps", stepId: "step_b", section: "timers", focusId: "step-section-timers" });
      expect(at("timer", "timer_c1")).toMatchObject({ stepId: "step_c", section: "timers" });
    });

    it("opens the section that owns an action, at each of the five positions", () => {
      expect(at("action", "act_entry")).toMatchObject({ stepId: "step_a", section: "lifecycle" });
      expect(at("action", "act_exit")).toMatchObject({ stepId: "step_a", section: "lifecycle" });
      expect(at("action", "act_cancel")).toMatchObject({ stepId: "step_b", section: "lifecycle" });
      expect(at("action", "act_path")).toMatchObject({ stepId: "step_b", section: "paths" });
      expect(at("action", "act_fire")).toMatchObject({ stepId: "step_b", section: "timers" });
    });

    it("opens the Steps tab alone for a subject the draft no longer holds", () => {
      for (const entityType of ["step", "timer", "action", "path"] as const) {
        expect(at(entityType, "gone")).toEqual({ tab: "steps" });
      }
    });

    it("opens the Steps tab alone for the check that no step comes first", () => {
      expect(at("process", "process", "workflow.initialStep", "initialStep does not resolve: step_x")).toEqual({ tab: "steps" });
    });
  });

  describe("on a field or a source", () => {
    it("selects a field in the Catalog view, and names the zone its check stands in", () => {
      expect(at("field", "field_a", "fields[0].validation.pattern", BUILT_IN)).toEqual({
        tab: "fields",
        view: "catalog",
        fieldId: "field_a",
        zone: "validation",
      });
    });

    it("selects a field inside a group", () => {
      expect(at("field", "field_c", "fields[1].fields[0].default", BUILT_IN)).toMatchObject({ fieldId: "field_c", zone: "default" });
    });

    it("sets no focus of its own on a field, since the Fields tab owns that", () => {
      expect(at("field", "field_a", "fields[0].label", MISSING).focusId).toBeUndefined();
    });

    it("selects a data source in the Where values come from view", () => {
      expect(at("dataSource", "ds_1", "dataSources[0].key", BUILT_IN)).toEqual({ tab: "fields", view: "sources", dataSourceId: "ds_1" });
    });

    it("selects nothing the rail would not list, so the focus pass cannot wait for ever", () => {
      expect(at("field", "gone")).toEqual({ tab: "fields", view: "catalog" });
      expect(at("dataSource", "gone")).toEqual({ tab: "fields", view: "sources" });
    });

    it("tells a duplicate field id from a duplicate field key", () => {
      // Both sit at `fields`: only the rule's place separates them.
      expect(at("process", "process", "fields", "duplicate field ids")).toEqual({ tab: "checks", json: true, focusId: "json-surface-input" });
      expect(at("process", "process", "fields", "duplicate field keys")).toEqual({ tab: "fields", view: "catalog" });
    });

    it("opens Where values come from for a duplicate source name, with no source selected", () => {
      expect(at("process", "process", "dataSources", "duplicate data source keys")).toEqual({ tab: "fields", view: "sources" });
    });
  });

  describe("on the process", () => {
    it("opens What it takes in and gives back for a contract check", () => {
      expect(at("contract", "contract", "contract.outcomes", BUILT_IN)).toEqual({ tab: "settings", view: "contract" });
    });

    it("stays put for the process's name, with focus on the header bar's input", () => {
      expect(at("process", "process", "label", MISSING)).toEqual({ tab: "checks", focusId: "process-header-name" });
    });

    it("opens the Process view for the process's key and base language, on the messages validation raises", () => {
      const body = {
        label: { en: "P" },
        baseLocale: "NOT A LOCALE",
        fields: [],
        workflow: { initialStep: "step_a", steps: [{ id: "step_a", key: "a", label: { en: "A" }, type: "task", terminal: true }] },
      } as unknown as Draft;
      const issues = runValidation(body, undefined, {}, {}).issues;
      const issueAt = (loc: string) => issues.find((i) => i.loc === loc)!;

      expect(issueAt("key").message).toBe("Invalid input: expected string, received undefined");
      expect(issueAt("baseLocale").message).toStartWith("Invalid string: must match pattern");
      expect(checkAnswer(body, issueAt("key"))).toMatchObject({ tier: 3, place: "settings" });
      expect(checkAnswer(body, issueAt("baseLocale"))).toMatchObject({ tier: 3, place: "settings" });
      expect(checkTarget(issueAt("key"), body)).toEqual({ tab: "settings", view: "process" });
      expect(checkTarget(issueAt("baseLocale"), body)).toEqual({ tab: "settings", view: "process" });
    });

    it("stays on Checks for a process check with no place, whose sentence sends the author there", () => {
      expect(at("process", "process", "somewhere", UNKNOWN)).toEqual({ tab: "checks" });
      expect(at("process", "process", "key", UNKNOWN)).toEqual({ tab: "checks" });
    });

    it("opens the JSON surface for a check whose sentence names it", () => {
      expect(at("step", "step_a", "workflow.steps[0].id", BUILT_IN)).toEqual({ tab: "checks", json: true, focusId: "json-surface-input" });
    });
  });

  it("names a tab the row holds and a view that tab holds, for every entity type", () => {
    const every: EntityType[] = ["process", "field", "dataSource", "step", "path", "timer", "action", "contract"];

    for (const entityType of every) {
      const found = at(entityType, "x");
      expect(PROCESS_TABS).toContain(found.tab);
      if (found.view !== undefined) expect(TAB_VIEWS[found.tab]).toContain(found.view);
    }
  });

  it("builds a section's focus target from the id its header carries", () => {
    expect(sectionHeaderId("timers")).toBe("step-section-timers");
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

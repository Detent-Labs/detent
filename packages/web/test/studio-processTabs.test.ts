import { describe, expect, it } from "bun:test";
import { formEditorReturnTab, processTabCounts, tabForIssue } from "../src/areas/studio/draft/process-tabs.js";
import { checksDotState, groupChecksBySource } from "../src/areas/studio/draft/checksRail.js";
import type { EditorIssue, EntityType } from "../src/areas/studio/draft/issues.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { PROCESS_TABS } from "../src/areas/studio/routing.js";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("processTabCounts", () => {
  it("prints a number for every tab that has one to print", () => {
    const counts = processTabCounts(draft, [], undefined);

    expect(counts.steps).toBe(3);
    expect(counts.fields).toBe(3);
    expect(counts.dataSources).toBe(2);
    expect(counts.paths).toBe(2);
  });

  it("prints no number on Canvas and none on Contract", () => {
    const counts = processTabCounts(draft, [], undefined);

    expect(counts.canvas).toBeUndefined();
    expect(counts.contract).toBeUndefined();
  });

  it("counts every step that carries a view under Forms", () => {
    // `studio-process-tabs`: "Forms counts the steps that carry a view". The
    // second step's view holds a note alone and still carries a view, so it
    // counts and the Forms tab plates it; the third declares none.
    expect(processTabCounts(draft, [], undefined).forms).toBe(2);
  });

  it("counts the field matrix's own view findings, not its declared entries", () => {
    const counts = processTabCounts(draft, [issue("step", "view"), issue("field", "view"), issue("step", "cel")], undefined);

    expect(counts.matrix).toBe(2);
  });

  it("counts every open issue under Checks", () => {
    expect(processTabCounts(draft, [issue("step"), issue("field")], undefined).checks).toBe(2);
  });

  it("takes the Changes count from the fetch, and prints nothing until it lands", () => {
    expect(processTabCounts(draft, [], undefined).changes).toBeUndefined();
    expect(processTabCounts(draft, [], 4).changes).toBe(4);
  });

  // The count follows an edit at once, with no reload: it is derived from the
  // draft the surface holds, never fetched or cached.
  it("raises the Steps count by one when an author adds a step", () => {
    const before = processTabCounts(draft, [], undefined).steps;
    const after = processTabCounts(
      { ...draft, workflow: { steps: [...draft.workflow.steps, { id: "step_new" }] } },
      [],
      undefined,
    ).steps;

    expect(after).toBe((before ?? 0) + 1);
  });

  it("names every tab the row holds, so no tab is left without an answer", () => {
    const counts = processTabCounts(draft, [], undefined);

    for (const tab of PROCESS_TABS) expect(tab in counts).toBe(true);
  });
});

describe("tabForIssue", () => {
  it("sends a step's issue to the Steps tab", () => {
    expect(tabForIssue("step")).toBe("steps");
  });

  it("sends a field's issue to the Fields tab", () => {
    expect(tabForIssue("field")).toBe("fields");
  });

  it("sends a path's issue to the Paths tab", () => {
    expect(tabForIssue("path")).toBe("paths");
  });

  it("sends a timer's and an action's issue to the step they hang off", () => {
    expect(tabForIssue("timer")).toBe("steps");
    expect(tabForIssue("action")).toBe("steps");
  });

  it("sends a data source's and the contract's issue to their own tabs", () => {
    expect(tabForIssue("dataSource")).toBe("dataSources");
    expect(tabForIssue("contract")).toBe("contract");
  });

  it("leaves a process-level issue on Checks, since the header bar carries it on every tab", () => {
    expect(tabForIssue("process")).toBe("checks");
  });

  it("names a tab the row actually holds, for every entity type", () => {
    const every: EntityType[] = ["process", "field", "dataSource", "step", "path", "timer", "action", "contract"];

    for (const entityType of every) expect(PROCESS_TABS).toContain(tabForIssue(entityType));
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

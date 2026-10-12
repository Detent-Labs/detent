import { describe, expect, it } from "bun:test";
import { processBody } from "workflow-engine/schema";
import { DRAFT_SHAPE, KNOWN_KEYS, checkDraftShape, type Shape } from "../src/areas/studio/draft/load-guard.js";
import { RECURSION, containerNodes } from "./zodContainerPaths.js";

/** `DRAFT_SHAPE` as the `path kind` rows `containerNodes` yields, with the same marker where the table refers to itself. */
function flatten(shape: Shape, prefix: string, ancestry: ReadonlySet<Shape>): string[] {
  const rows: string[] = [];
  const within = new Set(ancestry).add(shape);
  const at = (key: string) => (prefix ? `${prefix}.${key}` : key);
  for (const [key, child] of Object.entries(shape.objects ?? {})) {
    rows.push(`${at(key)} object`, ...flatten(child, at(key), within));
  }
  for (const [key, element] of Object.entries(shape.arrays ?? {})) {
    rows.push(`${at(key)} array`);
    if (element === "strings") continue;
    if (within.has(element)) rows.push(`${at(key)}[]${RECURSION} object`);
    else rows.push(`${at(key)}[] object`, ...flatten(element, `${at(key)}[]`, within));
  }
  return rows;
}

describe("DRAFT_SHAPE", () => {
  // A record holds free-form keys, so the guard treats it as the object it is.
  const schemaRows = containerNodes(processBody)
    .filter((node) => node.path !== "")
    .map((node) => `${node.path} ${node.kind === "record" ? "object" : node.kind}`);

  it("has a row for every container processBody declares, and none else", () => {
    const tableRows = flatten(DRAFT_SHAPE, "", new Set());
    expect({
      missingFromTable: schemaRows.filter((row) => !tableRows.includes(row)).sort(),
      notInSchema: tableRows.filter((row) => !schemaRows.includes(row)).sort(),
    }).toEqual({ missingFromTable: [], notInSchema: [] });
  });

  it("reaches the containers the studio iterates, view.fields[] and the nested group included", () => {
    expect(schemaRows).toContain("workflow.steps[].view.fields[] object");
    expect(schemaRows).toContain("fields[].fields[] (recursion) object");
    expect(schemaRows).not.toContain("workflow.steps[].view.fields[].validation object");
  });
});

describe("KNOWN_KEYS", () => {
  it("lists exactly the top-level keys processBody declares", () => {
    expect([...KNOWN_KEYS].sort()).toEqual(Object.keys(processBody.shape).sort());
  });
});

const stepsOf = (...steps: unknown[]) => ({ workflow: { steps } });

describe("checkDraftShape nested containers", () => {
  it("flags workflow.steps typed as an object", () => {
    expect(checkDraftShape({ workflow: { steps: {} } })).toEqual([{ path: "workflow.steps", message: "'workflow.steps' must be an array if present" }]);
  });

  it("flags a string where a step belongs, by index", () => {
    expect(checkDraftShape(stepsOf({ id: "step_a" }, "oops"))).toEqual([{ path: "workflow.steps[1]", message: "'workflow.steps[1]' must be an object" }]);
    expect(checkDraftShape(stepsOf(null))).toEqual([{ path: "workflow.steps[0]", message: "'workflow.steps[0]' must be an object" }]);
    expect(checkDraftShape(stepsOf([]))).toEqual([{ path: "workflow.steps[0]", message: "'workflow.steps[0]' must be an object" }]);
  });

  it("flags a null view", () => {
    expect(checkDraftShape(stepsOf({ view: null }))).toEqual([
      { path: "workflow.steps[0].view", message: "'workflow.steps[0].view' must be an object if present" },
    ]);
  });

  it("flags a step's paths typed as an object, naming the step's index", () => {
    expect(checkDraftShape(stepsOf({ paths: [] }, { paths: [] }, { paths: {} }))).toEqual([
      { path: "workflow.steps[2].paths", message: "'workflow.steps[2].paths' must be an array if present" },
    ]);
  });

  it("flags a null container at every depth", () => {
    for (const body of [
      { label: null },
      { contract: { inputFields: null } },
      { fields: [{ options: null }] },
      { workflow: null },
      { workflow: { steps: null } },
      stepsOf({ paths: null }),
      stepsOf({ timers: [{ onFire: null }] }),
    ]) {
      expect(checkDraftShape(body)).toHaveLength(1);
    }
  });

  it("flags every malformed step container in one pass", () => {
    const issues = checkDraftShape(stepsOf({ paths: "x", timers: {}, onEntry: 3, view: [] }));
    expect(issues.map((i) => i.path).sort()).toEqual([
      "workflow.steps[0].onEntry",
      "workflow.steps[0].paths",
      "workflow.steps[0].timers",
      "workflow.steps[0].view",
    ]);
  });

  it("checks the action lists under paths, timers and the entry hooks", () => {
    expect(checkDraftShape(stepsOf({ paths: [{ onPath: {} }] }))).toEqual([
      { path: "workflow.steps[0].paths[0].onPath", message: "'workflow.steps[0].paths[0].onPath' must be an array if present" },
    ]);
    expect(checkDraftShape(stepsOf({ timers: [{ onFire: { actions: "x" } }] }))).toEqual([
      { path: "workflow.steps[0].timers[0].onFire.actions", message: "'workflow.steps[0].timers[0].onFire.actions' must be an array if present" },
    ]);
    expect(checkDraftShape(stepsOf({ onCancel: [{ type: "a", config: [] }] }))).toEqual([
      { path: "workflow.steps[0].onCancel[0].config", message: "'workflow.steps[0].onCancel[0].config' must be an object if present" },
    ]);
  });

  it("checks view fields, their elements and the tabs", () => {
    expect(checkDraftShape(stepsOf({ view: { fields: {} } }))).toEqual([
      { path: "workflow.steps[0].view.fields", message: "'workflow.steps[0].view.fields' must be an array if present" },
    ]);
    expect(checkDraftShape(stepsOf({ view: { fields: [{ ref: "fld_a" }, "oops"] } }))).toEqual([
      { path: "workflow.steps[0].view.fields[1]", message: "'workflow.steps[0].view.fields[1]' must be an object" },
    ]);
    expect(checkDraftShape(stepsOf({ view: { tabs: [{ label: "x" }] } }))).toEqual([
      { path: "workflow.steps[0].view.tabs[0].label", message: "'workflow.steps[0].view.tabs[0].label' must be an object if present" },
    ]);
  });

  it("checks a nested group's members and options at any depth", () => {
    const group = { type: "group", fields: [{ type: "string" }, { type: "group", fields: { not: "an array" } }] };
    expect(checkDraftShape({ fields: [{ type: "string" }, group] })).toEqual([
      { path: "fields[1].fields[1].fields", message: "'fields[1].fields[1].fields' must be an array if present" },
    ]);
    expect(checkDraftShape({ fields: [{ options: [{ value: "a" }, 7] }] })).toEqual([
      { path: "fields[0].options[1]", message: "'fields[0].options[1]' must be an object" },
    ]);
  });

  it("checks the id lists as arrays and skips their elements", () => {
    expect(checkDraftShape({ allowedGroups: [1, null, "g"], contract: { inputFields: ["fld_a"], outcomes: [3] } })).toEqual([]);
    expect(checkDraftShape({ contract: { outcomes: "done" } })).toEqual([{ path: "contract.outcomes", message: "'contract.outcomes' must be an array if present" }]);
  });

  it("does not descend into a container that failed its own type check", () => {
    expect(checkDraftShape({ workflow: { steps: { paths: 3 } } })).toHaveLength(1);
  });

  it("does not look below a view entry", () => {
    expect(checkDraftShape(stepsOf({ view: { fields: [{ ref: "fld_a", validation: "oops", group: 4 }] } }))).toEqual([]);
  });

  it("accepts a step that omits its optional containers", () => {
    expect(checkDraftShape(stepsOf({ id: "step_a" }))).toEqual([]);
    expect(checkDraftShape(stepsOf({ paths: undefined, timers: undefined, view: undefined }))).toEqual([]);
    expect(checkDraftShape({ workflow: {} })).toEqual([]);
  });

  it("accepts a well-typed body that breaks a contract rule", () => {
    // No outgoing path on a non-terminal step, an initialStep that resolves to nothing, and a duplicate field key.
    expect(
      checkDraftShape({
        key: "broken",
        fields: [{ key: "a" }, { key: "a" }],
        workflow: { initialStep: "step_missing", steps: [{ id: "step_a", type: "task", paths: [] }] },
      }),
    ).toEqual([]);
  });
});

describe("checkDraftShape top-level keys", () => {
  it("accepts a body carrying process-level collaboration", () => {
    expect(checkDraftShape({ label: { en: "Expense" }, collaboration: { comments: false } })).toEqual([]);
  });

  it("flags a misspelled collaboration key by name", () => {
    expect(checkDraftShape({ colaboration: {} })).toEqual([
      { path: "colaboration", message: "unrecognized top-level field 'colaboration' — this may not be a process body" },
    ]);
  });

  it("flags collaboration that is not an object", () => {
    expect(checkDraftShape({ collaboration: "off" })).toEqual([{ path: "collaboration", message: "'collaboration' must be an object if present" }]);
    expect(checkDraftShape({ collaboration: null })).toEqual([{ path: "collaboration", message: "'collaboration' must be an object if present" }]);
  });
});

describe("checkDraftShape", () => {
  it("rejects a non-object root", () => {
    expect(checkDraftShape([])).toEqual([{ path: "", message: "root is not a JSON object" }]);
    expect(checkDraftShape(null)).toEqual([{ path: "", message: "root is not a JSON object" }]);
    expect(checkDraftShape("hello")).toEqual([{ path: "", message: "root is not a JSON object" }]);
    expect(checkDraftShape(42)).toEqual([{ path: "", message: "root is not a JSON object" }]);
  });

  it("flags an unrecognized top-level key", () => {
    const issues = checkDraftShape({ notAField: true });
    expect(issues).toContainEqual({ path: "notAField", message: "unrecognized top-level field 'notAField' — this may not be a process body" });
  });

  it("flags a known field with the wrong type", () => {
    expect(checkDraftShape({ key: 42 })).toContainEqual({ path: "key", message: "'key' must be a string if present" });
    expect(checkDraftShape({ fields: "oops" })).toContainEqual({ path: "fields", message: "'fields' must be an array if present" });
    expect(checkDraftShape({ dataSources: "oops" })).toContainEqual({ path: "dataSources", message: "'dataSources' must be an array if present" });
    expect(checkDraftShape({ contract: [] })).toContainEqual({ path: "contract", message: "'contract' must be an object if present" });
    expect(checkDraftShape({ label: "oops" })).toContainEqual({ path: "label", message: "'label' must be an object if present" });
    expect(checkDraftShape({ description: "oops" })).toContainEqual({ path: "description", message: "'description' must be an object if present" });
    expect(checkDraftShape({ workflow: "oops" })).toContainEqual({ path: "workflow", message: "'workflow' must be an object if present" });
  });

  it("returns no issues for an empty object", () => {
    expect(checkDraftShape({})).toEqual([]);
  });

  it("returns no issues for a fully-valid object", () => {
    expect(
      checkDraftShape({
        key: "expense-approval",
        label: { en: "Expense approval" },
        description: { en: "..." },
        baseLocale: "en",
        contract: { inputFields: [], outputFields: [], outcomes: [] },
        fields: [],
        dataSources: [],
        workflow: { steps: [], initialStep: "step_1" },
      }),
    ).toEqual([]);
  });
});

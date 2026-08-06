import { describe, expect, it } from "bun:test";
import {
  flattenRailFields,
  issueCountForEntityType,
  stepEntityIds,
  stepIssueCount,
} from "../src/areas/studio/draft/panel-rail.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import type { EditorIssue } from "../src/areas/studio/draft/issues.js";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";

const OUTER = "field_00000000-0000-4000-8000-0000000000a1";
const MIDDLE = "field_00000000-0000-4000-8000-0000000000a2";
const LEAF = "field_00000000-0000-4000-8000-0000000000a3";

const STEP = "step_00000000-0000-4000-8000-0000000000b1";
const PATH = "path_00000000-0000-4000-8000-0000000000b2";
const TIMER = "timer_00000000-0000-4000-8000-0000000000b3";
const ENTRY_ACTION = "action_00000000-0000-4000-8000-0000000000b4";
const PATH_ACTION = "action_00000000-0000-4000-8000-0000000000b5";
const FIRE_ACTION = "action_00000000-0000-4000-8000-0000000000b6";

function issue(entityType: EditorIssue["entityType"], entityId: string): EditorIssue {
  return { entityType, entityId, message: "bad", source: "cel" };
}

describe("flattenRailFields", () => {
  it("indents a group field's children once", () => {
    const fields = [
      { id: OUTER, key: "address", type: "group", fields: [{ id: LEAF, key: "city", type: "string" }] },
    ] as DraftField[];
    expect(flattenRailFields(fields)).toEqual([
      { id: OUTER, key: "address", depth: 0 },
      { id: LEAF, key: "city", depth: 1 },
    ]);
  });

  it("relocates a twice-nested field to its own top-level row instead of a third indent", () => {
    // The rail caps indentation at two levels. The draft keeps its own
    // nesting: this function reads the tree, it never rewrites it.
    const fields = [
      {
        id: OUTER,
        key: "address",
        type: "group",
        fields: [{ id: MIDDLE, key: "street", type: "group", fields: [{ id: LEAF, key: "number", type: "string" }] }],
      },
    ] as DraftField[];
    expect(flattenRailFields(fields)).toEqual([
      { id: OUTER, key: "address", depth: 0 },
      { id: MIDDLE, key: "street", depth: 1 },
      { id: LEAF, key: "number", depth: 0 },
    ]);
  });

  it("skips a field with no id, since the rail has no anchor for it", () => {
    const fields = [{ key: "unsaved", type: "string" }, { id: LEAF, key: "city", type: "string" }] as DraftField[];
    expect(flattenRailFields(fields)).toEqual([{ id: LEAF, key: "city", depth: 0 }]);
  });

  it("reads an untyped key as the empty string rather than dropping the row", () => {
    expect(flattenRailFields([{ id: LEAF, type: "string" }] as DraftField[])).toEqual([
      { id: LEAF, key: "", depth: 0 },
    ]);
  });

  it("returns nothing for an absent catalog", () => {
    expect(flattenRailFields(undefined)).toEqual([]);
  });
});

describe("issueCountForEntityType", () => {
  it("counts only the view's own entity type", () => {
    const issues = [issue("field", LEAF), issue("field", OUTER), issue("dataSource", "ds_1"), issue("contract", "contract")];
    expect(issueCountForEntityType(issues, "field")).toBe(2);
    expect(issueCountForEntityType(issues, "dataSource")).toBe(1);
    expect(issueCountForEntityType(issues, "contract")).toBe(1);
  });

  it("reads zero for a view with no issue", () => {
    expect(issueCountForEntityType([issue("field", LEAF)], "contract")).toBe(0);
  });
});

const step = {
  id: STEP,
  key: "review",
  onEntry: [{ id: ENTRY_ACTION, type: "http.call", config: {} }],
  paths: [{ id: PATH, trigger: "manual", onPath: [{ id: PATH_ACTION, type: "http.call", config: {} }] }],
  timers: [{ id: TIMER, duration: "PT1H", onFire: { actions: [{ id: FIRE_ACTION, type: "http.call", config: {} }] } }],
} as DraftOf<Step>;

describe("stepEntityIds", () => {
  it("collects the step, its paths, its timers and its actions in all five positions", () => {
    expect(new Set(stepEntityIds(step))).toEqual(
      new Set([STEP, PATH, TIMER, ENTRY_ACTION, PATH_ACTION, FIRE_ACTION]),
    );
  });

  it("collects the step alone when it carries nothing nested", () => {
    expect(stepEntityIds({ id: STEP } as DraftOf<Step>)).toEqual([STEP]);
  });

  it("skips an entity with no id", () => {
    const partial = { id: STEP, paths: [{ trigger: "manual" }] } as DraftOf<Step>;
    expect(stepEntityIds(partial)).toEqual([STEP]);
  });
});

describe("stepIssueCount", () => {
  // The invariant this rejects: a count filtered on the step's own entityId
  // alone. `resolveLoc` resolves a guard's issue to the PATH, so that count
  // reads zero here and the section index reports a clean step.
  it("counts an issue that resolved to the step's own path", () => {
    expect(stepIssueCount([issue("path", PATH)], step)).toBe(1);
  });

  it("counts issues on the step, a path, a timer and an action together", () => {
    const issues = [issue("step", STEP), issue("path", PATH), issue("timer", TIMER), issue("action", FIRE_ACTION)];
    expect(stepIssueCount(issues, step)).toBe(4);
  });

  it("ignores an issue belonging to another step", () => {
    const other = "step_00000000-0000-4000-8000-0000000000c1";
    expect(stepIssueCount([issue("step", other), issue("field", LEAF)], step)).toBe(0);
  });

  it("reads zero for a step with no issue", () => {
    expect(stepIssueCount([], step)).toBe(0);
  });
});

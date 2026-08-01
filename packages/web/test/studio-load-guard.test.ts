import { describe, expect, it } from "bun:test";
import { checkDraftShape } from "../src/areas/studio/draft/load-guard.js";

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

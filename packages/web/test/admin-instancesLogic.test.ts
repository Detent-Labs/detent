import { describe, expect, it } from "bun:test";
import { EMPTY_INSTANCE_FILTER, toListParams, labelText } from "../src/areas/admin/screens/instancesLogic.js";

describe("toListParams", () => {
  it("omits empty filter fields entirely, rather than sending them as empty strings", () => {
    expect(toListParams(EMPTY_INSTANCE_FILTER, 50)).toEqual({
      processId: undefined,
      status: undefined,
      currentStepId: undefined,
      startedBy: undefined,
      claimedBy: undefined,
      limit: 50,
      cursor: undefined,
    });
  });

  it("carries through set filter fields, limit and cursor", () => {
    const filter = { processId: "proc_a", status: "running", currentStepId: "step_a", startedBy: "user_1", claimedBy: "user_2" };
    expect(toListParams(filter, 25, "cursor_x")).toEqual({
      processId: "proc_a",
      status: "running",
      currentStepId: "step_a",
      startedBy: "user_1",
      claimedBy: "user_2",
      limit: 25,
      cursor: "cursor_x",
    });
  });
});

describe("labelText", () => {
  it("resolves the baseLocale entry", () => {
    expect(labelText({ en: "Expense Approval", de: "Spesenfreigabe" }, "en")).toBe("Expense Approval");
  });

  it("falls back to whatever entry exists when baseLocale is absent", () => {
    expect(labelText({ de: "Spesenfreigabe" }, "en")).toBe("Spesenfreigabe");
  });

  it("returns an empty string for a completely empty map", () => {
    expect(labelText({}, "en")).toBe("");
  });
});

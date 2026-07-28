import { describe, expect, it } from "bun:test";
import { selectVersion, canDiff, diffJson } from "../src/screens/versionDiffLogic.js";

describe("selectVersion / canDiff", () => {
  it("starts with neither side chosen", () => {
    expect(canDiff({})).toBe(false);
  });

  it("is not diffable with only one side chosen", () => {
    expect(canDiff(selectVersion({}, "a", 1))).toBe(false);
  });

  it("is not diffable when both sides are the same version", () => {
    let s = selectVersion({}, "a", 2);
    s = selectVersion(s, "b", 2);
    expect(canDiff(s)).toBe(false);
  });

  it("is diffable once both sides are chosen and distinct", () => {
    let s = selectVersion({}, "a", 1);
    s = selectVersion(s, "b", 2);
    expect(canDiff(s)).toBe(true);
  });

  it("re-selecting a side replaces it", () => {
    let s = selectVersion({}, "a", 1);
    s = selectVersion(s, "a", 3);
    expect(s).toEqual({ a: 3 });
  });
});

describe("diffJson", () => {
  it("reports no differences for identical values", () => {
    expect(diffJson({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([]);
  });

  it("reports an added key", () => {
    expect(diffJson({ a: 1 }, { a: 1, b: 2 })).toEqual([{ path: "b", kind: "added", to: 2 }]);
  });

  it("reports a removed key", () => {
    expect(diffJson({ a: 1, b: 2 }, { a: 1 })).toEqual([{ path: "b", kind: "removed", from: 2 }]);
  });

  it("reports a changed leaf with its path", () => {
    expect(diffJson({ a: 1 }, { a: 2 })).toEqual([{ path: "a", kind: "changed", from: 1, to: 2 }]);
  });

  it("recurses into nested objects", () => {
    const a = { workflow: { steps: [{ id: "step_a" }] } };
    const b = { workflow: { steps: [{ id: "step_b" }] } };
    expect(diffJson(a, b)).toEqual([{ path: "workflow.steps", kind: "changed", from: [{ id: "step_a" }], to: [{ id: "step_b" }] }]);
  });

  it("reports the whole root as changed when the top-level shape differs", () => {
    expect(diffJson("a", 1)).toEqual([{ path: "(root)", kind: "changed", from: "a", to: 1 }]);
  });
});

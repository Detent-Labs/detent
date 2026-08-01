import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { type ProcessBody } from "workflow-engine/schema";
import { compileProcessBody } from "workflow-engine/schema/compile";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { selectVersion, canDiff, diffJson } from "../src/areas/studio/screens/versionDiffLogic.js";

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

describe("diffJson key order", () => {
  // A draft read back from a jsonb column arrives in Postgres's normalized key
  // order; a published body in processBody.parse's schema order. definitionHash
  // says those are the same body, so the diff must say so too.
  it("reports no change when only key order differs inside an array", () => {
    const a = { fields: [{ id: "f1", key: "amount", type: "number", label: { en: "Amount" } }] };
    const b = { fields: [{ id: "f1", key: "amount", label: { en: "Amount" }, type: "number" }] };
    expect(diffJson(a, b)).toEqual([]);
  });

  it("reports no change when only key order differs at the root", () => {
    expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it("still reports a real change inside an array", () => {
    const a = { fields: [{ id: "f1", type: "number" }] };
    const b = { fields: [{ id: "f1", type: "string" }] };
    expect(diffJson(a, b).map((d) => d.path)).toEqual(["fields"]);
  });

  it("still reports array order as a change", () => {
    // Element order is meaningful in a ProcessBody (view order, path priority),
    // so canonical JSON keeps arrays in order and so does this.
    expect(diffJson({ xs: [1, 2] }, { xs: [2, 1] }).map((d) => d.path)).toEqual(["xs"]);
  });
});

describe("a draft diffed against the authored shape of its base", () => {
  const example = () => {
    const raw = JSON.parse(readFileSync(new URL("../../../examples/subprocess-credit-check-child.json", import.meta.url), "utf-8"));
    return (raw.definition ?? raw) as ProcessBody;
  };

  it("reports no differences for an unmodified seeded draft", () => {
    // The draft the seeding path stores, against the base the Versions screen
    // strips. This is the property that agrees with publishing it being a
    // hash no-op.
    const compiled = compileProcessBody(example());
    const seeded = stripCompiledContent(compiled);
    expect(diffJson(seeded, stripCompiledContent(compiled))).toEqual([]);
  });

  it("reports the author's change alone, with no cancel sink and no reserved outcome", () => {
    const compiled = compileProcessBody(example());
    const seeded = stripCompiledContent(compiled) as ProcessBody;
    const changed = { ...seeded, label: { ...seeded.label, en: "Changed" } };

    const entries = diffJson(changed, stripCompiledContent(compiled));

    expect(entries.map((e) => e.path)).toEqual(["label.en"]);
    expect(JSON.stringify(entries)).not.toContain("cancel_sink");
    expect(JSON.stringify(entries)).not.toContain("cancelled");
  });

  it("would report the cancel sink if the base were not stripped", () => {
    // Why the strip exists: the same comparison against the raw compiled body.
    const compiled = compileProcessBody(example());
    const paths = diffJson(stripCompiledContent(compiled), compiled).map((e) => e.path);
    expect(paths).toContain("workflow.steps");
    expect(paths).toContain("contract.outcomes");
  });
});

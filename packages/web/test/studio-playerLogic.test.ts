import { describe, expect, it } from "bun:test";
import { describeRecordElement } from "../src/api/record.js";
import { seedFormValues } from "../src/areas/studio/screens/playerLogic.js";
import type { InstanceRecordElement } from "../src/areas/studio/api/types.js";

describe("describeRecordElement", () => {
  it("summarizes a transition with its cause, path, and step change", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "manual", pathId: "path_ab", fromStepId: "step_a", toStepId: "step_b" },
    } as unknown as InstanceRecordElement;
    const d = describeRecordElement(el);
    expect(d.at).toBe("2026-01-01T00:00:00.000Z");
    expect(d.summary).toBe("transition — manual via path_ab — step_a → step_b");
  });

  it("renders (start) for a transition with no fromStepId", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "manual", toStepId: "step_a" },
    } as unknown as InstanceRecordElement;
    expect(describeRecordElement(el).summary).toBe("transition — manual — (start) → step_a");
  });

  it("omits the path segment when a transition has no pathId", () => {
    const el = {
      kind: "transition",
      entry: { at: "2026-01-01T00:00:00.000Z", cause: "timer", fromStepId: "step_a", toStepId: "step_b" },
    } as unknown as InstanceRecordElement;
    expect(describeRecordElement(el).summary).toBe("transition — timer — step_a → step_b");
  });

  it("summarizes an event with its kind", () => {
    const el = { kind: "event", event: { at: "2026-01-01T00:00:01.000Z", kind: "timer.fired" } } as unknown as InstanceRecordElement;
    const d = describeRecordElement(el);
    expect(d.at).toBe("2026-01-01T00:00:01.000Z");
    expect(d.summary).toBe("event — timer.fired");
  });
});

describe("seedFormValues", () => {
  it("keys each field's value by the field's id", () => {
    const fields = [
      { field: { id: "field_a" }, value: 1 },
      { field: { id: "field_b" }, value: "x" },
    ];
    expect(seedFormValues(fields)).toEqual({ field_a: 1, field_b: "x" });
  });

  it("returns an empty object for no fields", () => {
    expect(seedFormValues([])).toEqual({});
  });
});

import { describe, expect, it } from "bun:test";
import { isDirty } from "../src/areas/studio/screens/publishGateLogic.js";

describe("isDirty", () => {
  it("is false for the identical object", () => {
    const body = { key: "wf", fields: [] };
    expect(isDirty(body, body)).toBe(false);
  });

  it("is false for structurally equal but distinct objects", () => {
    expect(isDirty({ key: "wf", fields: [] }, { key: "wf", fields: [] })).toBe(false);
  });

  it("is true when a top-level field differs", () => {
    expect(isDirty({ key: "wf2" }, { key: "wf" })).toBe(true);
  });

  it("is true when a nested value differs", () => {
    const a = { workflow: { steps: [{ id: "step_a" }] } };
    const b = { workflow: { steps: [{ id: "step_b" }] } };
    expect(isDirty(a, b)).toBe(true);
  });
});

import { describe, expect, it } from "bun:test";
import { checkConnection } from "../src/areas/studio/canvas/connection.js";

describe("canvas connection validity", () => {
  it("accepts a manual candidate when the step has no paths yet", () => {
    expect(checkConnection([], "manual")).toEqual({ ok: true });
  });

  it("accepts a manual candidate alongside existing manual paths", () => {
    expect(checkConnection([{ trigger: "manual" }], "manual")).toEqual({ ok: true });
  });

  it("rejects a manual candidate on a step whose existing paths are automatic", () => {
    const result = checkConnection([{ trigger: "automatic" }], "manual");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("a step's paths must be all-manual or all-automatic, not mixed");
  });

  it("rejects an automatic candidate on a step whose existing paths are manual", () => {
    const result = checkConnection([{ trigger: "manual" }], "automatic");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("a step's paths must be all-manual or all-automatic, not mixed");
  });

  it("accepts the first automatic candidate on a step with no paths yet", () => {
    expect(checkConnection([], "automatic")).toEqual({ ok: true });
  });

  it("rejects a second automatic candidate that would lack a priority", () => {
    // checkConnection only carries a trigger for the candidate (no guard/priority
    // yet — those are set afterwards in PathsPanel), so a second automatic path
    // is correctly rejected here the same way the engine rejects it at publish.
    const result = checkConnection([{ trigger: "automatic", priority: 1 }], "automatic");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("automatic paths need a priority when a step has two or more");
  });
});

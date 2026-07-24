import { describe, expect, it } from "bun:test";
import { computeFitTransform } from "../src/graph/GraphView";

describe("computeFitTransform", () => {
  it("scales down a diagram wider than the container, fit by width", () => {
    const fit = computeFitTransform(1000, 100, 500, 500);
    expect(fit?.scale).toBeCloseTo(0.5);
  });

  it("scales down a diagram taller than the container, fit by height (the vertical-clipping case)", () => {
    const fit = computeFitTransform(200, 1000, 500, 500);
    expect(fit?.scale).toBeCloseTo(0.5);
  });

  it("never scales up a diagram smaller than the container", () => {
    const fit = computeFitTransform(100, 50, 500, 500);
    expect(fit?.scale).toBe(1);
  });

  it("centers the scaled diagram within the container", () => {
    const fit = computeFitTransform(1000, 100, 500, 500);
    // scale 0.5 -> content renders at 500x50; centered within a 500x500 container
    expect(fit?.x).toBeCloseTo(0);
    expect(fit?.y).toBeCloseTo(225);
  });

  it("returns null for a zero-size diagram or container, so the caller falls back to reset()", () => {
    expect(computeFitTransform(0, 0, 500, 500)).toBeNull();
    expect(computeFitTransform(100, 100, 0, 0)).toBeNull();
  });
});

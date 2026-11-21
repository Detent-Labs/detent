import { describe, expect, it } from "bun:test";
import { endHandlesOf } from "../src/areas/studio/canvas/EndHandle.js";

const positions = { step_a: { x: 0, y: 0 }, step_b: { x: 240, y: 0 } };

describe("endHandlesOf", () => {
  it("returns a handle at the route's first and last point, excluding nothing", () => {
    const handles = endHandlesOf({
      pathId: "path_1",
      sourceId: "step_a",
      targetId: "step_b",
      route: [{ x: 180, y: 30 }, { x: 240, y: 30 }],
      positions,
      hidden: new Set(),
    });
    expect(handles).toEqual([
      { pathId: "path_1", end: "source", stepId: "step_a", anchor: { x: 180, y: 30 }, exclude: undefined },
      { pathId: "path_1", end: "target", stepId: "step_b", anchor: { x: 240, y: 30 }, exclude: undefined },
    ]);
  });

  it("returns no handle for an end on a hidden step", () => {
    const handles = endHandlesOf({
      pathId: "path_1",
      sourceId: "step_a",
      targetId: "step_b",
      route: [{ x: 180, y: 30 }, { x: 240, y: 30 }],
      positions,
      hidden: new Set(["step_b"]),
    });
    expect(handles.map((h) => h.end)).toEqual(["source"]);
  });

  it("makes each end of a self path exclude the point the other end holds", () => {
    const handles = endHandlesOf({
      pathId: "path_1",
      sourceId: "step_a",
      targetId: "step_a",
      route: [{ x: 180, y: 30 }, { x: 180, y: 50 }, { x: 90, y: 0 }],
      positions,
      hidden: new Set(),
    });
    expect(handles[0].exclude).toEqual({ side: "top", at: 0 });
    expect(handles[1].exclude).toEqual({ side: "right", at: 0 });
  });
});
